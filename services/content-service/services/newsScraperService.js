/**
 * newsScraperService.js - Collect articles for a topic from approved sources.
 *
 * Input:  { topic, sources, articlesPerSource, maxAgeHours }
 * Output: [{ title, url, source, publishedAt, author, category, image, content }]
 *
 * This is the ONLY place that knows the browsing recipe (open homepage/search,
 * find newest links, open them, extract fields). It drives the browser through
 * chromeMcpService (injected, so it is unit-testable with a fake browser) and
 * uses bounded concurrency + retries so one failing newspaper never aborts the
 * run. It returns raw articles; dedup/quality/cache live in the provider.
 */

const config = require("../config/newsConfig");
const logger = require("../utils/logger");
const { mapLimit, withRetry } = require("../utils/concurrency");

// --- In-page extraction scripts (run in the UNTRUSTED page context) ----------

// Collect candidate links (href + anchor text). Backend filters by domain.
const LINK_SCRIPT = `() => {
  const out = [];
  const seen = new Set();
  for (const a of Array.from(document.querySelectorAll('a[href]'))) {
    const href = a.href;
    const text = (a.textContent || '').trim();
    if (!href || seen.has(href)) continue;
    if (text.length < 15) continue;
    seen.add(href);
    out.push({ url: href, title: text });
  }
  return JSON.stringify(out.slice(0, 60));
}`;

// Extract one article. Prefers structured metadata; ignores nav/ads/comments
// by reading <article>/<main> paragraphs.
const EXTRACT_SCRIPT = `() => {
  const meta = (sel, attr) => { const el = document.querySelector(sel); return el ? (el.getAttribute(attr) || '').trim() : ''; };
  const root = document.querySelector('article') || document.querySelector('main') || document.body;
  const ps = Array.from(root.querySelectorAll('p')).map(p => (p.textContent || '').trim()).filter(t => t.length > 40);
  const data = {
    title: (document.querySelector('h1') && document.querySelector('h1').textContent.trim()) || meta('meta[property="og:title"]','content') || document.title || '',
    subtitle: meta('meta[name="description"]','content') || meta('meta[property="og:description"]','content'),
    author: meta('meta[name="author"]','content') || meta('meta[property="article:author"]','content'),
    publishedAt: meta('meta[property="article:published_time"]','content') || meta('meta[name="pubdate"]','content') || (document.querySelector('time[datetime]') && document.querySelector('time[datetime]').getAttribute('datetime')) || '',
    updatedAt: meta('meta[property="article:modified_time"]','content'),
    category: meta('meta[property="article:section"]','content') || meta('meta[name="section"]','content'),
    image: meta('meta[property="og:image"]','content'),
    content: ps.join('\\n\\n'),
    url: location.href
  };
  return JSON.stringify(data);
}`;

class NewsScraperService {
  constructor(browser, cfg = config, deps = {}) {
    if (!browser) throw new Error("NewsScraperService requires a browser (chromeMcpService)");
    this.browser = browser;
    this.cfg = cfg;
    this.log = deps.logger || logger;
  }

  /**
   * @param {{topic:string, sources?:string[], articlesPerSource?:number}} request
   * @returns {Promise<Array<object>>}
   */
  async collect(request = {}) {
    const topic = String(request.topic || "").trim();
    if (!topic) throw new Error("scrape: topic is required");

    const perSource = request.articlesPerSource || this.cfg.articlesPerSource;
    const sources = this._resolveSources(request.sources);

    const results = await mapLimit(sources, this.cfg.concurrency, (source) =>
      withRetry(() => this._scrapeSource(source, topic, perSource), {
        retries: this.cfg.retryCount,
        baseDelayMs: this.cfg.retryBaseDelayMs,
        onRetry: (attempt, err) =>
          this.log.warn("scrape.source.retry", { source: source.name, attempt, error: err?.message }),
      })
    );

    const articles = [];
    for (const r of results) {
      if (r.status === "fulfilled") articles.push(...r.value);
      else this.log.error("scrape.source.failed", { source: r.item.name, error: r.reason?.message });
    }
    this.log.info("scrape.collect.done", { topic, sources: sources.length, articles: articles.length });
    return articles;
  }

  _resolveSources(requested) {
    if (!requested || requested.length === 0) return this.cfg.sources;
    return requested.map((s) => this.cfg.resolveSource(s)).filter(Boolean);
  }

  async _scrapeSource(source, topic, perSource) {
    return this.log.timed("scrape.source", { source: source.name }, async () => {
      const searchUrl = this.cfg.buildSearchUrl(source, topic);
      await this.browser.navigate(searchUrl);
      await this.browser.waitFor().catch(() => {});

      const rawLinks = normalizeLinks(await this.browser.evaluate(LINK_SCRIPT));
      const links = rawLinks
        .filter((l) => this.cfg.isAllowedUrl(l.url))
        .filter((l) => source.domains.some((d) => hostMatches(l.url, d)))
        .slice(0, perSource);

      this.log.info("scrape.source.links", { source: source.name, found: rawLinks.length, kept: links.length });

      const articles = [];
      for (const link of links) {
        try {
          const article = await this._scrapeArticle(source, link.url);
          if (article) articles.push(article);
        } catch (err) {
          this.log.warn("scrape.article.failed", { source: source.name, url: link.url, error: err?.message });
        }
      }
      return articles;
    });
  }

  async _scrapeArticle(source, url) {
    await this.browser.navigate(url);
    await this.browser.waitFor().catch(() => {});
    const raw = await this.browser.evaluate(EXTRACT_SCRIPT);
    const data = typeof raw === "string" ? safeParse(raw) : raw;
    if (!data || !data.title) return null;

    return {
      title: String(data.title || "").trim(),
      url: data.url || url,
      source: source.name,
      publishedAt: data.publishedAt || "",
      author: data.author || "",
      category: data.category || "",
      image: data.image || "",
      content: String(data.content || "").trim(),
    };
  }
}

function safeParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function normalizeLinks(value) {
  const arr = typeof value === "string" ? safeParse(value) : value;
  return Array.isArray(arr) ? arr.filter((l) => l && l.url) : [];
}

function hostMatches(url, domain) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === domain || host.endsWith(`.${domain}`);
  } catch {
    return false;
  }
}

module.exports = NewsScraperService;
