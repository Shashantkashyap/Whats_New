const test = require("node:test");
const assert = require("node:assert");
const NewsScraperService = require("../services/newsScraperService");

// Fake browser: serves a search-results link list, then per-article extracts.
function fakeBrowser(links, articleByUrl) {
  let currentUrl = null;
  return {
    navigations: [],
    async navigate(url) { currentUrl = url; this.navigations.push(url); },
    async waitFor() {},
    async evaluate(script) {
      if (script.includes("a[href]")) return JSON.stringify(links);
      // extraction script: return the article for the current url
      const a = articleByUrl[currentUrl] || { title: "", content: "", url: currentUrl };
      return JSON.stringify({ ...a, url: currentUrl });
    },
    async disconnect() {},
  };
}

test("scraper collects articles from same-source allowed links and skips others", async () => {
  const links = [
    { url: "https://www.thehindu.com/news/a", title: "Story A about GST reforms today" },
    { url: "https://www.thehindu.com/news/b", title: "Story B about GST council meeting" },
    { url: "https://evil.example.com/x", title: "Malicious off-domain link here" },
    { url: "https://www.bbc.com/news/z", title: "BBC link should be skipped for hindu source" },
  ];
  const articleByUrl = {
    "https://www.thehindu.com/news/a": { title: "GST A", content: "body a ".repeat(50), author: "Desk", publishedAt: "2026-07-07T00:00:00Z", category: "Economy", image: "https://img/a.jpg" },
    "https://www.thehindu.com/news/b": { title: "GST B", content: "body b ".repeat(50) },
  };

  const browser = fakeBrowser(links, articleByUrl);
  const scraper = new NewsScraperService(browser);

  const out = await scraper.collect({ topic: "GST", sources: ["The Hindu"], articlesPerSource: 5 });

  assert.equal(out.length, 2);
  assert.deepEqual(out.map((a) => a.title).sort(), ["GST A", "GST B"]);
  assert.ok(out.every((a) => a.source === "The Hindu"));
  // never navigated to the off-domain link
  assert.ok(!browser.navigations.includes("https://evil.example.com/x"));
});

test("scraper requires a topic", async () => {
  const scraper = new NewsScraperService(fakeBrowser([], {}));
  await assert.rejects(() => scraper.collect({}), /topic is required/);
});

test("scraper continues when one article extraction fails", async () => {
  const links = [
    { url: "https://www.thehindu.com/news/good", title: "Good headline about policy reform" },
    { url: "https://www.thehindu.com/news/bad", title: "Bad headline that will throw here" },
  ];
  const browser = {
    async navigate(url) { this._u = url; },
    async waitFor() {},
    async evaluate(script) {
      if (script.includes("a[href]")) return JSON.stringify(links);
      if (this._u.endsWith("/bad")) throw new Error("extract boom");
      return JSON.stringify({ title: "Good", content: "x".repeat(200), url: this._u });
    },
  };
  const out = await new NewsScraperService(browser).collect({ topic: "reform", sources: ["The Hindu"] });
  assert.equal(out.length, 1);
  assert.equal(out[0].title, "Good");
});
