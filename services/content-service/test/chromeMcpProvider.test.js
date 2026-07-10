const test = require("node:test");
const assert = require("node:assert");
const ChromeMCPNewsProvider = require("../providers/ChromeMCPNewsProvider");

const HOUR = 3600 * 1000;

function recent(hoursAgo) {
  return new Date(Date.now() - hoursAgo * HOUR).toISOString();
}

function providerWith(scraped) {
  let disconnected = false;
  const provider = new ChromeMCPNewsProvider(undefined, {
    createBrowser: () => ({ disconnect: async () => { disconnected = true; } }),
    createScraper: () => ({ collect: async () => scraped }),
  });
  provider._disconnected = () => disconnected;
  return provider;
}

test("provider dedups, filters old/short, and returns clean articles", async () => {
  const good = { title: "Major policy reform announced", url: "https://www.thehindu.com/a", source: "The Hindu", content: "word ".repeat(80), publishedAt: recent(2), author: "Desk", category: "Polity", image: "" };
  const dupOfGood = { ...good, url: "https://thehindu.com/a/", content: "word ".repeat(120) };
  const old = { title: "Ancient news", url: "https://www.thehindu.com/b", source: "The Hindu", content: "word ".repeat(80), publishedAt: recent(100) };
  const short = { title: "Too short", url: "https://www.thehindu.com/c", source: "The Hindu", content: "tiny", publishedAt: recent(1) };

  const provider = providerWith([good, dupOfGood, old, short]);
  const out = await provider.collect({ topic: "reform", sources: ["The Hindu"] });

  assert.equal(out.length, 1);
  assert.equal(out[0].title, "Major policy reform announced");
  assert.equal(provider._disconnected(), true, "browser was disconnected");
});

test("provider serves cached results on repeat calls", async () => {
  let scrapeCalls = 0;
  const provider = new ChromeMCPNewsProvider(undefined, {
    createBrowser: () => ({ disconnect: async () => {} }),
    createScraper: () => ({ collect: async () => { scrapeCalls++; return [
      { title: "Cached story about elections", url: "https://www.thehindu.com/x", source: "The Hindu", content: "word ".repeat(80), publishedAt: recent(1) },
    ]; } }),
  });

  await provider.collect({ topic: "elections", sources: ["The Hindu"] });
  await provider.collect({ topic: "elections", sources: ["The Hindu"] });
  assert.equal(scrapeCalls, 1, "second call should hit cache");
});

test("provider requires a topic", async () => {
  await assert.rejects(() => providerWith([]).collect({}), /topic is required/);
});
