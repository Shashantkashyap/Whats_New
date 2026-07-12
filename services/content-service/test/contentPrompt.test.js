const test = require("node:test");
const assert = require("node:assert");
const { buildGeminiContentPrompt } = require("../pipeline/contentPipeline");

// The whole point of the source-driven pipeline: Gemini enriches the REAL
// scraped article and is told not to invent facts. These checks fail loudly if
// a future edit drops the article body or the grounding instruction.

test("prompt embeds the original article body as the factual source", () => {
  const body = "The Reserve Bank of India cut the repo rate by 25 basis points to 6.25%.";
  const prompt = buildGeminiContentPrompt({
    title: "RBI cuts repo rate",
    source: "The Hindu",
    content: body,
    tags: ["Economy"],
  });
  assert.ok(prompt.includes(body), "article body must be included in the prompt");
  assert.ok(/source of truth/i.test(prompt), "prompt must frame the article as source of truth");
  assert.ok(/NEVER invent|do NOT add facts|do not invent/i.test(prompt), "prompt must forbid fabrication");
});

test("prompt caps very long article bodies", () => {
  const body = "x".repeat(50_000);
  const prompt = buildGeminiContentPrompt({ title: "T", content: body, tags: [] });
  // Body slice must be capped well below the raw length (default cap 9000).
  assert.ok(prompt.length < 20_000, "prompt should not embed an uncapped 50k-char body");
});
