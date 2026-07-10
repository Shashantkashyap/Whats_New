/**
 * geminiTools.js - The single high-level tool Gemini may call to obtain news.
 *
 * Gemini decides WHEN current news is needed and calls `scrape_news`. The
 * backend decides HOW browsing happens (Chrome MCP via the provider). Gemini is
 * never allowed to browse freely or invent articles.
 *
 * Exports:
 *   - SCRAPE_NEWS_DECLARATION : Gemini function declaration
 *   - makeScrapeNewsHandler(provider) : runtime handler bound to a NewsProvider
 *   - collectNews(deps) : runs the agentic loop, with a deterministic fallback
 *
 * The Gemini SDK and the default provider are lazy-loaded so this module (and
 * its unit tests, which inject fakes) require no network or heavy deps.
 */

const config = require("../config/newsConfig");
const logger = require("../utils/logger");

const SCRAPE_NEWS_DECLARATION = {
  name: "scrape_news",
  description:
    "Fetch REAL, current news articles by browsing approved newspaper websites. " +
    "Use this whenever current or recent news is required. Never invent, recall, " +
    "or guess news yourself - always obtain it through this tool.",
  parameters: {
    type: "object",
    properties: {
      topic: { type: "string", description: "Focused subject to search for, e.g. 'GST reform' or 'India-US trade'." },
      sources: {
        type: "array",
        items: { type: "string" },
        description: "Optional newspaper names to restrict to (e.g. 'The Hindu', 'PIB'). Omit for all approved sources.",
      },
      articlesPerSource: { type: "number", description: "Max articles per source (default from config)." },
      maxAgeHours: { type: "number", description: "Discard articles older than this many hours (default 24)." },
    },
    required: ["topic"],
  },
};

/** Bind the tool to a concrete NewsProvider. Returns an async(args)->articles. */
function makeScrapeNewsHandler(provider, log = logger) {
  if (!provider || typeof provider.collect !== "function") {
    throw new Error("makeScrapeNewsHandler requires a NewsProvider with collect()");
  }
  return async function scrapeNews(args = {}) {
    const topic = String(args.topic || "").trim();
    if (!topic) throw new Error("scrape_news: topic is required");
    const articles = await provider.collect({
      topic,
      sources: args.sources,
      articlesPerSource: args.articlesPerSource,
      maxAgeHours: args.maxAgeHours,
    });
    log.info("tool.scrape_news", { topic, sources: (args.sources || []).length, count: articles.length });
    return articles;
  };
}

/**
 * Ask Gemini to obtain current news via the scrape_news tool, then return the
 * collected articles. Falls back to a deterministic direct scrape so the
 * pipeline always produces articles even if function-calling is unavailable.
 *
 * @param {{provider?:object, model?:object|null, topic?:string, config?:object, logger?:object}} deps
 */
async function collectNews(deps = {}) {
  const cfg = deps.config || config;
  const log = deps.logger || logger;
  const provider = deps.provider || defaultProvider(cfg);
  const handler = makeScrapeNewsHandler(provider, log);
  const fallbackTopic = deps.topic || cfg.defaultTopic;

  // deps.model === null explicitly skips the agentic path (used by tests / when
  // no API key). undefined => build the real tool-enabled model lazily.
  const model = deps.model === null ? null : deps.model || safeDefaultModel(cfg, log);

  if (model) {
    try {
      const articles = await runToolLoop(model, handler, log);
      if (articles.length) return articles;
      log.warn("tool.agentic.empty");
    } catch (err) {
      log.warn("tool.agentic.failed", { error: err?.message });
    }
  }

  // ponytail: single-shot fallback (no multi-turn negotiation). Upgrade path =
  // loop sending functionResponse back until Gemini stops calling the tool.
  return handler({ topic: fallbackTopic, sources: cfg.sources.map((s) => s.name) });
}

async function runToolLoop(model, handler, log) {
  const prompt =
    "You curate the day's most important UPSC-relevant news for Indian civil " +
    "services aspirants. You must NOT invent or recall news from memory. To " +
    "obtain current news you MUST call the scrape_news tool with a focused " +
    "topic and reputable Indian sources. Call scrape_news now.";

  const chat = model.startChat();
  const res = await chat.sendMessage(prompt);
  const response = res.response || res;
  const calls = (typeof response.functionCalls === "function" ? response.functionCalls() : response.functionCalls) || [];

  const articles = [];
  for (const call of calls) {
    if (call && call.name === "scrape_news") {
      log.info("tool.agentic.call", { args: call.args || {} });
      articles.push(...(await handler(call.args || {})));
    }
  }
  return articles;
}

// Provider selection lives here so the tool stays the single seam Gemini sees.
// Default is RSS (machine-readable, never blocked); chrome-mcp is opt-in via
// NEWS_PROVIDER=chrome-mcp for local experiments.
function defaultProvider(cfg) {
  const name = (cfg.provider || "rss").toLowerCase();
  if (name === "chrome-mcp" || name === "chrome" || name === "mcp") {
    const ChromeMCPNewsProvider = require("../providers/ChromeMCPNewsProvider");
    return new ChromeMCPNewsProvider(cfg);
  }
  const RSSNewsProvider = require("../providers/RSSNewsProvider");
  return new RSSNewsProvider(cfg);
}

function safeDefaultModel(cfg, log) {
  try {
    const { GoogleGenerativeAI } = require("@google/generative-ai");
    if (!process.env.GEMINI_API_KEY) return null;
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    return genAI.getGenerativeModel({
      model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
      tools: [{ functionDeclarations: [SCRAPE_NEWS_DECLARATION] }],
    });
  } catch (err) {
    log.warn("tool.model.unavailable", { error: err?.message });
    return null;
  }
}

module.exports = { SCRAPE_NEWS_DECLARATION, makeScrapeNewsHandler, collectNews };
