/**
 * ChromeMCPNewsProvider.js - NewsProvider backed by Chrome MCP browsing.
 *
 * Pipeline calls collect(); this provider:
 *   1. checks the TTL cache (skip re-scraping the same topic)
 *   2. scrapes approved sources via newsScraperService (Chrome MCP)
 *   3. deduplicates + merges
 *   4. applies quality filters + sanitizes untrusted bodies
 *   5. caches and returns canonical articles
 *
 * The browser connection is opened lazily and always disconnected afterwards.
 * All collaborators are injectable for testing.
 */

const NewsProvider = require("./NewsProvider");
const config = require("../config/newsConfig");
const logger = require("../utils/logger");
const NewsCache = require("../services/newsCache");
const dedupService = require("../services/dedupService");
const qualityFilter = require("../services/qualityFilter");
const ChromeMcpService = require("../services/chromeMcpService");
const NewsScraperService = require("../services/newsScraperService");

class ChromeMCPNewsProvider extends NewsProvider {
  constructor(cfg = config, deps = {}) {
    super("chrome-mcp");
    this.cfg = cfg;
    this.log = deps.logger || logger;
    this.cache = deps.cache || new NewsCache({ ttlMs: cfg.cacheTtlMs });
    this.dedup = deps.dedup || dedupService;
    this.quality = deps.quality || qualityFilter;
    // Injectable seams. By default a fresh browser+scraper is built per run.
    this.createBrowser = deps.createBrowser || (() => new ChromeMcpService(cfg));
    this.createScraper = deps.createScraper || ((browser) => new NewsScraperService(browser, cfg));
  }

  async collect(request = {}) {
    const topic = String(request.topic || "").trim();
    if (!topic) throw new Error("collect: topic is required");

    const sourceNames = (request.sources && request.sources.length ? request.sources : this.cfg.sources.map((s) => s.name));
    const maxAgeHours = request.maxAgeHours ?? this.cfg.maxAgeHours;

    const cached = this.cache.get(topic, sourceNames);
    if (cached) {
      this.log.info("provider.cache.hit", { topic, count: cached.length });
      return cached;
    }

    const browser = this.createBrowser();
    const scraper = this.createScraper(browser);
    let scraped = [];
    try {
      scraped = await scraper.collect({
        topic,
        sources: request.sources,
        articlesPerSource: request.articlesPerSource || this.cfg.articlesPerSource,
      });
    } finally {
      if (typeof browser.disconnect === "function") await browser.disconnect().catch(() => {});
    }

    const { articles: deduped, removed } = this.dedup.dedupe(scraped);
    const { kept, dropped } = this.quality.apply(deduped, {
      maxAgeHours,
      minBodyChars: this.cfg.minBodyChars,
      maxBodyChars: this.cfg.maxBodyChars,
    });

    this.log.info("provider.collect.done", {
      topic,
      scraped: scraped.length,
      dedupRemoved: removed,
      dropped: dropped.length,
      kept: kept.length,
    });

    this.cache.set(topic, sourceNames, kept);
    return kept;
  }
}

module.exports = ChromeMCPNewsProvider;
