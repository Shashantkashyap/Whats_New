const test = require("node:test");
const assert = require("node:assert");
const NewsCache = require("../services/newsCache");

test("keyFor is order-insensitive for sources", () => {
  assert.equal(
    NewsCache.keyFor("GST", ["The Hindu", "PIB"]),
    NewsCache.keyFor("gst", ["pib", "the hindu"])
  );
});

test("get returns set value within TTL", () => {
  const c = new NewsCache({ ttlMs: 1000 });
  c.set("topic", ["a"], [{ title: "x" }]);
  assert.deepEqual(c.get("topic", ["a"]), [{ title: "x" }]);
  assert.equal(c.size, 1);
});

test("get returns null after TTL expiry", async () => {
  const c = new NewsCache({ ttlMs: 5 });
  c.set("topic", ["a"], [1]);
  await new Promise((r) => setTimeout(r, 15));
  assert.equal(c.get("topic", ["a"]), null);
  assert.equal(c.size, 0);
});

test("clear empties the cache", () => {
  const c = new NewsCache({ ttlMs: 1000 });
  c.set("t", [], [1]);
  c.clear();
  assert.equal(c.size, 0);
});
