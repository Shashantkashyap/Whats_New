const mongoose = require("mongoose");
const Question = require("../models/Question");
const Subject = require("../models/Subject");
const Topic = require("../models/Topic");
const QuestionServeCursor = require("../models/QuestionServeCursor");
const { apiOk, apiErr } = require("../utils/apiResponse");
const {
  SUBJECTS,
  SUBJECT_NAMES,
  normalizeSubject,
  subjectForTags,
  findTopicInSubject,
} = require("../config/subjects");
const { resolveTopicRef, loadTaxonomyCache } = require("../utils/taxonomyResolve");
const { pickBatch, buildPoolKey } = require("../utils/questionSample");

const MAX_LIMIT = 100;

// Normalize + validate one incoming question (sync). Requires an exact
// taxonomy topic name OR topic_id. FK ObjectIds are attached async via
// attachTaxonomyIds() before insert.
function toQuestionDoc(raw = {}) {
  const question = String(raw.question || "").trim();
  const type = raw.type === "mains" ? "mains" : "prelims";
  const answer = String(raw.answer || "").trim();
  const options = Array.isArray(raw.options) ? raw.options.map((o) => String(o).trim()).filter(Boolean) : [];

  if (!question) return { error: "question is required" };
  if (type === "prelims") {
    if (!answer) return { error: "answer is required for prelims questions" };
    if (options.length && !options.includes(answer)) {
      return { error: "answer must match one of the options" };
    }
  }

  const topicId = raw.topic_id || raw.topicId || null;
  const topicName = raw.topic ? String(raw.topic).trim() : null;
  if (!topicId && !topicName) {
    return { error: "topic_id (or exact taxonomy topic name) is required" };
  }

  let subject = normalizeSubject(raw.subject) || subjectForTags(raw.tags || []);

  // When only a topic name is supplied, it must be an exact taxonomy entry
  // under the resolved subject (no free-text topics).
  if (!topicId && topicName) {
    if (!SUBJECT_NAMES.includes(subject)) {
      return { error: `unknown subject "${subject}" — use a seeded taxonomy subject` };
    }
    const matched = findTopicInSubject(subject, topicName);
    if (!matched) {
      return { error: `topic must be an exact taxonomy topic under "${subject}"` };
    }
    return {
      doc: {
        type,
        question,
        options,
        answer: answer || undefined,
        explanation: String(raw.explanation || "").trim(),
        hints: Array.isArray(raw.hints) ? raw.hints.map((h) => String(h).trim()).filter(Boolean) : [],
        modelAnswer: String(raw.modelAnswer || "").trim(),
        maxMarks: Number.isFinite(Number(raw.maxMarks)) ? Number(raw.maxMarks) : 10,
        subject,
        topic: matched.name,
        topicId: null, // filled by attachTaxonomyIds
        subjectId: null,
        tags: Array.isArray(raw.tags) ? raw.tags.map((t) => String(t).trim()).filter(Boolean) : [],
        difficulty: ["easy", "medium", "hard"].includes(raw.difficulty) ? raw.difficulty : "medium",
        source: raw.source ? String(raw.source).trim() : null,
        sourceNewsId: mongoose.isValidObjectId(raw.sourceNewsId) ? raw.sourceNewsId : null,
      },
    };
  }

  return {
    doc: {
      type,
      question,
      options,
      answer: answer || undefined,
      explanation: String(raw.explanation || "").trim(),
      hints: Array.isArray(raw.hints) ? raw.hints.map((h) => String(h).trim()).filter(Boolean) : [],
      modelAnswer: String(raw.modelAnswer || "").trim(),
      maxMarks: Number.isFinite(Number(raw.maxMarks)) ? Number(raw.maxMarks) : 10,
      subject: subject || null,
      topic: topicName,
      topicId: mongoose.isValidObjectId(topicId) ? topicId : null,
      subjectId: mongoose.isValidObjectId(raw.subject_id || raw.subjectId) ? (raw.subject_id || raw.subjectId) : null,
      tags: Array.isArray(raw.tags) ? raw.tags.map((t) => String(t).trim()).filter(Boolean) : [],
      difficulty: ["easy", "medium", "hard"].includes(raw.difficulty) ? raw.difficulty : "medium",
      source: raw.source ? String(raw.source).trim() : null,
      sourceNewsId: mongoose.isValidObjectId(raw.sourceNewsId) ? raw.sourceNewsId : null,
    },
  };
}

// Resolve Subject/Topic ObjectIds on validated docs. Drops docs that can't resolve.
async function attachTaxonomyIds(docs) {
  const ready = [];
  const invalid = [];
  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i];
    const resolved = await resolveTopicRef({
      subject: doc.subject,
      topic: doc.topic,
      topicId: doc.topicId,
      subjectId: doc.subjectId,
    });
    if (resolved.error) {
      invalid.push({ index: i, error: resolved.error });
      continue;
    }
    ready.push({
      ...doc,
      subjectId: resolved.subjectId,
      topicId: resolved.topicId,
      subject: resolved.subject,
      topic: resolved.topic,
      retagStatus: resolved.match === "id" ? null : resolved.match,
    });
  }
  return { ready, invalid };
}

// Shared id/taxonomy shaping. `withAnswers` controls whether keys are exposed.
// List + practice return keys (casual client-side check). getById / tests still redact.
function shapeQuestion(q, { withAnswers = false } = {}) {
  if (!q) return q;
  const o = { ...q };
  if (o._id) o.id = String(o._id);
  if (o.subjectId) o.subject_id = String(o.subjectId);
  if (o.topicId) o.topic_id = String(o.topicId);
  if (!withAnswers) {
    delete o.answer;
    delete o.explanation;
    delete o.modelAnswer;
  }
  delete o.__v;
  return o;
}

function publicQuestion(q) {
  return shapeQuestion(q, { withAnswers: false });
}

function practiceQuestion(q) {
  return shapeQuestion(q, { withAnswers: true });
}

function buildListFilter(query = {}) {
  const filter = {};
  if (query.subject) filter.subject = normalizeSubject(query.subject);
  if (query.topic_id && mongoose.isValidObjectId(query.topic_id)) filter.topicId = query.topic_id;
  else if (query.topic) filter.topic = query.topic;
  if (query.tag) filter.tags = { $in: [query.tag] };
  if (["easy", "medium", "hard"].includes(query.difficulty)) filter.difficulty = query.difficulty;
  if (["prelims", "mains"].includes(query.type)) filter.type = query.type;
  return filter;
}

// No-repeat random sample for the caller's filter pool. Prefers unseen ids;
// fills from already-served when the pool is short; resets after a full cycle.
async function sampleQuestionsForUser(userId, source, filter, count, { reset = false } = {}) {
  const poolKey = buildPoolKey(source, {
    subject: filter.subject,
    topicId: filter.topicId,
    topic: filter.topic,
    type: filter.type,
    difficulty: filter.difficulty,
    tag: Array.isArray(filter.tags?.$in) ? filter.tags.$in[0] : undefined,
  });

  const poolDocs = await Question.find(filter).select("_id").lean();
  const poolIds = poolDocs.map((d) => d._id);

  let cursor = await QuestionServeCursor.findOne({ userId, poolKey }).lean();
  if (reset) {
    await QuestionServeCursor.findOneAndUpdate(
      { userId, poolKey },
      { $set: { seenIds: [] } },
      { upsert: true }
    );
    cursor = { seenIds: [] };
  }

  const { picked, nextSeen, meta } = pickBatch(poolIds, cursor?.seenIds || [], count);

  await QuestionServeCursor.findOneAndUpdate(
    { userId, poolKey },
    { $set: { seenIds: nextSeen } },
    { upsert: true }
  );

  if (!picked.length) {
    return { questions: [], meta: { ...meta, pool_key: poolKey, requested: count, count: 0 } };
  }

  const docs = await Question.find({ _id: { $in: picked } }).lean();
  const byId = new Map(docs.map((d) => [String(d._id), d]));
  const questions = picked.map((id) => byId.get(String(id))).filter(Boolean).map(practiceQuestion);

  return {
    questions,
    meta: {
      ...meta,
      pool_key: poolKey,
      requested: count,
      count: questions.length,
      remaining_unseen: Math.max(0, meta.pool_size - nextSeen.length),
    },
  };
}

// GET /api/v1/questions/subjects
async function listSubjects(req, res) {
  try {
    // Prefer DB (seeded) catalogue; fall back to static JSON if seed hasn't run.
    let subjects;
    const dbSubjects = await Subject.find().sort({ name: 1 }).lean();
    if (dbSubjects.length) {
      const topics = await Topic.find().lean();
      const qCounts = await Question.aggregate([
        { $group: { _id: "$subjectId", count: { $sum: 1 } } },
      ]);
      const topicQCounts = await Question.aggregate([
        { $group: { _id: "$topicId", count: { $sum: 1 } } },
      ]);
      const countBySubject = Object.fromEntries(qCounts.map((c) => [String(c._id), c.count]));
      const countByTopic = Object.fromEntries(topicQCounts.map((c) => [String(c._id), c.count]));
      const topicsBySubject = new Map();
      for (const t of topics) {
        const key = String(t.subjectId);
        if (!topicsBySubject.has(key)) topicsBySubject.set(key, []);
        topicsBySubject.get(key).push({
          id: String(t._id),
          name: t.name,
          importance: t.importance,
          question_count: countByTopic[String(t._id)] || 0,
        });
      }
      subjects = dbSubjects.map((s) => {
        const tlist = topicsBySubject.get(String(s._id)) || [];
        tlist.sort((a, b) => b.importance - a.importance || a.name.localeCompare(b.name));
        return {
          id: String(s._id),
          name: s.name,
          topic_count: tlist.length,
          question_count: countBySubject[String(s._id)] || 0,
          topics: tlist,
        };
      });
    } else {
      subjects = SUBJECTS.map((s) => ({
        name: s.name,
        topic_count: s.topics.length,
        question_count: 0,
        topics: s.topics.map((t) => ({ name: t.name, importance: t.importance, question_count: 0 })),
      }));
    }

    const total = subjects.reduce((sum, s) => sum + (s.question_count || 0), 0);
    return apiOk(res, { subjects, total_questions: total });
  } catch (err) {
    return apiErr(res, "SUBJECTS_FETCH_FAILED", err.message, 500);
  }
}

// GET /api/v1/questions?subject=&topic=&topic_id=&tag=&difficulty=&type=&limit=&reset=
// Always random, no-repeat across calls for this user+filter until the pool cycles.
// Includes answer + explanation (casual practice). Use POST /tests for scored attempts.
async function listQuestions(req, res) {
  try {
    const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const filter = buildListFilter(req.query);
    const reset = /^(1|true|yes)$/i.test(String(req.query.reset || ""));
    const { questions, meta } = await sampleQuestionsForUser(req.user.id, "list", filter, limit, { reset });
    return apiOk(res, { questions }, {
      metadata: {
        ...meta,
        subject: filter.subject || "all",
        topic_id: filter.topicId || null,
        random: true,
        no_repeat: true,
      },
    });
  } catch (err) {
    return apiErr(res, "QUESTIONS_FETCH_FAILED", err.message, 500);
  }
}

// GET /api/v1/questions/practice?subject=&topic=&topic_id=&count=&reset=
async function getPractice(req, res) {
  try {
    const count = Math.min(MAX_LIMIT, Math.max(1, parseInt(req.query.count, 10) || 10));
    const filter = buildListFilter(req.query);
    const reset = /^(1|true|yes)$/i.test(String(req.query.reset || ""));
    const { questions, meta } = await sampleQuestionsForUser(req.user.id, "practice", filter, count, { reset });
    return apiOk(res, { questions }, {
      metadata: {
        ...meta,
        subject: filter.subject || "all",
        topic_id: filter.topicId || null,
        random: true,
        no_repeat: true,
      },
    });
  } catch (err) {
    return apiErr(res, "PRACTICE_FETCH_FAILED", err.message, 500);
  }
}

async function createQuestions(req, res) {
  try {
    const incoming = Array.isArray(req.body.questions)
      ? req.body.questions
      : Array.isArray(req.body)
      ? req.body
      : [req.body];

    const docs = [];
    const invalid = [];
    incoming.forEach((raw, i) => {
      const { doc, error } = toQuestionDoc(raw);
      if (error) invalid.push({ index: i, error });
      else docs.push(doc);
    });

    let ready = [];
    if (docs.length) {
      try {
        await loadTaxonomyCache();
      } catch (err) {
        return apiErr(res, "TAXONOMY_NOT_SEEDED", "Run seed taxonomy before inserting questions.", 503);
      }
      const attached = await attachTaxonomyIds(docs);
      ready = attached.ready;
      invalid.push(...attached.invalid.map((x) => ({ ...x, index: x.index })));
    }

    let inserted = [];
    if (ready.length) {
      try {
        inserted = await Question.insertMany(ready, { ordered: false });
      } catch (bulkErr) {
        inserted = bulkErr.insertedDocs || [];
      }
    }

    return apiOk(res, {
      inserted: inserted.length,
      skipped_or_invalid: incoming.length - inserted.length,
      invalid,
    }, { statusCode: 201 });
  } catch (err) {
    return apiErr(res, "QUESTIONS_CREATE_FAILED", err.message, 500);
  }
}

async function getQuestionById(req, res) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return apiErr(res, "QUESTION_NOT_FOUND", "No question exists for the supplied id.", 404);
    }
    const q = await Question.findById(req.params.id).lean();
    if (!q) return apiErr(res, "QUESTION_NOT_FOUND", "No question exists for the supplied id.", 404);
    return apiOk(res, publicQuestion(q));
  } catch (err) {
    return apiErr(res, "QUESTION_FETCH_FAILED", err.message, 500);
  }
}

module.exports = {
  listSubjects,
  listQuestions,
  getPractice,
  createQuestions,
  getQuestionById,
  toQuestionDoc,
  attachTaxonomyIds,
  publicQuestion,
  practiceQuestion,
};
