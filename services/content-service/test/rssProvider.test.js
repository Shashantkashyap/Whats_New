const test = require("node:test");
const assert = require("node:assert");
const RSSNewsProvider = require("../providers/RSSNewsProvider");

const HOUR = 3600 * 1000;
const recent = (h) => new Date(Date.now() - h * HOUR).toISOString();

// A tiny config with two feeds: one search, one section.
function cfg(overrides = {}) {
  return {
    concurrency: 2,
    retryCount: 0,
    retryBaseDelayMs: 1,
    cacheTtlMs: 60_000,
    articlesPerSource: 5,
    maxAgeHours: 24,
    minBodyChars: 250,
    maxBodyChars: 20_000,
    rss: {
      enrichBody: false,
      minBodyChars: 140,
      fetchTimeoutMs: 1000,
      userAgent: "test-agent",
      feeds: [
        { id: "search", name: "SearchFeed", type: "search", urlTemplate: "https://feed.test/search?q={query}" },
        { id: "section", name: "SectionFeed", type: "section", url: "https://feed.test/section" },
      ],
    },
    buildFeedUrl: (feed, topic) =>
      feed.urlTemplate ? feed.urlTemplate.replace("{query}", encodeURIComponent(topic)) : feed.url,
    resolveFeed: (name) =>
      ({ searchfeed: { id: "search", name: "SearchFeed", type: "search", urlTemplate: "https://feed.test/search?q={query}" } }[
        String(name).toLowerCase()
      ] || null),
    ...overrides,
  };
}

// Fake fetch returning canned bodies keyed by URL substring.
function fakeFetch(map) {
  const calls = [];
  const fn = async (url) => {
    calls.push(url);
    const key = Object.keys(map).find((k) => url.includes(k));
    if (!key) return { ok: false, status: 404, text: async () => "" };
    return { ok: true, status: 200, text: async () => map[key] };
  };
  fn.calls = calls;
  return fn;
}

const longBody = "policy ".repeat(60); // > 140 chars

function feedXml(items) {
  return `<rss><channel>${items
    .map(
      (it) => `<item><title>${it.title}</title><link>${it.url}</link>` +
        `<pubDate>${it.date || recent(1)}</pubDate>` +
        `<description>${it.body || ""}</description></item>`,
    )
    .join("")}</channel></rss>`;
}

test("collects, maps to canonical shape, filters section feed by topic", async () => {
  const fetchImpl = fakeFetch({
    "/search": feedXml([{ title: "GST reform passes parliament", url: "https://a.test/1", body: longBody }]),
    "/section": feedXml([
      { title: "GST reform impact on states", url: "https://b.test/2", body: longBody },
      { title: "Cricket match report", url: "https://b.test/3", body: longBody },
    ]),
  });
  const provider = new RSSNewsProvider(cfg(), { fetch: fetchImpl });
  const out = await provider.collect({ topic: "GST reform" });

  const titles = out.map((a) => a.title).sort();
  assert.deepEqual(titles, ["GST reform impact on states", "GST reform passes parliament"]);
  assert.ok(out.every((a) => a.source && a.url && a.publishedAt), "canonical fields present");
  assert.ok(!out.some((a) => a.title.includes("Cricket")), "off-topic section item filtered out");
});

test("drops old and too-short items via quality filter", async () => {
  const fetchImpl = fakeFetch({
    "/search": feedXml([
      { title: "Fresh reform news", url: "https://a.test/fresh", body: longBody },
      { title: "Old reform news", url: "https://a.test/old", body: longBody, date: recent(100) },
      { title: "Thin reform news", url: "https://a.test/thin", body: "tiny" },
    ]),
    "/section": feedXml([]),
  });
  const provider = new RSSNewsProvider(cfg(), { fetch: fetchImpl });
  const out = await provider.collect({ topic: "reform" });
  assert.deepEqual(out.map((a) => a.title), ["Fresh reform news"]);
});

test("enriches thin summaries by fetching the article page", async () => {
  const fetchImpl = fakeFetch({
    "/search": feedXml([{ title: "Budget reform highlights", url: "https://a.test/article", body: "short" }]),
    "/section": feedXml([]),
    "/article": `<html><article><p>${longBody}</p></article></html>`,
  });
  const provider = new RSSNewsProvider(cfg({ rss: { ...cfg().rss, enrichBody: true } }), { fetch: fetchImpl });
  const out = await provider.collect({ topic: "budget reform" });
  assert.equal(out.length, 1);
  assert.match(out[0].content, /policy/);
});

test("serves cached results on repeat calls", async () => {
  const fetchImpl = fakeFetch({
    "/search": feedXml([{ title: "Cached reform story", url: "https://a.test/c", body: longBody }]),
    "/section": feedXml([]),
  });
  const provider = new RSSNewsProvider(cfg(), { fetch: fetchImpl });
  await provider.collect({ topic: "reform" });
  const before = fetchImpl.calls.length;
  await provider.collect({ topic: "reform" });
  assert.equal(fetchImpl.calls.length, before, "second call should hit cache, no new fetches");
});

test("one failing feed does not abort the batch", async () => {
  const fetchImpl = fakeFetch({
    // no "/search" entry -> 404 -> feed fails
    "/section": feedXml([{ title: "Reform survives failure", url: "https://b.test/ok", body: longBody }]),
  });
  const provider = new RSSNewsProvider(cfg(), { fetch: fetchImpl });
  const out = await provider.collect({ topic: "reform" });
  assert.deepEqual(out.map((a) => a.title), ["Reform survives failure"]);
});

test("requires a topic", async () => {
  await assert.rejects(() => new RSSNewsProvider(cfg(), { fetch: fakeFetch({}) }).collect({}), /topic is required/);
});
