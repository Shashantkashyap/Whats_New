// #!/usr/bin/env node
// /**
//  * generateQuestions.js — topic-first question bank generation via Gemini.
//  *
//  * Iterates taxonomy Topics (optionally filtered / capped), asks Gemini for
//  * N prelims + M mains per topic, and inserts via toQuestionDoc + attachTaxonomyIds.
//  *
//  * Usage:
//  *   node scripts/generateQuestions.js [prelimsPerTopic] [mainsPerTopic] [subjectFilter]
//  *   PRELIMS_PER_TOPIC=3 MAINS_PER_TOPIC=1 node scripts/generateQuestions.js
//  *   node scripts/generateQuestions.js 2 1 "Polity & Governance"
//  *   MIN_IMPORTANCE=4 node scripts/generateQuestions.js   # only high-yield topics
//  *   TOPICS_PER_RUN=8 node scripts/generateQuestions.js   # capped batch (scheduler)
//  *
//  * Prerequisite: `make seed-taxonomy`
//  */

// const path = require("path");
// require("dotenv").config({ path: path.resolve(__dirname, "../../../.env") });
// require("dotenv").config();

// const mongoose = require("mongoose");
// const { SchemaType } = require("@google/generative-ai");
// const geminiModel = require("../config/gemni");
// const connectDB = require("../config/db");
// const Question = require("../models/Question");
// const { allTopics } = require("../config/subjects");
// const { toQuestionDoc, attachTaxonomyIds } = require("../controllers/questionController");
// const { loadTaxonomyCache } = require("../utils/taxonomyResolve");

// const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// const RESPONSE_SCHEMA = {
//   type: SchemaType.OBJECT,
//   properties: {
//     prelims: {
//       type: SchemaType.ARRAY,
//       items: {
//         type: SchemaType.OBJECT,
//         properties: {
//           question: { type: SchemaType.STRING },
//           options: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
//           answer: { type: SchemaType.STRING },
//           explanation: { type: SchemaType.STRING },
//           difficulty: { type: SchemaType.STRING },
//         },
//         required: ["question", "options", "answer", "explanation"],
//       },
//     },
//     mains: {
//       type: SchemaType.ARRAY,
//       items: {
//         type: SchemaType.OBJECT,
//         properties: {
//           question: { type: SchemaType.STRING },
//           hints: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
//           modelAnswer: { type: SchemaType.STRING },
//         },
//         required: ["question", "hints"],
//       },
//     },
//   },
//   required: ["prelims", "mains"],
// };

// function buildPrompt(subject, topic, prelimsPerTopic, mainsPerTopic) {
//   return `You are a senior UPSC Civil Services exam question setter.
// Generate high-quality, factually correct, exam-style questions for ONE topic only.

// Subject: ${subject}
// Topic (use EXACTLY this scope — do not drift): ${topic}

// Produce EXACTLY:
// - ${prelimsPerTopic} Prelims MCQs: clear stem, exactly 4 plausible options, one correct "answer" IDENTICAL to one option, 1-2 sentence "explanation", difficulty easy|medium|hard.
// - ${mainsPerTopic} Mains questions: 10-15 marker style, 3-4 "hints" (dimensions, NOT the full answer), concise "modelAnswer" (4-6 sentences).

// Rules: no duplicates; facts accurate; MCQ answer must exactly match one option string.`;
// }

// async function generateForTopic(subject, topic, { prelimsPerTopic = 3, mainsPerTopic = 1 } = {}) {
//   const result = await geminiModel.generateContent({
//     contents: [{ parts: [{ text: buildPrompt(subject, topic, prelimsPerTopic, mainsPerTopic) }] }],
//     generationConfig: {
//       temperature: 0.7,
//       maxOutputTokens: 8192,
//       responseMimeType: "application/json",
//       responseSchema: RESPONSE_SCHEMA,
//     },
//   });
//   const raw = typeof result.response?.text === "function" ? result.response.text() : result?.response;
//   const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;

//   const docs = [];
//   let invalid = 0;
//   for (const p of parsed.prelims || []) {
//     const { doc, error } = toQuestionDoc({
//       type: "prelims",
//       question: p.question,
//       options: p.options,
//       answer: p.answer,
//       explanation: p.explanation,
//       difficulty: p.difficulty,
//       subject,
//       topic, // exact taxonomy topic — never free-text from the model
//       source: "gemini-generated",
//     });
//     if (error) invalid++;
//     else docs.push(doc);
//   }
//   for (const mq of parsed.mains || []) {
//     const { doc, error } = toQuestionDoc({
//       type: "mains",
//       question: mq.question,
//       hints: mq.hints,
//       modelAnswer: mq.modelAnswer,
//       maxMarks: 15,
//       subject,
//       topic,
//       source: "gemini-generated",
//     });
//     if (error) invalid++;
//     else docs.push(doc);
//   }

//   const { ready, invalid: resolveInvalid } = await attachTaxonomyIds(docs);
//   invalid += resolveInvalid.length;

//   let inserted = 0;
//   if (ready.length) {
//     try {
//       const res = await Question.insertMany(ready, { ordered: false });
//       inserted = res.length;
//     } catch (err) {
//       inserted = err.insertedDocs ? err.insertedDocs.length : 0;
//     }
//   }
//   return { generated: docs.length + invalid, inserted, invalid, skipped: ready.length - inserted };
// }

// // Rotate a capped slice so hourly cron covers different topics over time.
// function pickTopics(topics, limit, hourOffset = Math.floor(Date.now() / 3600000)) {
//   if (!limit || limit >= topics.length) return topics;
//   const offset = (hourOffset * limit) % topics.length;
//   const out = [];
//   for (let i = 0; i < limit; i++) out.push(topics[(offset + i) % topics.length]);
//   return out;
// }

// /**
//  * @param {object} [opts]
//  * @param {number} [opts.prelimsPerTopic]
//  * @param {number} [opts.mainsPerTopic]
//  * @param {string|null} [opts.subjectFilter]
//  * @param {number} [opts.minImportance]
//  * @param {number|null} [opts.topicsPerRun]  Cap batch size (scheduler). Null = all.
//  * @param {number} [opts.delayMs]
//  * @param {boolean} [opts.connect]  Open DB if needed (CLI). Scheduler assumes already connected.
//  * @param {boolean} [opts.close]     Close mongoose when done (CLI only).
//  */
// async function runQuestionGeneration(opts = {}) {
//   const prelimsPerTopic = opts.prelimsPerTopic ?? (parseInt(process.env.PRELIMS_PER_TOPIC || process.env.PRELIMS_PER_SUBJECT, 10) || 3);
//   const mainsPerTopic = opts.mainsPerTopic ?? (parseInt(process.env.MAINS_PER_TOPIC || process.env.MAINS_PER_SUBJECT, 10) || 1);
//   const subjectFilter = opts.subjectFilter !== undefined ? opts.subjectFilter : (process.env.SUBJECT || null);
//   const minImportance = opts.minImportance ?? (parseInt(process.env.MIN_IMPORTANCE, 10) || 1);
//   const topicsPerRun = opts.topicsPerRun !== undefined
//     ? opts.topicsPerRun
//     : (process.env.TOPICS_PER_RUN ? parseInt(process.env.TOPICS_PER_RUN, 10) : null);
//   const delayMs = opts.delayMs ?? (parseInt(process.env.DELAY_MS, 10) || 1200);
//   const doConnect = opts.connect !== false;
//   const doClose = !!opts.close;

//   if (!process.env.GEMINI_API_KEY) {
//     throw new Error("GEMINI_API_KEY is not set — cannot generate.");
//   }
//   if (doConnect) await connectDB();
//   await loadTaxonomyCache();

//   let topics = allTopics().filter((t) => t.importance >= minImportance);
//   if (subjectFilter) {
//     topics = topics.filter((t) => t.subject.toLowerCase() === String(subjectFilter).toLowerCase());
//   }
//   // High-importance first so interrupted / capped runs still cover exam-critical set.
//   topics.sort((a, b) => b.importance - a.importance || a.subject.localeCompare(b.subject));
//   topics = pickTopics(topics, topicsPerRun);

//   if (!topics.length) {
//     throw new Error("No topics match the filter. Seed taxonomy? Check SUBJECT / MIN_IMPORTANCE.");
//   }

//   console.log(
//     `🧠 Topic-first generation: ${prelimsPerTopic} prelims + ${mainsPerTopic} mains × ${topics.length} topics` +
//       (topicsPerRun ? ` (capped)` : "")
//   );

//   const totals = { inserted: 0, invalid: 0, skipped: 0, topics: topics.length };
//   for (const t of topics) {
//     try {
//       const r = await generateForTopic(t.subject, t.name, { prelimsPerTopic, mainsPerTopic });
//       totals.inserted += r.inserted;
//       totals.invalid += r.invalid;
//       totals.skipped += r.skipped;
//       console.log(`  ✅ [imp ${t.importance}] ${t.subject} → ${t.name}  +${r.inserted} (dupes ${r.skipped}, invalid ${r.invalid})`);
//     } catch (err) {
//       console.log(`  ⚠️  ${t.subject} → ${t.name}  FAILED: ${err.message}`);
//     }
//     await sleep(delayMs);
//   }

//   const total = await Question.countDocuments();
//   console.log(`📦 Done. Inserted ${totals.inserted} new. Question bank now holds ${total} questions.`);
//   if (doClose) await mongoose.connection.close();
//   return { ...totals, bankSize: total };
// }

// async function main() {
//   const prelimsPerTopic = parseInt(process.argv[2] || process.env.PRELIMS_PER_TOPIC || process.env.PRELIMS_PER_SUBJECT, 10) || 3;
//   const mainsPerTopic = parseInt(process.argv[3] || process.env.MAINS_PER_TOPIC || process.env.MAINS_PER_SUBJECT, 10) || 1;
//   const subjectFilter = process.argv[4] || process.env.SUBJECT || null;
//   await runQuestionGeneration({
//     prelimsPerTopic,
//     mainsPerTopic,
//     subjectFilter,
//     connect: true,
//     close: true,
//   });
// }

// if (require.main === module) {
//   main().catch((e) => {
//     console.error("❌ Generation failed:", e.message);
//     process.exit(1);
//   });
// }

// module.exports = { generateForTopic, runQuestionGeneration, pickTopics };





/**
 * generateQuestions.js — topic-first question bank generation via Gemini.
 *
 * v2 changes:
 * - MCQ correctness is now driven by a `correctIndex` (0-3) instead of a
 *   duplicated `answer` text string. The server derives the answer text —
 *   the model never gets to independently disagree with itself.
 * - The model is explicitly barred from referencing option labels (A/B/C/D)
 *   inside the explanation, so a label-level mismatch structurally can't
 *   happen — only content-level review is needed.
 * - A cheap word-overlap consistency check runs before insert; anything
 *   suspicious is quarantined as `needs_review` instead of auto-published.
 * - Prompt rewritten to match current UPSC prelims pattern (statement-based /
 *   assertion-reason mix, few-shot anchor) and mains marks (10 vs 15).
 * - temperature lowered 0.7 -> 0.45 for factual reliability.
 *
 * Usage:
 *   node scripts/generateQuestions.js [prelimsPerTopic] [mainsPerTopic] [subjectFilter]
 *   PRELIMS_PER_TOPIC=3 MAINS_PER_TOPIC=1 node scripts/generateQuestions.js
 *   node scripts/generateQuestions.js 2 1 "Polity & Governance"
 *   MIN_IMPORTANCE=4 node scripts/generateQuestions.js   # only high-yield topics
 *   TOPICS_PER_RUN=8 node scripts/generateQuestions.js   # capped batch (scheduler)
 *
 * Prerequisite: `make seed-taxonomy`
 */

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../../../.env") });
require("dotenv").config();

const mongoose = require("mongoose");
const { SchemaType } = require("@google/generative-ai");
const geminiModel = require("../config/gemni");
const connectDB = require("../config/db");
const Question = require("../models/Question");
const { allTopics } = require("../config/subjects");
const { toQuestionDoc, attachTaxonomyIds } = require("../controllers/questionController");
const { loadTaxonomyCache } = require("../utils/taxonomyResolve");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const RESPONSE_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    prelims: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          question: { type: SchemaType.STRING },
          options: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
          // Index (0-3) into `options`, NOT a duplicated text string. The
          // server derives the final answer text from this — the model
          // never gets a second, independently-hallucinatable copy of it.
          correctIndex: { type: SchemaType.NUMBER },
          explanation: { type: SchemaType.STRING },
          difficulty: { type: SchemaType.STRING },
          format: { type: SchemaType.STRING }, // "statement" | "assertion_reason" | "direct" | "matching"
        },
        required: ["question", "options", "correctIndex", "explanation"],
      },
    },
    mains: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          question: { type: SchemaType.STRING },
          hints: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
          modelAnswer: { type: SchemaType.STRING },
          maxMarks: { type: SchemaType.NUMBER }, // 10 or 15
        },
        required: ["question", "hints", "maxMarks"],
      },
    },
  },
  required: ["prelims", "mains"],
};

const FEW_SHOT_PRELIMS = `Example of the expected PRELIMS style (statement-based, current UPSC pattern):
{
  "question": "Consider the following statements regarding the Finance Commission:\\n1. It is a constitutional body under Article 280.\\n2. Its recommendations are binding on the Union Government.\\n3. It recommends the distribution of net proceeds of taxes between the Union and the States.\\nHow many of the above statements are correct?",
  "options": ["Only one", "Only two", "All three", "None"],
  "correctIndex": 1,
  "explanation": "The Finance Commission is indeed a constitutional body and does recommend tax devolution between the Union and States. However, its recommendations are only advisory in nature and not binding on the government, which is why exactly two of the three statements hold.",
  "difficulty": "medium",
  "format": "statement"
}
Note: the explanation never says "statement 2 is wrong" by number/letter alone — it names what is actually true or false in plain language, so it stays consistent even if statement order changes.`;

function buildPrompt(subject, topic, prelimsPerTopic, mainsPerTopic) {
  return `You are a senior UPSC Civil Services exam question setter, calibrated to the CURRENT (2023-2025) UPSC Prelims and Mains pattern — not the older pre-2015 direct-recall style.

Subject: ${subject}
Topic (use EXACTLY this scope — do not drift): ${topic}

${FEW_SHOT_PRELIMS}

Produce EXACTLY:
- ${prelimsPerTopic} Prelims MCQs, following the CURRENT pattern mix:
  - Roughly half should be statement-based ("Consider the following statements... How many of the above are correct?" / "Which of the above is/are correct?").
  - Include at least one assertion-reason or matching-type question if the topic allows it naturally; do not force it if it doesn't fit.
  - Exactly 4 options, roughly equal in length. Never use giveaway absolute wording ("always", "never", "none of the above") as a filler distractor.
  - "correctIndex": the 0-based index of the correct option in "options" — this is the ONLY place correctness is indicated.
  - "explanation": 1-2 sentences. Explain the correct answer by CONTENT ONLY — never reference option letters/numbers/labels (no "Option B", no "statement 2"). Describe what is factually true or false so the explanation stays correct even if option order is shuffled later.
  - "difficulty": easy | medium | hard — bias towards medium/hard, matching real exam difficulty distribution.
  - "format": one of statement | assertion_reason | direct | matching.

- ${mainsPerTopic} Mains questions, following current GS pattern:
  - Use an actual UPSC command word: Discuss / Critically examine / Analyse / Elucidate / Comment / Evaluate.
  - "maxMarks": 10 or 15 — pick 15 if the topic needs multi-dimensional treatment (causes+impact+way forward), 10 if it's narrower.
  - "hints": 3-4 dimensions the answer should cover (NOT the full answer).
  - "modelAnswer": a compact model answer that itself follows examiner-friendly structure — brief intro, 3-4 bullet-style points covering the hints, and a concluding way-forward/suggestion line. 4-8 sentences depending on maxMarks.

Rules: no duplicates; facts must be accurate and current as of the topic's static/dynamic relevance; MCQ correctness must be unambiguous — exactly one option should be defensibly correct.`;
}

// Cheap heuristic: does the explanation's wording line up with the option
// marked correct, rather than with a different option? Not a proof of
// correctness — a tripwire to catch the "explanation talks about D but
// correctIndex points at B" failure mode before it reaches the DB.
function wordOverlap(a, b) {
  const setA = new Set(String(a).toLowerCase().match(/[a-z]{4,}/g) || []);
  const setB = new Set(String(b).toLowerCase().match(/[a-z]{4,}/g) || []);
  if (!setA.size || !setB.size) return 0;
  let hits = 0;
  for (const w of setB) if (setA.has(w)) hits++;
  return hits / setB.size;
}

function checkMCQConsistency(p) {
  const issues = [];
  const idx = p.correctIndex;
  if (!Array.isArray(p.options) || p.options.length !== 4) {
    issues.push("options array is not exactly 4 items");
  }
  if (!Number.isInteger(idx) || idx < 0 || idx > 3) {
    issues.push("correctIndex missing or out of range 0-3");
  }
  // Explanation must reference no option label at all — if it does, that's
  // exactly the failure mode we're eliminating; flag it for human review.
  if (/\b(option\s?[a-d1-4]|statement\s?[1-4])\s*(is|are)?\s*(correct|wrong|incorrect|true|false)\b/i.test(p.explanation || "")) {
    issues.push("explanation references an option/statement label directly — re-check by content");
  }
  if (Array.isArray(p.options) && Number.isInteger(idx) && p.options[idx]) {
    const correctOverlap = wordOverlap(p.explanation, p.options[idx]);
    const otherOverlaps = p.options
      .filter((_, i) => i !== idx)
      .map((opt) => wordOverlap(p.explanation, opt));
    const maxOther = Math.max(0, ...otherOverlaps);
    // If the explanation's vocabulary matches a WRONG option more closely
    // than the marked-correct one, something's off — quarantine it.
    if (maxOther > correctOverlap && maxOther > 0.3) {
      issues.push("explanation content overlaps more with a non-correct option than the marked answer");
    }
  }
  return { ok: issues.length === 0, issues };
}

async function generateForTopic(subject, topic, { prelimsPerTopic = 3, mainsPerTopic = 1 } = {}) {
  const result = await geminiModel.generateContent({
    contents: [{ parts: [{ text: buildPrompt(subject, topic, prelimsPerTopic, mainsPerTopic) }] }],
    generationConfig: {
      temperature: 0.45, // was 0.7 — factual MCQ generation needs less creative drift
      maxOutputTokens: 8192,
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
    },
  });
  const raw = typeof result.response?.text === "function" ? result.response.text() : result?.response;
  const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;

  const docs = [];
  const reviewQueue = [];
  let invalid = 0;

  for (const p of parsed.prelims || []) {
    const { ok, issues } = checkMCQConsistency(p);
    if (!ok) {
      reviewQueue.push({ subject, topic, question: p.question, issues, raw: p });
      continue;
    }
    // Server derives the answer text — never trust a model-supplied duplicate.
    const answer = p.options[p.correctIndex];
    const { doc, error } = toQuestionDoc({
      type: "prelims",
      question: p.question,
      options: p.options,
      answer,
      explanation: p.explanation,
      difficulty: p.difficulty,
      format: p.format,
      subject,
      topic, // exact taxonomy topic — never free-text from the model
      source: "gemini-generated",
    });
    if (error) invalid++;
    else docs.push(doc);
  }

  for (const mq of parsed.mains || []) {
    const { doc, error } = toQuestionDoc({
      type: "mains",
      question: mq.question,
      hints: mq.hints,
      modelAnswer: mq.modelAnswer,
      maxMarks: [10, 15].includes(mq.maxMarks) ? mq.maxMarks : 15,
      subject,
      topic,
      source: "gemini-generated",
    });
    if (error) invalid++;
    else docs.push(doc);
  }

  const { ready, invalid: resolveInvalid } = await attachTaxonomyIds(docs);
  invalid += resolveInvalid.length;

  let inserted = 0;
  if (ready.length) {
    try {
      const res = await Question.insertMany(ready, { ordered: false });
      inserted = res.length;
    } catch (err) {
      inserted = err.insertedDocs ? err.insertedDocs.length : 0;
    }
  }

  if (reviewQueue.length) {
    console.log(`  🕵️  ${reviewQueue.length} prelims flagged for manual review (${topic}):`);
    for (const r of reviewQueue) console.log(`     - ${r.issues.join("; ")}`);
    // TODO: persist reviewQueue somewhere queryable (a "needs_review" collection
    // or a status field on Question) instead of only logging — logging alone
    // means flagged questions are silently lost once the process exits.
  }

  return {
    generated: docs.length + invalid + reviewQueue.length,
    inserted,
    invalid,
    skipped: ready.length - inserted,
    flaggedForReview: reviewQueue.length,
  };
}

// Rotate a capped slice so hourly cron covers different topics over time.
function pickTopics(topics, limit, hourOffset = Math.floor(Date.now() / 3600000)) {
  if (!limit || limit >= topics.length) return topics;
  const offset = (hourOffset * limit) % topics.length;
  const out = [];
  for (let i = 0; i < limit; i++) out.push(topics[(offset + i) % topics.length]);
  return out;
}

/**
 * @param {object} [opts]
 * @param {number} [opts.prelimsPerTopic]
 * @param {number} [opts.mainsPerTopic]
 * @param {string|null} [opts.subjectFilter]
 * @param {number} [opts.minImportance]
 * @param {number|null} [opts.topicsPerRun]  Cap batch size (scheduler). Null = all.
 * @param {number} [opts.delayMs]
 * @param {boolean} [opts.connect]  Open DB if needed (CLI). Scheduler assumes already connected.
 * @param {boolean} [opts.close]     Close mongoose when done (CLI only).
 */
async function runQuestionGeneration(opts = {}) {
  const prelimsPerTopic = opts.prelimsPerTopic ?? (parseInt(process.env.PRELIMS_PER_TOPIC || process.env.PRELIMS_PER_SUBJECT, 10) || 3);
  const mainsPerTopic = opts.mainsPerTopic ?? (parseInt(process.env.MAINS_PER_TOPIC || process.env.MAINS_PER_SUBJECT, 10) || 1);
  const subjectFilter = opts.subjectFilter !== undefined ? opts.subjectFilter : (process.env.SUBJECT || null);
  const minImportance = opts.minImportance ?? (parseInt(process.env.MIN_IMPORTANCE, 10) || 1);
  const topicsPerRun = opts.topicsPerRun !== undefined
    ? opts.topicsPerRun
    : (process.env.TOPICS_PER_RUN ? parseInt(process.env.TOPICS_PER_RUN, 10) : null);
  const delayMs = opts.delayMs ?? (parseInt(process.env.DELAY_MS, 10) || 1200);
  const doConnect = opts.connect !== false;
  const doClose = !!opts.close;

  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not set — cannot generate.");
  }
  if (doConnect) await connectDB();
  await loadTaxonomyCache();

  let topics = allTopics().filter((t) => t.importance >= minImportance);
  if (subjectFilter) {
    topics = topics.filter((t) => t.subject.toLowerCase() === String(subjectFilter).toLowerCase());
  }
  // High-importance first so interrupted / capped runs still cover exam-critical set.
  topics.sort((a, b) => b.importance - a.importance || a.subject.localeCompare(b.subject));
  topics = pickTopics(topics, topicsPerRun);

  if (!topics.length) {
    throw new Error("No topics match the filter. Seed taxonomy? Check SUBJECT / MIN_IMPORTANCE.");
  }

  console.log(
    `🧠 Topic-first generation: ${prelimsPerTopic} prelims + ${mainsPerTopic} mains × ${topics.length} topics` +
      (topicsPerRun ? ` (capped)` : "")
  );

  const totals = { inserted: 0, invalid: 0, skipped: 0, flaggedForReview: 0, topics: topics.length };
  for (const t of topics) {
    try {
      const r = await generateForTopic(t.subject, t.name, { prelimsPerTopic, mainsPerTopic });
      totals.inserted += r.inserted;
      totals.invalid += r.invalid;
      totals.skipped += r.skipped;
      totals.flaggedForReview += r.flaggedForReview;
      console.log(`  ✅ [imp ${t.importance}] ${t.subject} → ${t.name}  +${r.inserted} (dupes ${r.skipped}, invalid ${r.invalid}, review ${r.flaggedForReview})`);
    } catch (err) {
      console.log(`  ⚠️  ${t.subject} → ${t.name}  FAILED: ${err.message}`);
    }
    await sleep(delayMs);
  }

  const total = await Question.countDocuments();
  console.log(`📦 Done. Inserted ${totals.inserted} new (${totals.flaggedForReview} flagged for review). Question bank now holds ${total} questions.`);
  if (doClose) await mongoose.connection.close();
  return { ...totals, bankSize: total };
}

async function main() {
  const prelimsPerTopic = parseInt(process.argv[2] || process.env.PRELIMS_PER_TOPIC || process.env.PRELIMS_PER_SUBJECT, 10) || 3;
  const mainsPerTopic = parseInt(process.argv[3] || process.env.MAINS_PER_TOPIC || process.env.MAINS_PER_SUBJECT, 10) || 1;
  const subjectFilter = process.argv[4] || process.env.SUBJECT || null;
  await runQuestionGeneration({
    prelimsPerTopic,
    mainsPerTopic,
    subjectFilter,
    connect: true,
    close: true,
  });
}

if (require.main === module) {
  main().catch((e) => {
    console.error("❌ Generation failed:", e.message);
    process.exit(1);
  });
}

module.exports = { generateForTopic, runQuestionGeneration, pickTopics, checkMCQConsistency };
