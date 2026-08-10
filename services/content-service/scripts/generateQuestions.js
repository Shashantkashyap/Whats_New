#!/usr/bin/env node
/**
 * generateQuestions.js — topic-first question bank generation via Gemini.
 *
 * Iterates taxonomy Topics (optionally filtered / capped), asks Gemini for
 * N prelims + M mains per topic, and inserts via toQuestionDoc + attachTaxonomyIds.
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
          answer: { type: SchemaType.STRING },
          explanation: { type: SchemaType.STRING },
          difficulty: { type: SchemaType.STRING },
        },
        required: ["question", "options", "answer", "explanation"],
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
        },
        required: ["question", "hints"],
      },
    },
  },
  required: ["prelims", "mains"],
};

function buildPrompt(subject, topic, prelimsPerTopic, mainsPerTopic) {
  return `You are a senior UPSC Civil Services exam question setter.
Generate high-quality, factually correct, exam-style questions for ONE topic only.

Subject: ${subject}
Topic (use EXACTLY this scope — do not drift): ${topic}

Produce EXACTLY:
- ${prelimsPerTopic} Prelims MCQs: clear stem, exactly 4 plausible options, one correct "answer" IDENTICAL to one option, 1-2 sentence "explanation", difficulty easy|medium|hard.
- ${mainsPerTopic} Mains questions: 10-15 marker style, 3-4 "hints" (dimensions, NOT the full answer), concise "modelAnswer" (4-6 sentences).

Rules: no duplicates; facts accurate; MCQ answer must exactly match one option string.`;
}

async function generateForTopic(subject, topic, { prelimsPerTopic = 3, mainsPerTopic = 1 } = {}) {
  const result = await geminiModel.generateContent({
    contents: [{ parts: [{ text: buildPrompt(subject, topic, prelimsPerTopic, mainsPerTopic) }] }],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 8192,
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
    },
  });
  const raw = typeof result.response?.text === "function" ? result.response.text() : result?.response;
  const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;

  const docs = [];
  let invalid = 0;
  for (const p of parsed.prelims || []) {
    const { doc, error } = toQuestionDoc({
      type: "prelims",
      question: p.question,
      options: p.options,
      answer: p.answer,
      explanation: p.explanation,
      difficulty: p.difficulty,
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
      maxMarks: 15,
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
  return { generated: docs.length + invalid, inserted, invalid, skipped: ready.length - inserted };
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

  const totals = { inserted: 0, invalid: 0, skipped: 0, topics: topics.length };
  for (const t of topics) {
    try {
      const r = await generateForTopic(t.subject, t.name, { prelimsPerTopic, mainsPerTopic });
      totals.inserted += r.inserted;
      totals.invalid += r.invalid;
      totals.skipped += r.skipped;
      console.log(`  ✅ [imp ${t.importance}] ${t.subject} → ${t.name}  +${r.inserted} (dupes ${r.skipped}, invalid ${r.invalid})`);
    } catch (err) {
      console.log(`  ⚠️  ${t.subject} → ${t.name}  FAILED: ${err.message}`);
    }
    await sleep(delayMs);
  }

  const total = await Question.countDocuments();
  console.log(`📦 Done. Inserted ${totals.inserted} new. Question bank now holds ${total} questions.`);
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

module.exports = { generateForTopic, runQuestionGeneration, pickTopics };
