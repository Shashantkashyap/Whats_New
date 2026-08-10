const test = require("node:test");
const assert = require("node:assert");
const { extractAnswerText, OCR_TIMEOUT_MS } = require("../utils/answerOcr");

test("extractAnswerText returns OCR text from injected runner", async () => {
  const result = await extractAnswerText(Buffer.from("img"), "image/jpeg", {
    model: {},
    ocr: async () => ({ text: "  Cooperative federalism…  ", confidence: 0.91 }),
  });
  assert.equal(result.text, "Cooperative federalism…");
  assert.equal(result.confidence, 0.91);
  assert.equal(result.timedOut, false);
});

test("extractAnswerText times out cleanly", async () => {
  await assert.rejects(
    () =>
      extractAnswerText(Buffer.from("img"), "image/jpeg", {
        model: {},
        timeoutMs: 20,
        ocr: () => new Promise((resolve) => setTimeout(() => resolve({ text: "late", confidence: 1 }), 200)),
      }),
    (err) => err.code === "OCR_TIMEOUT"
  );
  assert.ok(OCR_TIMEOUT_MS > 0);
});

test("extractAnswerText fails when Gemini is unavailable", async () => {
  const prev = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  await assert.rejects(
    () => extractAnswerText(Buffer.from("img"), "image/jpeg", { model: null }),
    (err) => err.code === "OCR_UNAVAILABLE"
  );
  if (prev !== undefined) process.env.GEMINI_API_KEY = prev;
});
