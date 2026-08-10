// AI evaluation of a descriptive (Mains) answer -> marks, feedback, and
// improvement suggestions. Uses Gemini when a key/model is available; otherwise
// falls back to a deterministic heuristic so the endpoint always works
// (offline, in tests, or without a GEMINI_API_KEY).
//
// ponytail: the heuristic is a coarse length + hint-coverage proxy, NOT real
// answer grading. Upgrade path = the Gemini path below (structured output),
// which is used whenever the model call succeeds.

const { SchemaType } = require("@google/generative-ai");

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const words = (s) => String(s || "").trim().split(/\s+/).filter(Boolean);

// Deterministic fallback score. Rewards a substantive answer (~150 words is a
// full mains answer) that engages with the provided hints.
function heuristicEval(answerText, hints = [], maxMarks = 10) {
  const wc = words(answerText).length;
  if (wc === 0) {
    return { marks: 0, feedback: "No answer was submitted.", improvements: ["Attempt the question — even a structured skeleton earns marks."] };
  }
  const TARGET_WORDS = 150;
  const lengthScore = clamp(wc / TARGET_WORDS, 0, 1);

  const hay = String(answerText).toLowerCase();
  const hintList = Array.isArray(hints) ? hints.filter(Boolean) : [];
  const covered = hintList.filter((h) =>
    words(h).some((w) => w.length > 3 && hay.includes(w.toLowerCase()))
  ).length;
  const hintScore = hintList.length ? covered / hintList.length : 0.5;

  const marks = clamp(Math.round((lengthScore * 0.6 + hintScore * 0.4) * maxMarks), 0, maxMarks);

  const improvements = [];
  if (wc < TARGET_WORDS) improvements.push(`Expand the answer (≈${wc} words; aim for ~${TARGET_WORDS}+ with intro–body–conclusion).`);
  if (hintList.length && covered < hintList.length) improvements.push("Address all the suggested dimensions/hints for full coverage.");
  improvements.push("Add relevant facts, examples, and a crisp conclusion to strengthen the answer.");

  return {
    marks,
    feedback: `Covered ${covered}/${hintList.length || "—"} key dimensions in ~${wc} words. ${marks >= maxMarks * 0.6 ? "A solid attempt." : "Needs more depth and structure."}`,
    improvements,
  };
}

const EVAL_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    marks: { type: SchemaType.NUMBER },
    feedback: { type: SchemaType.STRING },
    improvements: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
  },
  required: ["marks", "feedback", "improvements"],
};

function buildPrompt({ question, hints = [], modelAnswer = "", answerText, maxMarks }) {
  return `You are a senior UPSC Mains examiner. Evaluate the aspirant's answer strictly and constructively.

QUESTION:
"""${question}"""

${hints.length ? `EXPECTED DIMENSIONS (hints): ${hints.join("; ")}` : ""}
${modelAnswer ? `MODEL ANSWER (reference, do not quote verbatim): """${modelAnswer}"""` : ""}

ASPIRANT'S ANSWER:
"""${answerText}"""

Return JSON: marks (integer 0-${maxMarks}, judged on content coverage, structure, examples, and clarity), a concise feedback paragraph (<= 400 chars), and 2-4 concrete improvement suggestions.`;
}

// evaluateAnswer({ question, hints, modelAnswer, answerText, maxMarks }, deps)
// deps.model lets tests inject/stub Gemini; defaults to the shared model.
async function evaluateAnswer(params, deps = {}) {
  const { question, hints = [], modelAnswer = "", answerText, maxMarks = 10 } = params;

  if (!words(answerText).length) return heuristicEval(answerText, hints, maxMarks);

  let model = deps.model;
  if (model === undefined) {
    try {
      model = require("../config/gemni");
    } catch {
      model = null;
    }
  }
  if (!model || typeof model.generateContent !== "function" || !process.env.GEMINI_API_KEY) {
    return heuristicEval(answerText, hints, maxMarks);
  }

  try {
    const result = await model.generateContent({
      contents: [{ parts: [{ text: buildPrompt({ question, hints, modelAnswer, answerText, maxMarks }) }] }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 1024,
        responseMimeType: "application/json",
        responseSchema: EVAL_SCHEMA,
      },
    });
    const raw = typeof result.response?.text === "function" ? result.response.text() : result?.response;
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    const marks = clamp(Math.round(Number(parsed.marks)), 0, maxMarks);
    return {
      marks: Number.isFinite(marks) ? marks : heuristicEval(answerText, hints, maxMarks).marks,
      feedback: String(parsed.feedback || "").trim(),
      improvements: Array.isArray(parsed.improvements) ? parsed.improvements : [],
    };
  } catch (err) {
    // Any model/parse failure degrades to the heuristic so evaluation never 500s.
    const fb = heuristicEval(answerText, hints, maxMarks);
    fb.feedback = `${fb.feedback} (AI evaluator unavailable: ${err.message})`;
    return fb;
  }
}

module.exports = { evaluateAnswer, heuristicEval };
