const test = require("node:test");
const assert = require("node:assert");
const { validateAnswerSheet, CONFIDENCE_THRESHOLD } = require("../utils/sheetVision");

test("rejects below confidence threshold", async () => {
  const result = await validateAnswerSheet(Buffer.from("x"), "image/jpeg", {
    model: {}, // force classify path
    classify: async () => ({
      is_handwritten_document: true,
      confidence: CONFIDENCE_THRESHOLD - 0.1,
      clarity_rating: "Low",
      estimated_chars: 10,
    }),
  });
  assert.equal(result.accepted, false);
});

test("accepts handwritten sheet at/above threshold", async () => {
  const result = await validateAnswerSheet(Buffer.from("x"), "image/jpeg", {
    model: {},
    classify: async () => ({
      is_handwritten_document: true,
      confidence: 0.9,
      clarity_rating: "High",
      estimated_chars: 1400,
      text_density: "dense",
    }),
  });
  assert.equal(result.accepted, true);
  assert.equal(result.insights.clarity_rating, "High");
  assert.equal(result.insights.text_extracted_chars, 1400);
});

test("timeout accepts with VISION_TIMEOUT warning", async () => {
  const result = await validateAnswerSheet(Buffer.from("x"), "image/jpeg", {
    model: {},
    timeoutMs: 20,
    classify: () => new Promise((resolve) => setTimeout(() => resolve({
      is_handwritten_document: true,
      confidence: 0.99,
      clarity_rating: "High",
      estimated_chars: 1,
    }), 200)),
  });
  assert.equal(result.accepted, true);
  assert.equal(result.timedOut, true);
  assert.ok(result.warningTags.includes("VISION_TIMEOUT"));
});

test("missing model accepts with VISION_UNAVAILABLE", async () => {
  const prev = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  const result = await validateAnswerSheet(Buffer.from("x"), "image/jpeg", { model: null });
  assert.equal(result.accepted, true);
  assert.ok(result.warningTags.includes("VISION_UNAVAILABLE"));
  if (prev !== undefined) process.env.GEMINI_API_KEY = prev;
});
