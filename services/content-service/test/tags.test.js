const test = require("node:test");
const assert = require("node:assert");
const {
  resolveTags,
  fallbackKeywordTag,
  validateNewsSchema,
  calculateRelevanceScore,
} = require("../pipeline/contentPipeline");

// Regression for the empty-tags ranking bug: a clearly categorizable story must
// never end up with tags: [] and must therefore score on its real signal.

test("resolveTags classifies the uranium/Australia story instead of leaving it empty", () => {
  const item = {
    title: "Australia's 2011 uranium sales approval to India: Congress challenges Modi govt credit",
    content:
      "The bilateral relations between Australia and India on nuclear energy cooperation " +
      "were shaped by the uranium export approval, a milestone in foreign policy.",
    tags: [],
  };
  const tags = resolveTags(item);
  assert.ok(tags.length > 0, "tags must not be empty");
  assert.ok(tags.includes("IR"), "should detect International Relations");
  assert.ok(tags.includes("Energy"), "should detect Energy (uranium/nuclear)");

  const score = calculateRelevanceScore({ ...item, tags, publishedAt: new Date().toISOString(), source: "The Hindu" });
  assert.ok(score >= 8, `expected high relevance, got ${score}`);
});

test("fallbackKeywordTag never returns an empty array", () => {
  const tags = fallbackKeywordTag({ title: "Local weather update", content: "Cloudy skies expected." });
  assert.ok(Array.isArray(tags) && tags.length > 0);
});

test("resolveTags preserves already-valid tags", () => {
  const tags = resolveTags({ title: "x", tags: ["Polity", "NotARealTag"] });
  assert.deepEqual(tags, ["Polity"]);
});

test("validateNewsSchema rejects empty tags", () => {
  const base = {
    title: "T",
    description: "D",
    content: "C",
    summary: Array(8).fill("point"),
    flowchartNodes: [{ id: "s1", label: "L", connections: [] }],
    examRelevance: ["GS-II"],
    mcqs: [{ question: "q", options: ["a", "b", "c", "d"], answer: "a" }],
    mainsQuestion: { question: "q" },
  };
  assert.ok(validateNewsSchema({ ...base, tags: [] }).errors.includes("Tags cannot be empty"));
  assert.ok(validateNewsSchema({ ...base, tags: ["Polity"] }).isValid);
});
