/**
 * newsConfig.js - Central configuration for the news collection layer.
 *
 * Everything the scraping/provider stack needs is defined here so that the
 * pipeline itself carries no hard-coded browsing behaviour. Values can be
 * overridden via environment variables where it makes sense for ops.
 *
 * Nothing in here imports business logic - it is pure data + tiny helpers.
 */

const num = (envVal, fallback) => {
  const n = Number(envVal);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

/**
 * Approved newspaper sources. This list is the ONLY set of domains the
 * scraper is ever allowed to visit (see `allowedDomains`). Adding a new
 * newspaper is a data change here, never a code change.
 *
 * searchUrlTemplate: `{query}` is replaced with the URL-encoded topic.
 * homepage:          used as the "open homepage" step.
 * domains:           every host (and sub-host) the scraper may follow.
 * premium:           mirrors the relevance-scoring premium list downstream.
 */
const SOURCES = [
  {
    id: "reuters",
    name: "Reuters",
    homepage: "https://www.reuters.com/",
    searchUrlTemplate: "https://www.reuters.com/site-search/?query={query}",
    domains: ["reuters.com"],
    premium: false,
  },
  {
    id: "bbc",
    name: "BBC",
    homepage: "https://www.bbc.com/news",
    searchUrlTemplate: "https://www.bbc.co.uk/search?q={query}&d=news_gnl",
    domains: ["bbc.com", "bbc.co.uk"],
    premium: false,
  },
  {
    id: "the-hindu",
    name: "The Hindu",
    homepage: "https://www.thehindu.com/",
    searchUrlTemplate: "https://www.thehindu.com/search/?q={query}",
    domains: ["thehindu.com"],
    premium: true,
  },
  {
    id: "indian-express",
    name: "Indian Express",
    homepage: "https://indianexpress.com/",
    searchUrlTemplate: "https://indianexpress.com/?s={query}",
    domains: ["indianexpress.com"],
    premium: true,
  },
  {
    id: "times-of-india",
    name: "Times of India",
    homepage: "https://timesofindia.indiatimes.com/",
    searchUrlTemplate: "https://timesofindia.indiatimes.com/topic/{query}",
    domains: ["timesofindia.indiatimes.com", "indiatimes.com"],
    premium: false,
  },
  {
    id: "hindustan-times",
    name: "Hindustan Times",
    homepage: "https://www.hindustantimes.com/",
    searchUrlTemplate: "https://www.hindustantimes.com/search?q={query}",
    domains: ["hindustantimes.com"],
    premium: false,
  },
  {
    id: "pib",
    name: "PIB",
    homepage: "https://pib.gov.in/",
    // ponytail: PIB has no clean public search endpoint; the "all releases"
    // page is the best generic entry point. Upgrade path = a dedicated PIB
    // extractor strategy keyed on ministry/date filters.
    searchUrlTemplate: "https://pib.gov.in/PressReleaseIframePage.aspx?PRID={query}",
    domains: ["pib.gov.in"],
    premium: true,
  },
  {
    id: "economic-times",
    name: "Economic Times",
    homepage: "https://economictimes.indiatimes.com/",
    searchUrlTemplate: "https://economictimes.indiatimes.com/topic/{query}",
    domains: ["economictimes.indiatimes.com", "indiatimes.com"],
    premium: true,
  },
  {
    id: "business-standard",
    name: "Business Standard",
    homepage: "https://www.business-standard.com/",
    searchUrlTemplate: "https://www.business-standard.com/search?q={query}",
    domains: ["business-standard.com"],
    premium: true,
  },
  {
    id: "livemint",
    name: "Livemint",
    homepage: "https://www.livemint.com/",
    searchUrlTemplate: "https://www.livemint.com/searchlisting/?query={query}",
    domains: ["livemint.com"],
    premium: true,
  },
];

/**
 * RSS / Atom feeds for the default (production) provider.
 *
 * Feeds are machine-readable by design: no bot detection, no headless browser,
 * legal to consume. Two kinds:
 *   - type "search":  `{query}` in urlTemplate is replaced with the topic, so
 *                     the feed itself is topic-scoped (Google News search RSS).
 *   - type "section": a fixed feed of latest items; we topic-filter client-side.
 *
 * Adding a source is a data change here, never a code change.
 */
const FEEDS = [
  {
    id: "google-news",
    name: "Google News (India)",
    type: "search",
    urlTemplate: "https://news.google.com/rss/search?q={query}%20when:2d&hl=en-IN&gl=IN&ceid=IN:en",
    premium: false,
  },
  {
    id: "the-hindu",
    name: "The Hindu",
    type: "section",
    url: "https://www.thehindu.com/news/national/feeder/default.rss",
    premium: true,
  },
  {
    id: "indian-express",
    name: "Indian Express",
    type: "search",
    // ponytail: IE's direct WordPress feed 403s from datacenter IPs, so we
    // scope Google News to its domain. Upgrade path = direct feed when running
    // from an IP it doesn't block (feed carries fuller <content:encoded>).
    urlTemplate: "https://news.google.com/rss/search?q=site:indianexpress.com%20{query}%20when:2d&hl=en-IN&gl=IN&ceid=IN:en",
    premium: true,
  },
  {
    id: "livemint",
    name: "Livemint",
    type: "section",
    url: "https://www.livemint.com/rss/news",
    premium: true,
  },
  {
    id: "pib",
    name: "PIB",
    type: "search",
    // ponytail: PIB's own RSS is unreliable, so we scope Google News to its
    // domain. Upgrade path = PIB's official RSS once a stable endpoint exists.
    urlTemplate: "https://news.google.com/rss/search?q=site:pib.gov.in%20{query}%20when:3d&hl=en-IN&gl=IN&ceid=IN:en",
    premium: true,
  },
];

/** Build a feed URL for a topic (search feeds) or return the fixed url. */
function buildFeedUrl(feed, topic) {
  if (feed.urlTemplate) {
    return feed.urlTemplate.replace("{query}", encodeURIComponent(String(topic || "").trim()));
  }
  return feed.url;
}

/** Look up a feed descriptor by id or display name (case-insensitive). */
function resolveFeed(idOrName) {
  const key = String(idOrName || "").trim().toLowerCase();
  return FEEDS.find((f) => f.id === key || f.name.toLowerCase() === key) || null;
}

/** Flat set of every host the scraper may visit. */
const allowedDomains = Array.from(new Set(SOURCES.flatMap((s) => s.domains)));

/** Build a search URL for a source + topic. */
function buildSearchUrl(source, topic) {
  return source.searchUrlTemplate.replace("{query}", encodeURIComponent(String(topic || "").trim()));
}

/** Look up a source descriptor by id or display name (case-insensitive). */
function resolveSource(idOrName) {
  const key = String(idOrName || "").trim().toLowerCase();
  return SOURCES.find((s) => s.id === key || s.name.toLowerCase() === key) || null;
}

/**
 * Is a URL allowed? Only http(s) URLs whose host matches an approved domain
 * (exact host or a sub-domain of one) pass. Everything else is rejected.
 */
function isAllowedUrl(rawUrl) {
  let u;
  try {
    u = new URL(String(rawUrl));
  } catch {
    return false;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  const host = u.hostname.toLowerCase();
  return allowedDomains.some((d) => host === d || host.endsWith(`.${d}`));
}

const NEWS_CONFIG = {
  sources: SOURCES,
  allowedDomains,

  // Which provider backs the scrape_news tool. "rss" (default) reads machine-
  // readable feeds and never opens a browser; "chrome-mcp" drives real Chrome
  // (heavy, blocked by anti-bot on premium sites - keep for local experiments).
  provider: (process.env.NEWS_PROVIDER || "rss").toLowerCase(),

  // RSS provider settings.
  rss: {
    feeds: FEEDS,
    userAgent:
      process.env.NEWS_HTTP_USER_AGENT ||
      "Mozilla/5.0 (compatible; WhatsNewBot/1.0; +https://github.com/whats-new)",
    // Fetch each article page to enrich thin feed summaries into real bodies.
    enrichBody: process.env.NEWS_RSS_ENRICH ? process.env.NEWS_RSS_ENRICH !== "false" : true,
    // Feed summaries are legitimately short, so allow a lower floor than the
    // browser path (which extracts full article text).
    minBodyChars: num(process.env.NEWS_RSS_MIN_BODY_CHARS, 140),
    fetchTimeoutMs: num(process.env.NEWS_RSS_FETCH_TIMEOUT_MS, 12_000),
  },

  // Timeouts (ms)
  browserTimeoutMs: num(process.env.NEWS_BROWSER_TIMEOUT_MS, 60_000),
  pageTimeoutMs: num(process.env.NEWS_PAGE_TIMEOUT_MS, 20_000),

  // Parallelism + resilience
  concurrency: num(process.env.NEWS_CONCURRENCY, 3),
  retryCount: num(process.env.NEWS_RETRY_COUNT, 2),
  retryBaseDelayMs: num(process.env.NEWS_RETRY_BASE_DELAY_MS, 1_000),

  // Caching
  cacheTtlMs: num(process.env.NEWS_CACHE_TTL_MS, 15 * 60 * 1000),

  // Collection knobs
  articlesPerSource: num(process.env.NEWS_ARTICLES_PER_SOURCE, 5),
  maxAgeHours: num(process.env.NEWS_MAX_AGE_HOURS, 24),
  // Fallback topic used when Gemini does not choose one via the scrape_news tool.
  defaultTopic: process.env.NEWS_DEFAULT_TOPIC || "India policy governance economy",
  minBodyChars: num(process.env.NEWS_MIN_BODY_CHARS, 250),
  maxBodyChars: num(process.env.NEWS_MAX_BODY_CHARS, 20_000),

  // Chrome MCP transport. The backend decides HOW browsing happens; this is
  // the command that launches the Chrome MCP server we act as a client to.
  chromeMcp: {
    command: process.env.CHROME_MCP_COMMAND || "npx",
    args: process.env.CHROME_MCP_ARGS
      ? process.env.CHROME_MCP_ARGS.split(" ").filter(Boolean)
      : ["-y", "chrome-devtools-mcp@latest"],
    // Tool names on the MCP server. Kept in config because they differ
    // between Chrome MCP implementations (chrome-devtools-mcp vs others).
    tools: {
      newPage: process.env.CHROME_MCP_TOOL_NEW_PAGE || "new_page",
      navigate: process.env.CHROME_MCP_TOOL_NAVIGATE || "navigate_page",
      evaluate: process.env.CHROME_MCP_TOOL_EVALUATE || "evaluate_script",
      waitFor: process.env.CHROME_MCP_TOOL_WAIT_FOR || "wait_for",
      listPages: process.env.CHROME_MCP_TOOL_LIST_PAGES || "list_pages",
      closePage: process.env.CHROME_MCP_TOOL_CLOSE_PAGE || "close_page",
    },
  },

  buildSearchUrl,
  resolveSource,
  isAllowedUrl,
  buildFeedUrl,
  resolveFeed,
};

module.exports = NEWS_CONFIG;
