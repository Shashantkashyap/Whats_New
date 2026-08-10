const test = require("node:test");
const assert = require("node:assert");
const {
  computeAffinity,
  scoreDoc,
  rankByAffinity,
  sortTagsByAffinity,
} = require("../utils/personalize");
const { tagsForSlug } = require("../config/curriculum");

test("computeAffinity nets right (+1) and left (-1) swipes per tag", () => {
  const affinity = computeAffinity([
    { direction: "right", tags: ["Economy", "Trade"] },
    { direction: "right", tags: ["Economy"] },
    { direction: "left", tags: ["Polity"] },
    { direction: "unknown", tags: ["IR"] }, // ignored
  ]);
  assert.equal(affinity.get("Economy"), 2);
  assert.equal(affinity.get("Trade"), 1);
  assert.equal(affinity.get("Polity"), -1);
  assert.equal(affinity.has("IR"), false);
});

test("scoreDoc sums a doc's tag affinities", () => {
  const affinity = computeAffinity([{ direction: "right", tags: ["Economy"] }]);
  assert.equal(scoreDoc({ tags: ["Economy", "Health"] }, affinity), 1);
  assert.equal(scoreDoc({ tags: ["Health"] }, affinity), 0);
});

test("rankByAffinity floats liked subjects up and is stable with no signal", () => {
  const docs = [
    { id: "a", tags: ["Polity"] }, // disliked
    { id: "b", tags: ["Economy"] }, // liked
    { id: "c", tags: ["Health"] }, // neutral
  ];
  const affinity = computeAffinity([
    { direction: "right", tags: ["Economy"] },
    { direction: "left", tags: ["Polity"] },
  ]);
  assert.deepEqual(rankByAffinity(docs, affinity).map((d) => d.id), ["b", "c", "a"]);
  // Empty affinity preserves input order (relevance/recency set by caller).
  assert.deepEqual(rankByAffinity(docs, new Map()).map((d) => d.id), ["a", "b", "c"]);
});

test("sortTagsByAffinity pins 'all' first and orders the rest by lean", () => {
  const tags = [
    { slug: "all", label: "All" },
    { slug: "polity", label: "Polity" },
    { slug: "economy", label: "Economy" },
  ];
  const affinity = computeAffinity([{ direction: "right", tags: ["Economy", "Finance"] }]);
  const ordered = sortTagsByAffinity(tags, affinity, tagsForSlug);
  assert.equal(ordered[0].slug, "all"); // always pinned
  assert.equal(ordered[1].slug, "economy"); // liked subject rises above polity
  // economy's matchTags cover both Economy (+1) and Finance (+1).
  assert.equal(ordered[1].affinity_score, 2);
  assert.equal(ordered.find((t) => t.slug === "polity").affinity_score, 0);
});
