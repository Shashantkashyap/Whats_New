// Extract aspirant answer text from a photographed answer sheet / notebook page
// using Gemini multimodal. Used by async OCR jobs (POST /media/upload/:testId/:questionId).

const { SchemaType } = require("@google/generative-ai");

const OCR_TIMEOUT_MS = 12000;

const OCR_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    text: { type: SchemaType.STRING },
    confidence: { type: SchemaType.NUMBER },
    language: { type: SchemaType.STRING },
  },
  required: ["text", "confidence"],
};

const SYSTEM_PROMPT = `You are an OCR engine for UPSC Mains handwritten/typed answer sheets.
Extract the aspirant's written answer as plain text.

Rules:
- Preserve paragraph breaks where clear.
- Do not invent content that is not visible.
- Ignore page margins, ruling lines, watermarks, and printed headers/footers.
- If the page is blank or unreadable, return an empty text string and low confidence.
- Return JSON only.`;

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error("OCR_TIMEOUT");
      err.code = "OCR_TIMEOUT";
      reject(err);
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function ocrWithGemini(buffer, contentType, model) {
  const result = await model.generateContent({
    contents: [{
      parts: [
        { text: SYSTEM_PROMPT },
        { inlineData: { mimeType: contentType || "image/jpeg", data: buffer.toString("base64") } },
      ],
    }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: OCR_SCHEMA,
      temperature: 0,
    },
  });
  const raw = typeof result.response?.text === "function" ? result.response.text() : result?.response;
  return typeof raw === "string" ? JSON.parse(raw) : (raw || {});
}

// extractAnswerText(buffer, contentType, deps?) →
//   { text, confidence, warningTags, timedOut }
async function extractAnswerText(buffer, contentType = "image/jpeg", deps = {}) {
  const warningTags = [];
  const runOcr = deps.ocr || ocrWithGemini;

  let model = deps.model;
  if (model === undefined && !deps.ocr) {
    try {
      model = require("../config/gemni");
    } catch {
      model = null;
    }
  }

  if (!deps.ocr && (!model || !process.env.GEMINI_API_KEY)) {
    const err = new Error("Answer image OCR is unavailable (GEMINI_API_KEY not configured).");
    err.code = "OCR_UNAVAILABLE";
    throw err;
  }

  try {
    const raw = await withTimeout(
      runOcr(buffer, contentType, model),
      deps.timeoutMs || OCR_TIMEOUT_MS
    );
    const text = String(raw.text || "").trim();
    const confidence = Number(raw.confidence);
    return {
      text,
      confidence: Number.isFinite(confidence) ? confidence : null,
      warningTags,
      timedOut: false,
    };
  } catch (err) {
    if (err.code === "OCR_TIMEOUT" || err.message === "OCR_TIMEOUT") {
      const e = new Error("Timed out extracting text from the answer image.");
      e.code = "OCR_TIMEOUT";
      throw e;
    }
    if (err.code === "OCR_UNAVAILABLE") throw err;
    const e = new Error(err.message || "Failed to extract text from the answer image.");
    e.code = "OCR_FAILED";
    throw e;
  }
}

module.exports = { extractAnswerText, OCR_TIMEOUT_MS };
