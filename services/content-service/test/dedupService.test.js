const test = require("node:test");
const assert = require("node:assert");
const { dedupe, similarity, normalizeUrl, normalizeTitle } = require("../services/dedupService");

test("normalizeUrl strips www, trailing slash, query, hash", () => {
  assert.equal(normalizeUrl("https://www.thehindu.com/news/x/?utm=1#top"), "thehindu.com/news/x");
  assert.equal(normalizeUrl("https://thehindu.com/news/x"), "thehindu.com/news/x");
});

test("normalizeTitle lowercases and strips punctuation", () => {
  assert.equal(normalizeTitle("GST 2.0: Big Reform!"), "gst 2 0 big reform");
});

test("similarity is high for near-identical titles", () => {
  const s = similarity(
    "Supreme Court upholds privacy in Aadhaar case",
    "Supreme Court upholds privacy in the Aadhaar case"
  );
  assert.ok(s >= 0.8, `similarity ${s}`);
});

test("dedupe removes URL duplicates", () => {
  const { articles, removed } = dedupe([
    { title: "A", url: "https://www.thehindu.com/a", content: "x".repeat(50) },
    { title: "A different headline entirely", url: "https://thehindu.com/a/", content: "y".repeat(80) },
  ]);
  assert.equal(articles.length, 1);
  assert.equal(removed, 1);
  // richer body wins
  assert.equal(articles[0].content.length, 80);
});

test("dedupe merges by title similarity and fills missing fields", () => {
  const { articles } = dedupe([
    { title: "India signs new trade deal with UAE", url: "https://a.com/1", content: "short", author: "" },
    { title: "India signs new trade deal with the UAE", url: "https://b.com/2", content: "much longer body here for merge", author: "Desk" },
  ]);
  assert.equal(articles.length, 1);
  assert.equal(articles[0].author, "Desk");
  assert.ok(articles[0].content.includes("longer"));
});

test("dedupe drops entries with neither title nor url", () => {
  const { articles, removed } = dedupe([{ content: "orphan" }, { title: "Real", url: "https://a.com/x" }]);
  assert.equal(articles.length, 1);
  assert.equal(removed, 1);
});
