// // AI evaluation of a descriptive (Mains) answer -> marks, feedback, and
// // improvement suggestions. Uses Gemini when a key/model is available; otherwise
// // falls back to a deterministic heuristic so the endpoint always works
// // (offline, in tests, or without a GEMINI_API_KEY).
// //
// // ponytail: the heuristic is a coarse length + hint-coverage proxy, NOT real
// // answer grading. Upgrade path = the Gemini path below (structured output),
// // which is used whenever the model call succeeds.

// const { SchemaType } = require("@google/generative-ai");

// const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
// const words = (s) => String(s || "").trim().split(/\s+/).filter(Boolean);

// // Deterministic fallback score. Rewards a substantive answer (~150 words is a
// // full mains answer) that engages with the provided hints.
// function heuristicEval(answerText, hints = [], maxMarks = 10) {
//   const wc = words(answerText).length;
//   if (wc === 0) {
//     return { marks: 0, feedback: "No answer was submitted.", improvements: ["Attempt the question — even a structured skeleton earns marks."] };
//   }
//   const TARGET_WORDS = 150;
//   const lengthScore = clamp(wc / TARGET_WORDS, 0, 1);

//   const hay = String(answerText).toLowerCase();
//   const hintList = Array.isArray(hints) ? hints.filter(Boolean) : [];
//   const covered = hintList.filter((h) =>
//     words(h).some((w) => w.length > 3 && hay.includes(w.toLowerCase()))
//   ).length;
//   const hintScore = hintList.length ? covered / hintList.length : 0.5;

//   const marks = clamp(Math.round((lengthScore * 0.6 + hintScore * 0.4) * maxMarks), 0, maxMarks);

//   const improvements = [];
//   if (wc < TARGET_WORDS) improvements.push(`Expand the answer (≈${wc} words; aim for ~${TARGET_WORDS}+ with intro–body–conclusion).`);
//   if (hintList.length && covered < hintList.length) improvements.push("Address all the suggested dimensions/hints for full coverage.");
//   improvements.push("Add relevant facts, examples, and a crisp conclusion to strengthen the answer.");

//   return {
//     marks,
//     feedback: `Covered ${covered}/${hintList.length || "—"} key dimensions in ~${wc} words. ${marks >= maxMarks * 0.6 ? "A solid attempt." : "Needs more depth and structure."}`,
//     improvements,
//   };
// }

// const EVAL_SCHEMA = {
//   type: SchemaType.OBJECT,
//   properties: {
//     marks: { type: SchemaType.NUMBER },
//     feedback: { type: SchemaType.STRING },
//     improvements: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
//   },
//   required: ["marks", "feedback", "improvements"],
// };

// function buildPrompt({ question, hints = [], modelAnswer = "", answerText, maxMarks }) {
//   return `You are a senior UPSC Mains examiner. Evaluate the aspirant's answer strictly and constructively.

// QUESTION:
// """${question}"""

// ${hints.length ? `EXPECTED DIMENSIONS (hints): ${hints.join("; ")}` : ""}
// ${modelAnswer ? `MODEL ANSWER (reference, do not quote verbatim): """${modelAnswer}"""` : ""}

// ASPIRANT'S ANSWER:
// """${answerText}"""

// Return JSON: marks (integer 0-${maxMarks}, judged on content coverage, structure, examples, and clarity), a concise feedback paragraph (<= 400 chars), and 2-4 concrete improvement suggestions.`;
// }

// // evaluateAnswer({ question, hints, modelAnswer, answerText, maxMarks }, deps)
// // deps.model lets tests inject/stub Gemini; defaults to the shared model.
// async function evaluateAnswer(params, deps = {}) {
//   const { question, hints = [], modelAnswer = "", answerText, maxMarks = 10 } = params;

//   if (!words(answerText).length) return heuristicEval(answerText, hints, maxMarks);

//   let model = deps.model;
//   if (model === undefined) {
//     try {
//       model = require("../config/gemni");
//     } catch {
//       model = null;
//     }
//   }
//   if (!model || typeof model.generateContent !== "function" || !process.env.GEMINI_API_KEY) {
//     return heuristicEval(answerText, hints, maxMarks);
//   }

//   try {
//     const result = await model.generateContent({
//       contents: [{ parts: [{ text: buildPrompt({ question, hints, modelAnswer, answerText, maxMarks }) }] }],
//       generationConfig: {
//         temperature: 0.2,
//         maxOutputTokens: 1024,
//         responseMimeType: "application/json",
//         responseSchema: EVAL_SCHEMA,
//       },
//     });
//     const raw = typeof result.response?.text === "function" ? result.response.text() : result?.response;
//     const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
//     const marks = clamp(Math.round(Number(parsed.marks)), 0, maxMarks);
//     return {
//       marks: Number.isFinite(marks) ? marks : heuristicEval(answerText, hints, maxMarks).marks,
//       feedback: String(parsed.feedback || "").trim(),
//       improvements: Array.isArray(parsed.improvements) ? parsed.improvements : [],
//     };
//   } catch (err) {
//     // Any model/parse failure degrades to the heuristic so evaluation never 500s.
//     const fb = heuristicEval(answerText, hints, maxMarks);
//     fb.feedback = `${fb.feedback} (AI evaluator unavailable: ${err.message})`;
//     return fb;
//   }
// }

// module.exports = { evaluateAnswer, heuristicEval };



// AI evaluation of a descriptive (Mains) answer -> marks, feedback, and
// improvement suggestions. Uses Gemini when a key/model is available; otherwise
// falls back to a rubric-based heuristic so the endpoint always works
// (offline, in tests, or without a GEMINI_API_KEY).
//
// Upgrade over v1: both paths now judge against an explicit UPSC-examiner
// rubric (structure, presentation, facts/examples, diagrams, way-forward) —
// not just word count / hint-keyword overlap. Every response includes a
// `rubric` breakdown so the UI can show a per-criterion checklist.

const { SchemaType } = require("@google/generative-ai");

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const words = (s) => String(s || "").trim().split(/\s+/).filter(Boolean);
const lines = (s) => String(s || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

// ---------------------------------------------------------------------------
// Rubric definition — shared by the heuristic fallback AND the Gemini prompt,
// so both paths are judging the same things.
// ---------------------------------------------------------------------------
const RUBRIC_LABELS = {
  structure: "Intro–Body–Conclusion structure",
  content_coverage: "Content coverage & relevance to the question",
  facts_examples: "Use of facts/data/reports/examples (not vague or anecdotal)",
  presentation: "Presentation — bullet points/headings over dense paragraphs",
  diagrams: "Diagram/flowchart used where the question benefits from one",
  way_forward: "Balanced conclusion with a way-forward/suggestion",
};

// Weight profiles per question type — same 6 dimensions, different emphasis.
// Weights within a profile must sum to 1. "default" covers GS1/GS2/GS3 and
// optional-subject answers (facts + policy heavy).
const QUESTION_TYPE_PROFILES = {
  default: { structure: 0.15, content_coverage: 0.35, facts_examples: 0.20, presentation: 0.15, diagrams: 0.05, way_forward: 0.10 },
  essay: { structure: 0.20, content_coverage: 0.30, facts_examples: 0.15, presentation: 0.05, diagrams: 0.05, way_forward: 0.25 },
  ethics: { structure: 0.15, content_coverage: 0.30, facts_examples: 0.10, presentation: 0.15, diagrams: 0.05, way_forward: 0.25 },
  gs3: { structure: 0.10, content_coverage: 0.30, facts_examples: 0.25, presentation: 0.15, diagrams: 0.10, way_forward: 0.10 },
};

function getRubric(questionType = "default") {
  const weights = QUESTION_TYPE_PROFILES[questionType] || QUESTION_TYPE_PROFILES.default;
  return Object.keys(RUBRIC_LABELS).map((key) => ({ key, label: RUBRIC_LABELS[key], weight: weights[key] }));
}

// Word targets also differ by type — an essay is a full 1000+ word piece,
// GS answers scale roughly with marks (~15 words/mark).
function getTargetWords(questionType = "default", maxMarks = 10) {
  if (questionType === "essay") return 1000;
  return Math.max(100, maxMarks * 15);
}

const RUBRIC = getRubric("default"); // kept for backward-compat (module.exports, existing callers)

// ---------------------------------------------------------------------------
// Heuristic fallback signal detectors — cheap regex/keyword proxies for each
// rubric dimension. Not perfect, but far better than length+hints alone.
// ---------------------------------------------------------------------------
const BULLET_LINE_RE = /^\s*(?:[-*•]|\d+[.)]|\([a-z]\))\s+/i;
const CONCLUDING_RE = /\b(in conclusion|to conclude|thus|hence|way forward|therefore|to sum up|in summary)\b/i;
const WAY_FORWARD_RE = /\b(way forward|suggestions?|recommend(ations?)?|measures needed|steps? needed|going forward|should be (adopted|taken|implemented))\b/i;
const FACT_SIGNAL_RE = /(\b\d{4}\b|\b\d+(\.\d+)?\s?%|\b(report|survey|index|commission|act,?\s?\d{4}|article\s?\d+|niti aayog|rbi|world bank|census|ministry of|supreme court|parliament)\b)/i;
const DIAGRAM_SIGNAL_RE = /(flowchart|flow chart|diagram|```mermaid|-->|=>|\bfig(ure)?\s?\d*[:.]|\[.*\]\s*->|\bmap\b.*sketch)/i;
const INTRO_SIGNAL_RE = /^(the|in recent|recently|india|context|introduction|.*(is|refers to|means|defined as))/i;

function detectStructure(answerText) {
  const ls = lines(answerText);
  const hasHeadings = ls.length >= 3;
  const firstChunk = ls.slice(0, Math.max(1, Math.ceil(ls.length * 0.2))).join(" ");
  const lastChunk = ls.slice(-Math.max(1, Math.ceil(ls.length * 0.2))).join(" ");
  const hasIntro = ls.length > 0 && (INTRO_SIGNAL_RE.test(firstChunk) || firstChunk.split(/\s+/).length > 8);
  const hasConclusion = CONCLUDING_RE.test(lastChunk) || WAY_FORWARD_RE.test(lastChunk);
  const score = (hasHeadings ? 0.3 : 0) + (hasIntro ? 0.35 : 0) + (hasConclusion ? 0.35 : 0);
  return { score: clamp(score, 0, 1), hasIntro, hasConclusion };
}

function detectPresentation(answerText) {
  const ls = lines(answerText);
  if (!ls.length) return { score: 0, bulletRatio: 0 };
  const bulletLines = ls.filter((l) => BULLET_LINE_RE.test(l)).length;
  const bulletRatio = bulletLines / ls.length;
  // Reward mixed structure (some prose + bullets) as much as pure bullets;
  // pure wall-of-text paragraphs score low.
  const score = clamp(bulletRatio * 1.4, 0, 1);
  return { score, bulletRatio };
}

function detectFacts(answerText) {
  const matches = answerText.match(new RegExp(FACT_SIGNAL_RE, "gi")) || [];
  const uniqueSignals = new Set(matches.map((m) => m.toLowerCase()));
  const score = clamp(uniqueSignals.size / 4, 0, 1); // 4+ distinct fact signals ~= full marks
  return { score, count: uniqueSignals.size };
}

function detectDiagram(answerText) {
  const present = DIAGRAM_SIGNAL_RE.test(answerText);
  return { score: present ? 1 : 0, present };
}

function detectWayForward(answerText) {
  const present = WAY_FORWARD_RE.test(answerText);
  return { score: present ? 1 : 0, present };
}

// Existing hint-keyword coverage, kept as the primary signal for
// "content_coverage" alongside raw length.
function hintCoverage(answerText, hints = []) {
  const hay = answerText.toLowerCase();
  const hintList = Array.isArray(hints) ? hints.filter(Boolean) : [];
  const covered = hintList.filter((h) =>
    words(h).some((w) => w.length > 3 && hay.includes(w.toLowerCase()))
  ).length;
  return { score: hintList.length ? covered / hintList.length : 0.5, covered, total: hintList.length };
}

// ---------------------------------------------------------------------------
// Rubric-based heuristic evaluation (offline / no-API fallback)
// ---------------------------------------------------------------------------
function heuristicEval(answerText, hints = [], maxMarks = 10, questionType = "default") {
  const rubric = getRubric(questionType);
  const wc = words(answerText).length;
  if (wc === 0) {
    return {
      marks: 0,
      feedback: "No answer was submitted.",
      improvements: ["Attempt the question — even a structured skeleton earns marks."],
      rubric: rubric.map((r) => ({ ...r, score: 0, present: false, remark: "Not attempted." })),
    };
  }

  const TARGET_WORDS = getTargetWords(questionType, maxMarks);
  const lengthScore = clamp(wc / TARGET_WORDS, 0, 1);
  const hints_ = hintCoverage(answerText, hints);
  const structure = detectStructure(answerText);
  const presentation = detectPresentation(answerText);
  const facts = detectFacts(answerText);
  const diagram = detectDiagram(answerText);
  const wayForward = detectWayForward(answerText);

  // content_coverage blends hint-coverage with raw length so a short answer
  // that happens to mention every hint keyword doesn't get a free pass.
  const contentCoverageScore = clamp(hints_.score * 0.7 + lengthScore * 0.3, 0, 1);

  const rubricScores = {
    structure: structure.score,
    content_coverage: contentCoverageScore,
    facts_examples: facts.score,
    presentation: presentation.score,
    diagrams: diagram.score,
    way_forward: wayForward.score,
  };

  const marks = clamp(
    Math.round(rubric.reduce((sum, r) => sum + rubricScores[r.key] * r.weight, 0) * maxMarks),
    0,
    maxMarks
  );

  const improvements = [];
  if (!structure.hasIntro) improvements.push("Add a brief intro that defines/contextualizes the term before diving into the body.");
  if (!structure.hasConclusion) improvements.push("End with a proper conclusion — don't just stop after the last point.");
  if (presentation.bulletRatio < 0.3) improvements.push("Break dense paragraphs into crisp bullet points — examiners scan, they don't read prose.");
  if (facts.count < 2) improvements.push("Back up points with facts/data — reports, committees, articles, years, statistics — instead of generic statements or stories.");
  if (!diagram.present) improvements.push("Consider a simple diagram/flowchart for process- or relationship-heavy questions — it saves words and stands out.");
  if (!wayForward.present) improvements.push("Add a 'way forward' — 1-2 concrete, balanced suggestions — in the conclusion.");
  if (hints_.total && hints_.covered < hints_.total) improvements.push("Address all the suggested dimensions/hints for full coverage.");
  if (!improvements.length) improvements.push("Solid structure and coverage — tighten language further for brevity.");

  const rubricBreakdown = rubric.map((r) => ({
    ...r,
    score: Math.round(rubricScores[r.key] * 100) / 100,
    remark: rubricRemark(r.key, rubricScores[r.key]),
  }));

  return {
    marks,
    feedback: `Covered ${hints_.covered}/${hints_.total || "—"} key dimensions in ~${wc} words. ${
      marks >= maxMarks * 0.6 ? "A solid attempt with room to sharpen structure/presentation." : "Needs more depth, structure, and examiner-friendly presentation."
    }`,
    improvements,
    rubric: rubricBreakdown,
  };
}

function rubricRemark(key, score) {
  const good = score >= 0.66;
  const ok = score >= 0.33;
  switch (key) {
    case "structure": return good ? "Clear intro-body-conclusion." : ok ? "Structure partially present." : "No clear intro/conclusion.";
    case "content_coverage": return good ? "Covers the question well." : ok ? "Partial coverage." : "Misses key dimensions of the question.";
    case "facts_examples": return good ? "Well-substantiated with facts/data." : ok ? "Some factual grounding." : "Mostly generic — add facts/reports/examples.";
    case "presentation": return good ? "Good use of bullets/headings." : ok ? "Mixed prose and bullets." : "Dense paragraphs — switch to bullets.";
    case "diagrams": return score >= 1 ? "Diagram/flowchart used." : "No diagram — add one if the question is process/relationship-based.";
    case "way_forward": return score >= 1 ? "Has a way-forward/suggestion." : "No way-forward in the conclusion.";
    default: return "";
  }
}

// ---------------------------------------------------------------------------
// Gemini structured-output path
// ---------------------------------------------------------------------------
const EVAL_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    marks: { type: SchemaType.NUMBER },
    feedback: { type: SchemaType.STRING },
    improvements: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
    rubric: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          key: { type: SchemaType.STRING },
          score: { type: SchemaType.NUMBER }, // 0-1
          remark: { type: SchemaType.STRING },
        },
        required: ["key", "score", "remark"],
      },
    },
  },
  required: ["marks", "feedback", "improvements", "rubric"],
};

function buildPrompt({ question, hints = [], modelAnswer = "", answerText, maxMarks, questionType = "default" }) {
  const rubric = getRubric(questionType);
  const rubricText = rubric.map((r) => `- ${r.key} (weight ${Math.round(r.weight * 100)}%): ${r.label}`).join("\n");
  const typeNote = {
    essay: "This is an ESSAY answer — prioritize flow of argument, structure, and a well-rounded conclusion over bullet-point formatting.",
    ethics: "This is a GS4 ETHICS/case-study answer — prioritize reasoning, application to the scenario, and a balanced way-forward over external facts/reports.",
    gs3: "This is a GS3 (Economy/S&T/Environment/Security) answer — prioritize hard facts, data, and diagrams/flowcharts where relevant.",
    default: "This is a standard GS answer — balance factual grounding with structure and presentation.",
  }[questionType] || "";
  return `You are a senior UPSC Mains examiner. Evaluate the aspirant's answer strictly and constructively, the way a real UPSC examiner grades copies — not just for content, but for examiner-friendly presentation. ${typeNote}

QUESTION:
"""${question}"""

${hints.length ? `EXPECTED DIMENSIONS (hints): ${hints.join("; ")}` : ""}
${modelAnswer ? `MODEL ANSWER (reference, do not quote verbatim): """${modelAnswer}"""` : ""}

ASPIRANT'S ANSWER:
"""${answerText}"""

Score against this exact rubric (score each 0-1, then it will be weighted):
${rubricText}

Specifically penalize:
- Wall-of-text paragraphs where bullet points/headings would be clearer.
- Vague generalities, filler, or irrelevant anecdotes/stories instead of facts, reports, committee names, articles, or statistics.
- Missing or weak conclusion — a good conclusion is balanced and offers a concrete way-forward/suggestion, not just a restatement.
- Missing a diagram/flowchart when the question is process-, cycle-, or relationship-based and a diagram would clearly help.

Return JSON with:
- "marks": integer 0-${maxMarks}, computed as the rubric-weighted score scaled to ${maxMarks}.
- "feedback": concise paragraph (<= 400 chars).
- "improvements": 2-4 concrete, specific improvement suggestions tied to the rubric above.
- "rubric": one entry per rubric key above, each with "key", "score" (0-1), and a one-line "remark".`;
}

async function evaluateAnswer(params, deps = {}) {
  // questionType: "default" (GS1/2/3-general) | "essay" | "ethics" | "gs3"
  const { question, hints = [], modelAnswer = "", answerText, maxMarks = 10, questionType = "default" } = params;

  if (!words(answerText).length) return heuristicEval(answerText, hints, maxMarks, questionType);

  let model = deps.model;
  if (model === undefined) {
    try {
      model = require("../config/gemni");
    } catch {
      model = null;
    }
  }
  if (!model || typeof model.generateContent !== "function" || !process.env.GEMINI_API_KEY) {
    return heuristicEval(answerText, hints, maxMarks, questionType);
  }

  try {
    const result = await model.generateContent({
      contents: [{ parts: [{ text: buildPrompt({ question, hints, modelAnswer, answerText, maxMarks, questionType }) }] }],
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
    const typeRubric = getRubric(questionType);
    const fallback = () => heuristicEval(answerText, hints, maxMarks, questionType);

    return {
      marks: Number.isFinite(marks) ? marks : fallback().marks,
      feedback: String(parsed.feedback || "").trim(),
      improvements: Array.isArray(parsed.improvements) ? parsed.improvements : [],
      rubric: Array.isArray(parsed.rubric) && parsed.rubric.length
        ? parsed.rubric.map((r) => ({
            ...(typeRubric.find((x) => x.key === r.key) || {}),
            key: r.key,
            score: clamp(Number(r.score) || 0, 0, 1),
            remark: String(r.remark || ""),
          }))
        : fallback().rubric,
    };
  } catch (err) {
    // Any model/parse failure degrades to the heuristic so evaluation never 500s.
    const fb = heuristicEval(answerText, hints, maxMarks, questionType);
    fb.feedback = `${fb.feedback} (AI evaluator unavailable: ${err.message})`;
    return fb;
  }
}

module.exports = { evaluateAnswer, heuristicEval, RUBRIC, QUESTION_TYPE_PROFILES, getRubric };
