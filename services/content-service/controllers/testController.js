const mongoose = require("mongoose");
const Question = require("../models/Question");
const Topic = require("../models/Topic");
const Test = require("../models/Test");
const { apiOk, apiErr } = require("../utils/apiResponse");
const {
  validateTestParams,
  buildQuestionFilter,
  weightedSample,
  toTestItem,
  toDisplayItem,
  toResultItem,
  gradePrelims,
  answersToMap,
} = require("../utils/testEngine");
const { evaluateAnswer } = require("../utils/mainsEvaluator");
const { normalizeSubject } = require("../config/subjects");
const { resolveSubjectRef, resolveTopicRef } = require("../utils/taxonomyResolve");

const MAX_QUESTIONS = 50;

// Shape the client sees for a test that is still open (no answers leaked).
function toTestView(test) {
  return {
    id: String(test._id),
    exam_type: test.examType,
    mode: test.mode,
    subject: test.subject,
    topic: test.topic,
    subject_id: test.subjectId ? String(test.subjectId) : null,
    topic_id: test.topicId ? String(test.topicId) : null,
    status: test.status,
    total_questions: test.items.length,
    questions: test.items.map((it) => toDisplayItem(it, test.examType)),
  };
}

// Pull a question pool; mixed mode weights by Topic.importance so high-yield
// topics appear more often in full-length tests.
async function pickQuestions(filter, count, { weighted = false } = {}) {
  if (!weighted) {
    return Question.aggregate([{ $match: filter }, { $sample: { size: count } }]);
  }
  const pool = await Question.find(filter).lean();
  if (!pool.length) return [];
  const topicIds = [...new Set(pool.map((q) => String(q.topicId)).filter((id) => id && id !== "null"))];
  const topics = await Topic.find({ _id: { $in: topicIds } }).select("importance").lean();
  const importanceByTopic = Object.fromEntries(topics.map((t) => [String(t._id), t.importance || 1]));
  return weightedSample(pool, count, (q) => importanceByTopic[String(q.topicId)] || 1);
}

// POST /api/v1/tests
// body: { examType, mode, subject?, topic?, subject_id?, topic_id?, count? }
async function createTest(req, res) {
  try {
    const userId = req.user && req.user.id;
    const examType = req.body.examType;
    const mode = req.body.mode;
    let subject = req.body.subject ? normalizeSubject(req.body.subject) : null;
    let topic = req.body.topic || null;
    let subjectId = mongoose.isValidObjectId(req.body.subject_id) ? req.body.subject_id : null;
    let topicId = mongoose.isValidObjectId(req.body.topic_id) ? req.body.topic_id : null;
    const count = Math.min(MAX_QUESTIONS, Math.max(1, parseInt(req.body.count, 10) || 10));

    if (mode === "topic_wise") {
      const resolved = await resolveTopicRef({ subject, topic, topicId, subjectId });
      if (resolved.error) return apiErr(res, "TEST_INVALID_PARAMS", resolved.error, 400);
      subject = resolved.subject;
      topic = resolved.topic;
      subjectId = resolved.subjectId;
      topicId = resolved.topicId;
    } else if (mode === "subject_wise") {
      const resolved = await resolveSubjectRef({ subject, subjectId });
      if (resolved.error) return apiErr(res, "TEST_INVALID_PARAMS", resolved.error, 400);
      subject = resolved.subject;
      subjectId = resolved.subjectId;
    }

    const { error } = validateTestParams({ examType, mode, subject, topic, subjectId, topicId });
    if (error) return apiErr(res, "TEST_INVALID_PARAMS", error, 400);

    const filter = buildQuestionFilter({ examType, mode, subject, topic, subjectId, topicId });
    const picked = await pickQuestions(filter, count, { weighted: mode === "mixed" });
    if (!picked.length) {
      return apiErr(res, "TEST_NO_QUESTIONS", "No questions available for the selected mode/subject/topic.", 404);
    }

    const test = await Test.create({
      userId,
      examType,
      mode,
      subject,
      topic,
      subjectId: subjectId || null,
      topicId: topicId || null,
      status: "created",
      items: picked.map(toTestItem),
    });

    return apiOk(res, toTestView(test), { statusCode: 201 });
  } catch (err) {
    return apiErr(res, "TEST_CREATE_FAILED", err.message, 500);
  }
}

// Load a test owned by the caller, or send the appropriate error.
async function loadOwnedTest(req, res) {
  const userId = req.user && req.user.id;
  if (!mongoose.isValidObjectId(req.params.id)) {
    apiErr(res, "TEST_NOT_FOUND", "No test exists for the supplied id.", 404);
    return null;
  }
  const test = await Test.findById(req.params.id);
  if (!test) {
    apiErr(res, "TEST_NOT_FOUND", "No test exists for the supplied id.", 404);
    return null;
  }
  if (String(test.userId) !== String(userId)) {
    apiErr(res, "TEST_FORBIDDEN", "This test belongs to another user.", 403);
    return null;
  }
  return test;
}

// GET /api/v1/tests/:id
// Pre-submission display (prelims: options only; mains: hints only). Once
// evaluated, returns the full results view instead.
async function getTest(req, res) {
  try {
    const test = await loadOwnedTest(req, res);
    if (!test) return;
    if (test.status === "evaluated") return apiOk(res, buildResults(test));
    return apiOk(res, toTestView(test));
  } catch (err) {
    return apiErr(res, "TEST_FETCH_FAILED", err.message, 500);
  }
}

// GET /api/v1/tests  (the caller's test history)
async function listTests(req, res) {
  try {
    const userId = req.user && req.user.id;
    const tests = await Test.find({ userId }).sort({ createdAt: -1 }).limit(50).lean();
    const data = tests.map((t) => ({
      id: String(t._id),
      exam_type: t.examType,
      mode: t.mode,
      subject: t.subject,
      topic: t.topic,
      status: t.status,
      total_questions: t.items.length,
      score: t.score,
      max_score: t.maxScore,
      created_at: t.createdAt,
    }));
    return apiOk(res, { tests: data });
  } catch (err) {
    return apiErr(res, "TESTS_FETCH_FAILED", err.message, 500);
  }
}

function buildResults(test) {
  const isMains = test.examType === "mains";
  return {
    id: String(test._id),
    exam_type: test.examType,
    mode: test.mode,
    status: test.status,
    score: test.score,
    max_score: test.maxScore,
    results: test.items.map((it) =>
      isMains
        ? {
            question_id: String(it.questionId),
            question: it.question,
            your_answer: it.userAnswer,
            marks: it.marks,
            max_marks: it.maxMarks,
            feedback: it.feedback,
            improvements: it.improvements || [],
          }
        : toResultItem(it)
    ),
  };
}

// POST /api/v1/tests/:id/submit   (PRELIMS grading)
// body: { answers: [{ questionId, selectedOption }] }
async function submitTest(req, res) {
  try {
    const test = await loadOwnedTest(req, res);
    if (!test) return;
    if (test.examType !== "prelims") {
      return apiErr(res, "TEST_WRONG_MODE", "Use /answers then /evaluate for mains tests.", 400);
    }
    if (test.status === "evaluated") return apiOk(res, buildResults(test));

    const map = answersToMap(req.body.answers);
    const { score, total } = gradePrelims(test.items, map);
    test.score = score;
    test.maxScore = total;
    test.status = "evaluated";
    test.submittedAt = new Date();
    test.evaluatedAt = new Date();
    await test.save();

    return apiOk(res, buildResults(test));
  } catch (err) {
    return apiErr(res, "TEST_SUBMIT_FAILED", err.message, 500);
  }
}

// POST /api/v1/tests/:id/answers   (MAINS save written answers)
// body: { answers: [{ questionId, answerText }] } or { questionId, answerText }
// For photo answers: POST /media/upload/:testId/:questionId → poll /media/ocr-status
// → submit the returned answer_text here.
async function uploadAnswers(req, res) {
  try {
    const test = await loadOwnedTest(req, res);
    if (!test) return;
    if (test.examType !== "mains") {
      return apiErr(res, "TEST_WRONG_MODE", "Answer upload applies to mains tests; prelims uses /submit.", 400);
    }

    const answers = req.body.answers || [req.body];
    const map = answersToMap(answers);
    let updated = 0;
    for (const item of test.items) {
      const text = map[String(item.questionId)];
      if (text !== undefined) {
        item.userAnswer = String(text);
        item.userAnswerImageId = null;
        updated += 1;
      }
    }
    test.status = "submitted";
    test.submittedAt = new Date();
    await test.save();

    return apiOk(res, { id: String(test._id), status: test.status, answers_saved: updated });
  } catch (err) {
    return apiErr(res, "TEST_UPLOAD_FAILED", err.message, 500);
  }
}

// POST /api/v1/tests/:id/evaluate   (MAINS AI evaluation)
// Evaluates every answered item; returns marks, feedback, improvements + total.
async function evaluateTest(req, res) {
  try {
    const test = await loadOwnedTest(req, res);
    if (!test) return;
    if (test.examType !== "mains") {
      return apiErr(res, "TEST_WRONG_MODE", "Evaluation applies to mains tests; prelims uses /submit.", 400);
    }

    // Allow answers to be passed inline at evaluation time too (upload optional).
    if (req.body && req.body.answers) {
      const map = answersToMap(req.body.answers);
      for (const item of test.items) {
        const text = map[String(item.questionId)];
        if (text !== undefined) {
          item.userAnswer = String(text);
          item.userAnswerImageId = null;
        }
      }
    }

    let total = 0;
    let maxTotal = 0;
    for (const item of test.items) {
      const evalResult = await evaluateAnswer({
        question: item.question,
        hints: item.hints,
        modelAnswer: item.modelAnswer,
        answerText: item.userAnswer || "",
        maxMarks: item.maxMarks || 10,
      });
      item.marks = evalResult.marks;
      item.feedback = evalResult.feedback;
      item.improvements = evalResult.improvements;
      total += evalResult.marks;
      maxTotal += item.maxMarks || 10;
    }

    test.score = total;
    test.maxScore = maxTotal;
    test.status = "evaluated";
    test.evaluatedAt = new Date();
    if (!test.submittedAt) test.submittedAt = new Date();
    await test.save();

    return apiOk(res, buildResults(test));
  } catch (err) {
    return apiErr(res, "TEST_EVALUATE_FAILED", err.message, 500);
  }
}

module.exports = { createTest, getTest, listTests, submitTest, uploadAnswers, evaluateTest };
