// Light computer-vision check that an uploaded photo is a handwritten / lined
// academic answer sheet. Uses Gemini multimodal when available; otherwise a
// cheap heuristic on file size + dimensions is NOT attempted (no image lib) —
// we accept with a warning tag so offline/dev flows still work.
//
// Spec: reject below 75% confidence; if validation exceeds 3.5s, save with
// warning tags instead of failing the student.

const { SchemaType } = require("@google/generative-ai");

const VISION_TIMEOUT_MS = 3500;
const CONFIDENCE_THRESHOLD = 0.75;

const VISION_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    is_handwritten_document: { type: SchemaType.BOOLEAN },
    confidence: { type: SchemaType.NUMBER },
    text_density: { type: SchemaType.STRING },
    clarity_rating: { type: SchemaType.STRING },
    estimated_chars: { type: SchemaType.NUMBER },
    reason: { type: SchemaType.STRING },
  },
  required: ["is_handwritten_document", "confidence", "clarity_rating", "estimated_chars"],
};

const SYSTEM_PROMPT = `You are a strict document classifier for a UPSC exam platform.
Decide whether the image is a photograph of a handwritten academic answer sheet
(A4 paper, lined notebook page, or dense handwritten/printed exam script).

ACCEPT: lined paper with handwriting, answer-book pages, dense script blocks.
REJECT: selfies, scenery, code screenshots, memes, blank walls, random objects.

Return JSON only. confidence is 0..1 for "handwritten academic document".`;

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error("VISION_TIMEOUT");
      err.code = "VISION_TIMEOUT";
      reject(err);
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function classifyWithGemini(buffer, contentType, model) {
  const result = await model.generateContent({
    contents: [{
      parts: [
        { text: SYSTEM_PROMPT },
        { inlineData: { mimeType: contentType || "image/jpeg", data: buffer.toString("base64") } },
      ],
    }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: VISION_SCHEMA,
      temperature: 0,
    },
  });
  const raw = typeof result.response?.text === "function" ? result.response.text() : result?.response;
  return typeof raw === "string" ? JSON.parse(raw) : (raw || {});
}

// validateAnswerSheet(buffer, contentType, deps?) →
//   { accepted, confidence, timedOut, warningTags, insights, reason }
async function validateAnswerSheet(buffer, contentType = "image/jpeg", deps = {}) {
  const warningTags = [];

  const classify = deps.classify || classifyWithGemini;

  let model = deps.model;
  if (model === undefined && !deps.classify) {
    try {
      // Lazy require so unit tests can inject deps.model without loading Gemini.
      model = require("../config/gemni");
    } catch {
      model = null;
    }
  }

  // Injected `classify` (tests) always runs; production needs a model + key.
  if (!deps.classify && (!model || !process.env.GEMINI_API_KEY)) {
    // ponytail: no vision model configured — accept with warning so local/dev
    // uploads aren't blocked. Upgrade = set GEMINI_API_KEY.
    warningTags.push("VISION_UNAVAILABLE");
    return {
      accepted: true,
      confidence: null,
      timedOut: false,
      warningTags,
      insights: { text_extracted_chars: 0, page_count: 1, clarity_rating: "Unknown" },
      reason: "Vision model unavailable; accepted with warning.",
    };
  }

  try {
    const raw = await withTimeout(
      classify(buffer, contentType, model),
      deps.timeoutMs || VISION_TIMEOUT_MS
    );
    const confidence = Number(raw.confidence);
    const accepted =
      !!raw.is_handwritten_document &&
      Number.isFinite(confidence) &&
      confidence >= CONFIDENCE_THRESHOLD;

    return {
      accepted,
      confidence,
      timedOut: false,
      warningTags,
      insights: {
        text_extracted_chars: Math.max(0, Math.round(Number(raw.estimated_chars) || 0)),
        page_count: 1,
        clarity_rating: raw.clarity_rating || "Unknown",
      },
      reason: raw.reason || "",
    };
  } catch (err) {
    if (err.code === "VISION_TIMEOUT" || err.message === "VISION_TIMEOUT") {
      // Spec: on timeout, gracefully save with warning tags.
      warningTags.push("VISION_TIMEOUT");
      return {
        accepted: true,
        confidence: null,
        timedOut: true,
        warningTags,
        insights: { text_extracted_chars: 0, page_count: 1, clarity_rating: "Unknown" },
        reason: "Vision validation timed out; sheet saved with warning.",
      };
    }
    warningTags.push("VISION_ERROR");
    return {
      accepted: true,
      confidence: null,
      timedOut: false,
      warningTags,
      insights: { text_extracted_chars: 0, page_count: 1, clarity_rating: "Unknown" },
      reason: err.message || "Vision error; accepted with warning.",
    };
  }
}

module.exports = {
  validateAnswerSheet,
  VISION_TIMEOUT_MS,
  CONFIDENCE_THRESHOLD,
};
