# News Collection Architecture (Gemini + pluggable providers)

This document describes the news-collection layer that replaced the old
"ask Gemini to invent today's news" approach, and how to extend it.

## Providers (how news is actually fetched)

Gemini calls one tool (`scrape_news`); a **NewsProvider** decides how the news
is obtained. Two are implemented:

| Provider | `NEWS_PROVIDER` | Use it for |
| --- | --- | --- |
| **RSSNewsProvider** (default) | `rss` | Production. Reads machine-readable RSS/Atom feeds (Google News search, The Hindu, Indian Express, Livemint, PIB). No browser, low latency, legal, and **not bot-blocked**. |
| ChromeMCPNewsProvider | `chrome-mcp` | Local experiments only. Drives a real headless Chrome. Heavy (~hundreds of MB/instance) and **blocked by anti-bot systems** (Cloudflare/DataDome) on premium sites, especially from datacenter IPs. |

Why RSS is the default: browser automation against premium news sites triggers
"unusual/automated activity" blocks (HTTP 403) and is an unwinnable arms race
for a project like this. Feeds are built to be read by machines, so they are the
right tool. Switching providers is a one-line env change; nothing downstream
(dedup, quality, Gemini enrichment, images, Mongo) changes.

## Why this changed

`fetchTop5News_Prod()` used to prompt Gemini for "today's top UPSC news".
Gemini would hallucinate articles, invent URLs and dates, and mix old with new
events. **Gemini now never invents current news.** It only decides *when* news
is needed and calls a tool; the backend decides *how* browsing happens.

## Flow

```
User / cron request
      │
      ▼
runContentPipeline("prod")
      │
      ▼
fetchTop5News_Prod()  ──►  geminiTools.collectNews()
                                 │
                                 ▼
                    Gemini decides it needs news
                                 │
                                 ▼
                    Gemini calls the scrape_news tool
                                 │
                                 ▼
              ChromeMCPNewsProvider.collect()
                    │        │            │
             cache check   scrape      dedup + quality filter
                                 │
                                 ▼
              newsScraperService (browsing recipe)
                                 │
                                 ▼
              chromeMcpService  ──►  Chrome MCP server ──► real newspaper sites
                                 │
                                 ▼
        structured articles [{title,url,source,publishedAt,author,category,image,content}]
                                 │
                                 ▼
   generateAndStoreContent()  ── UNCHANGED: relevance, Gemini enrichment,
                                  Unsplash images, MCQs, mains, flowcharts, Mongo
```

Everything **after** article collection is exactly as before. The provider maps
its canonical article shape back to the legacy item shape inside
`mapProviderArticleToNewsItem()` so downstream code is untouched.

## Components

| File | Responsibility |
| --- | --- |
| `config/newsConfig.js` | All configuration: approved sources + domain allowlist, timeouts, concurrency, retries, cache TTL, max age, articles/source, Chrome MCP transport. No logic. |
| `utils/logger.js` | Structured JSON logging. Redacts article bodies — content is never logged. |
| `utils/concurrency.js` | `mapLimit` (bounded parallel, never aborts on one failure) + `withRetry` (exponential backoff). |
| `providers/NewsProvider.js` | Abstract provider contract the pipeline depends on. |
| `providers/RSSNewsProvider.js` | **Default.** Cache → fetch feeds (parallel + retried) → topic-filter → optional body enrichment → dedup → quality-filter. No browser. |
| `utils/rssParser.js` | Dependency-free RSS 2.0 / Atom parser (CDATA, entities, namespaced tags, enclosures). |
| `providers/ChromeMCPNewsProvider.js` | Opt-in. Cache → scrape → dedup → quality-filter; always disconnects the browser. |
| `services/chromeMcpService.js` | Thin Chrome MCP **client**: connect, open/navigate/evaluate/wait/close. Enforces the domain allowlist. No business logic. |
| `services/newsScraperService.js` | The browsing recipe: search each source, collect same-domain links, open newest, extract fields. Parallel + retried. |
| `services/dedupService.js` | Duplicate detection (URL, normalized title, similarity) + merge. |
| `services/qualityFilter.js` | Sanitizes untrusted HTML, neutralizes prompt injection, drops old/short/paywalled/missing articles. |
| `services/newsCache.js` | In-process TTL cache keyed by topic + sources. |
| `services/geminiTools.js` | The single `scrape_news` tool declaration, its handler, and the agentic `collectNews()` loop with a deterministic fallback. |

## Security

- **Domain allowlist:** `chromeMcpService` refuses to navigate to any URL that
  is not an approved newspaper domain (`config.isAllowedUrl`). Arbitrary URLs
  are rejected.
- **Untrusted content:** all extracted page text is treated as untrusted.
  `qualityFilter.sanitizeText()` strips scripts/tags/control chars, caps length,
  and neutralizes common prompt-injection phrases. Page text is always passed
  as *data*, never as instructions.
- **No secrets in logs:** the logger omits `content`/`body`/`html` fields.

## Configuration

All knobs live in `config/newsConfig.js` and can be overridden via env vars:

| Env var | Default | Meaning |
| --- | --- | --- |
| `NEWS_PROVIDER` | `rss` | Which provider backs `scrape_news` (`rss` or `chrome-mcp`) |
| `NEWS_RSS_ENRICH` | `true` | Fetch article pages to fill thin feed summaries |
| `NEWS_RSS_MIN_BODY_CHARS` | 140 | Min body length for RSS (feeds are legitimately short) |
| `NEWS_HTTP_USER_AGENT` | WhatsNewBot UA | User-Agent sent when fetching feeds/pages |
| `NEWS_BROWSER_TIMEOUT_MS` | 60000 | Browser/MCP connect timeout |
| `NEWS_PAGE_TIMEOUT_MS` | 20000 | Per-page wait timeout |
| `NEWS_CONCURRENCY` | 3 | Sources scraped in parallel |
| `NEWS_RETRY_COUNT` | 2 | Retries per source |
| `NEWS_RETRY_BASE_DELAY_MS` | 1000 | Backoff base delay |
| `NEWS_CACHE_TTL_MS` | 900000 | Scrape cache TTL (15 min) |
| `NEWS_ARTICLES_PER_SOURCE` | 5 | Max articles per source |
| `NEWS_MAX_AGE_HOURS` | 24 | Discard articles older than this |
| `NEWS_MIN_BODY_CHARS` | 250 | Minimum body length |
| `NEWS_MAX_BODY_CHARS` | 20000 | Body truncation cap |
| `NEWS_DEFAULT_TOPIC` | "India policy governance economy" | Fallback topic when Gemini picks none |
| `CHROME_MCP_COMMAND` | `npx` | Command that launches the Chrome MCP server |
| `CHROME_MCP_ARGS` | `-y chrome-devtools-mcp@latest` | Args for that command |
| `CHROME_MCP_TOOL_*` | see config | Tool-name overrides (MCP servers differ) |

Approved sources (Reuters, BBC, The Hindu, Indian Express, Times of India,
Hindustan Times, PIB, Economic Times, Business Standard, Livemint) are defined
as data in `SOURCES`. Add or remove a newspaper by editing that array — no code
changes required.

## Extending with new providers

The pipeline depends only on `NewsProvider`. RSS and Chrome MCP already ship; to
add another source type (NewsData.io/GNews API, X/Twitter, Reddit, YouTube
transcripts, PDF reports), subclass `NewsProvider` and implement `collect()`
returning the canonical article shape:

```js
const NewsProvider = require("./NewsProvider");

class NewsApiProvider extends NewsProvider {
  constructor() { super("newsapi"); }
  async collect({ topic, sources, articlesPerSource, maxAgeHours }) {
    // call the API, return [{title,url,source,publishedAt,author,category,image,content}]
  }
}
```

Then register it in `geminiTools.defaultProvider()` (keyed on `cfg.provider`), or
pass it directly via `collectNews({ provider })`.

Then either pass it into `fetchTop5News_Prod({ provider })` /
`collectNews({ provider })`, or compose several providers behind a router
provider. Nothing downstream of collection needs to change.

Because `collectNews()` accepts injected `provider` and `model`, you can also
swap the collection strategy per environment or per request without touching the
pipeline.

## Running tests

```bash
cd services/content-service
npm test            # runs node --test over test/
```

The new modules are stdlib-only (or lazy-load heavy deps), so the unit tests run
without installing Puppeteer/Mongo/Gemini and without any network access.
