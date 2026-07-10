/**
 * RSSNewsProvider.js - Default (production) NewsProvider backed by RSS/Atom.
 *
 * Why this is the default instead of Chrome MCP: feeds are built to be read by
 * machines. No headless browser, no bot-detection blocks, low latency, legal.
 * It implements the exact same collect() contract, so nothing downstream (the
 * scrape_news tool, Gemini, dedup, image gen, Mongo) changes.
 *
 * Pipeline calls collect(); this provider:
 *   1. checks the TTL cache
 *   2. fetches each configured feed in parallel (with retries)
 *   3. parses items -> canonical articles, topic-filtering fixed feeds
 *   4. optionally enriches thin summaries by fetching the article page
 *   5. deduplicates + merges, then quality-filters + sanitizes
 *   6. caches and returns canonical articles
 *
 * All I/O (fetch, parser) is injectable so unit tests run with no network.
 */

const NewsProvider = require("./NewsProvider");
const config = require("../config/newsConfig");
const logger = require("../utils/logger");
const NewsCache = require("../services/newsCache");
const dedupService = require("../services/dedupService");
const qualityFilter = require("../services/qualityFilter");
const rssParser = require("../utils/rssParser");
const { mapLimit, withRetry } = require("../utils/concurrency");

class RSSNewsProvider extends NewsProvider {
  constructor(cfg = config, deps = {}) {
    super("rss");
    this.cfg = cfg;
    this.rss = cfg.rss || {};
    this.log = deps.logger || logger;
    this.cache = deps.cache || new NewsCache({ ttlMs: cfg.cacheTtlMs });
    this.dedup = deps.dedup || dedupService;
    this.quality = deps.quality || qualityFilter;
    this.parseFeed = deps.parseFeed || rssParser.parseFeed;
    // Injectable HTTP seam. Defaults to the global fetch (Node >= 18).
    this.fetchImpl = deps.fetch || (typeof fetch === "function" ? fetch.bind(globalThis) : null);
  }

  async collect(request = {}) {
    const topic = String(request.topic || "").trim();
    if (!topic) throw new Error("collect: topic is required");
    if (!this.fetchImpl) throw new Error("RSSNewsProvider: no fetch available (need Node >= 18 or inject deps.fetch)");

    const feeds = this._selectFeeds(request.sources);
    const feedNames = feeds.map((f) => f.name);
    const maxAgeHours = request.maxAgeHours ?? this.cfg.maxAgeHours;
    const perSource = request.articlesPerSource || this.cfg.articlesPerSource;

    const cached = this.cache.get(topic, feedNames);
    if (cached) {
      this.log.info("provider.cache.hit", { provider: "rss", topic, count: cached.length });
      return cached;
    }

    const results = await mapLimit(feeds, this.cfg.concurrency, (feed) =>
      this._collectFeed(feed, topic, perSource),
    );
    const collected = [];
    for (const r of results) {
      if (r.status === "fulfilled") collected.push(...r.value);
      else this.log.warn("provider.feed.failed", { feed: r.item?.name, error: r.reason?.message });
    }

    if (this.rss.enrichBody) await this._enrichBodies(collected);

    const { articles: deduped, removed } = this.dedup.dedupe(collected);
    const { kept, dropped } = this.quality.apply(deduped, {
      maxAgeHours,
      minBodyChars: this.rss.minBodyChars ?? this.cfg.minBodyChars,
      maxBodyChars: this.cfg.maxBodyChars,
    });

    this.log.info("provider.collect.done", {
      provider: "rss",
      topic,
      feeds: feeds.length,
      collected: collected.length,
      dedupRemoved: removed,
      dropped: dropped.length,
      kept: kept.length,
    });

    this.cache.set(topic, feedNames, kept);
    return kept;
  }

  /** Resolve requested source names to feed descriptors (all feeds if none). */
  _selectFeeds(sources) {
    const all = this.rss.feeds || [];
    if (!sources || !sources.length) return all;
    const wanted = sources
      .map((s) => (this.cfg.resolveFeed ? this.cfg.resolveFeed(s) : null))
      .filter(Boolean);
    return wanted.length ? wanted : all;
  }

  async _collectFeed(feed, topic, perSource) {
    const url = this.cfg.buildFeedUrl(feed, topic);
    const xml = await withRetry(() => this._fetchText(url), {
      retries: this.cfg.retryCount,
      baseDelayMs: this.cfg.retryBaseDelayMs,
      onRetry: (n) => this.log.warn("provider.feed.retry", { feed: feed.name, attempt: n }),
    });

    let items = this.parseFeed(xml);
    // Fixed section feeds return latest headlines; keep only topic-relevant
    // ones. Search feeds are already scoped by the query.
    if (feed.type === "section") items = filterByTopic(items, topic);
    return items.slice(0, perSource).map((it) => this._toArticle(it, feed));
  }

  _toArticle(item, feed) {
    return {
      title: item.title,
      url: item.url,
      source: feed.name,
      publishedAt: toISO(item.publishedAt),
      author: item.author || "News Desk",
      category: item.category || "",
      image: item.image || "",
      // content is HTML/summary here; qualityFilter sanitizes to plain text.
      content: item.content || item.summary || "",
    };
  }

  /** Fetch article pages to turn thin summaries into fuller bodies. */
  async _enrichBodies(articles) {
    const thin = articles.filter(
      (a) => a && a.url && plainLen(a.content) < (this.rss.minBodyChars ?? 140) && isPublicHttpUrl(a.url),
    );
    if (!thin.length) return;
    await mapLimit(thin, this.cfg.concurrency, async (a) => {
      try {
        const html = await this._fetchText(a.url);
        const body = extractArticleText(html);
        if (plainLen(body) > plainLen(a.content)) a.content = body;
      } catch (err) {
        this.log.warn("provider.enrich.failed", { url: a.url, error: err?.message });
      }
    });
  }

  async _fetchText(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.rss.fetchTimeoutMs || 12_000);
    try {
      const res = await this.fetchImpl(url, {
        redirect: "follow",
        signal: controller.signal,
        headers: { "User-Agent": this.rss.userAgent, Accept: "application/rss+xml, application/xml, text/html;q=0.9, */*;q=0.8" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return await res.text();
    } finally {
      clearTimeout(timer);
    }
  }
}

/** ISO date string, defaulting to now for missing/unparseable dates. */
function toISO(dateStr) {
  const t = new Date(dateStr).getTime();
  return Number.isNaN(t) ? new Date().toISOString() : new Date(t).toISOString();
}

/** Approx plain-text length after stripping tags (for thin-body checks). */
function plainLen(htmlOrText) {
  return qualityFilter.stripHtml(htmlOrText).replace(/\s+/g, " ").trim().length;
}

/** Keep items whose title/content mention any significant topic word. */
function filterByTopic(items, topic) {
  const tokens = String(topic || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2);
  if (!tokens.length) return items;
  const matched = items.filter((it) => {
    const hay = `${it.title} ${it.summary} ${it.content}`.toLowerCase();
    return tokens.some((t) => hay.includes(t));
  });
  // If nothing matched (very specific topic), fall back to latest headlines
  // rather than returning nothing.
  return matched.length ? matched : items;
}

/**
 * Heuristic main-text extraction: prefer <article>, else join <p> blocks.
 * qualityFilter.apply() sanitizes further; this just picks a good region.
 */
function extractArticleText(html) {
  const article = (html.match(/<article\b[\s\S]*?<\/article>/i) || [])[0];
  const region = article || html;
  const paras = region.match(/<p\b[^>]*>[\s\S]*?<\/p>/gi) || [];
  const joined = paras.length ? paras.join(" ") : region;
  return joined;
}

/** Block non-http(s) and obvious internal hosts before enrichment fetches. */
function isPublicHttpUrl(rawUrl) {
  let u;
  try {
    u = new URL(String(rawUrl));
  } catch {
    return false;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  const host = u.hostname.toLowerCase();
  // ponytail: coarse SSRF guard (feed URLs are already trusted config); blocks
  // localhost/loopback/link-local. Upgrade path = full private-CIDR check.
  if (host === "localhost" || host.endsWith(".local")) return false;
  if (/^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(host)) return false;
  if (host === "::1" || host.startsWith("fe80") || host.startsWith("fc") || host.startsWith("fd")) return false;
  return true;
}

module.exports = RSSNewsProvider;
RSSNewsProvider._internals = { toISO, plainLen, filterByTopic, extractArticleText, isPublicHttpUrl };
