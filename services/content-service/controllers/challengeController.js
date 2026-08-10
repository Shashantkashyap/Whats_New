const mongoose = require("mongoose");
const News = require("../models/News");
const ChallengeAttempt = require("../models/ChallengeAttempt");
const { apiOk, apiErr } = require("../utils/apiResponse");
const { parseMultipart, fileFromForm } = require("../utils/multipart");
const { persistBuffer } = require("../utils/mediaStore");
const { validateAnswerSheet } = require("../utils/sheetVision");
const {
  toChallengeMcqs,
  gradeNewsMcqs,
  gradeSingleMcq,
  answeredCount,
} = require("../utils/challengeGrade");

function emptyStatus(mcqs = []) {
  const totalQuestions = mcqs.length;
  return {
    is_completed: false,
    prelims_score: 0,
    total_questions: totalQuestions,
    answered_count: 0,
    selected_answers: {},
    questions: toChallengeMcqs(mcqs),
    mains_status: {
      submitted: false,
      evaluation_status: "Unattempted",
    },
  };
}

function toStatus(attempt, mcqs = []) {
  const mains = attempt.mains || {};
  const mainsStatus = {
    submitted: !!mains.submitted,
    evaluation_status: mains.evaluationStatus || "Unattempted",
  };
  if (mains.submitted) {
    mainsStatus.submitted_at = mains.submittedAt || null;
    mainsStatus.answer_sheet_document_id = mains.answerSheetDocumentId
      ? String(mains.answerSheetDocumentId)
      : null;
    if (Array.isArray(mains.warningTags) && mains.warningTags.length) {
      mainsStatus.warning_tags = mains.warningTags;
    }
  }

  const selected = attempt.selectedAnswers || {};
  const completed = !!attempt.prelimsCompletedAt;
  const data = {
    is_completed: completed || !!mains.submitted,
    prelims_score: attempt.prelimsScore || 0,
    total_questions: attempt.totalQuestions || mcqs.length,
    answered_count: answeredCount(selected),
    selected_answers: selected,
    questions: toChallengeMcqs(mcqs),
    mains_status: mainsStatus,
  };

  // Reveal correct answers for questions the user has already locked in.
  // Full set when completed; otherwise only answered indices.
  if (mcqs.length && answeredCount(selected) > 0) {
    const graded = gradeNewsMcqs(mcqs, selected);
    if (!graded.error) {
      data.results = completed
        ? graded.results
        : graded.results.filter((r) => selected[String(r.index)] !== undefined || selected[r.index] !== undefined);
    }
  }

  return data;
}

async function loadNewsOr404(id, res) {
  if (!mongoose.isValidObjectId(id)) {
    apiErr(res, "NEWS_NOT_FOUND", "No news item exists for the supplied identifier.", 404);
    return null;
  }
  const news = await News.findById(id).select("mcqs mainsQuestion").lean();
  if (!news) {
    apiErr(res, "NEWS_NOT_FOUND", "No news item exists for the supplied identifier.", 404);
    return null;
  }
  return news;
}

// GET /api/v1/news/:id/challenge/status
async function getChallengeStatus(req, res) {
  try {
    const news = await loadNewsOr404(req.params.id, res);
    if (!news) return;
    const mcqs = Array.isArray(news.mcqs) ? news.mcqs : [];

    const attempt = await ChallengeAttempt.findOne({
      userId: req.user.id,
      newsId: news._id || req.params.id,
    }).lean();

    if (!attempt) return apiOk(res, emptyStatus(mcqs));
    return apiOk(res, toStatus(attempt, mcqs));
  } catch (err) {
    return apiErr(res, "CHALLENGE_STATUS_FAILED", err.message, 500);
  }
}

// POST /api/v1/news/:id/challenge/answer-mcq
// body: { question_index: 0, selected: 2 }  — or selected: "Option text"
// Persists one answer immediately; returns that question's graded result.
// Auto-completes the set when every MCQ has an answer.
async function answerMcq(req, res) {
  try {
    const news = await loadNewsOr404(req.params.id, res);
    if (!news) return;

    const mcqs = Array.isArray(news.mcqs) ? news.mcqs : [];
    const questionIndex = req.body?.question_index ?? req.body?.questionIndex;
    const selected = req.body?.selected !== undefined ? req.body.selected : req.body?.selected_answer;

    const single = gradeSingleMcq(mcqs, questionIndex, selected);
    if (single.error) {
      const code = single.error === "NO_MCQS" ? 404 : 400;
      return apiErr(res, single.error, single.message, code);
    }

    const key = String(single.index);
    const existing = await ChallengeAttempt.findOne({
      userId: req.user.id,
      newsId: req.params.id,
    }).lean();

    const selectedAnswers = { ...(existing?.selectedAnswers || {}), [key]: selected };
    const gradedAll = gradeNewsMcqs(mcqs, selectedAnswers);
    const allAnswered = answeredCount(selectedAnswers) >= mcqs.length;
    const completedAt = allAnswered ? (existing?.prelimsCompletedAt || new Date()) : existing?.prelimsCompletedAt || null;

    const attempt = await ChallengeAttempt.findOneAndUpdate(
      { userId: req.user.id, newsId: req.params.id },
      {
        $set: {
          selectedAnswers,
          totalQuestions: mcqs.length,
          prelimsScore: gradedAll.error ? 0 : gradedAll.score,
          ...(allAnswered ? { prelimsCompletedAt: completedAt } : {}),
        },
        $setOnInsert: {
          userId: req.user.id,
          newsId: req.params.id,
          mains: { submitted: false, evaluationStatus: "Unattempted" },
        },
      },
      { upsert: true, new: true }
    );

    return apiOk(
      res,
      {
        message: "MCQ answer saved.",
        question_index: single.index,
        result: single.result,
        answered_count: answeredCount(attempt.selectedAnswers),
        total_questions: mcqs.length,
        is_completed: !!attempt.prelimsCompletedAt,
        prelims_score: attempt.prelimsCompletedAt ? attempt.prelimsScore : null,
        selected_answers: attempt.selectedAnswers,
      },
      { statusCode: 201 }
    );
  } catch (err) {
    return apiErr(res, "CHALLENGE_ANSWER_FAILED", err.message, 500);
  }
}

// POST /api/v1/news/:id/challenge/submit-mcq
// body: { selected_answers: { "0": 2, ... } }  OR omit to finalize already-saved answers
async function submitMcq(req, res) {
  try {
    const news = await loadNewsOr404(req.params.id, res);
    if (!news) return;

    const mcqs = Array.isArray(news.mcqs) ? news.mcqs : [];

    let selectedAnswers = req.body?.selected_answers;
    if (!selectedAnswers || typeof selectedAnswers !== "object" || Array.isArray(selectedAnswers)) {
      // Finalize from permanently stored single answers.
      const existing = await ChallengeAttempt.findOne({
        userId: req.user.id,
        newsId: req.params.id,
      }).lean();
      selectedAnswers = existing?.selectedAnswers || null;
    }

    const graded = gradeNewsMcqs(mcqs, selectedAnswers);
    if (graded.error) {
      return apiErr(res, graded.error, graded.message, graded.error === "NO_MCQS" ? 404 : 400);
    }

    await ChallengeAttempt.findOneAndUpdate(
      { userId: req.user.id, newsId: req.params.id },
      {
        $set: {
          prelimsScore: graded.score,
          totalQuestions: graded.total_questions,
          selectedAnswers,
          prelimsCompletedAt: new Date(),
        },
        $setOnInsert: {
          userId: req.user.id,
          newsId: req.params.id,
          mains: { submitted: false, evaluationStatus: "Unattempted" },
        },
      },
      { upsert: true, new: true }
    );

    return apiOk(
      res,
      {
        message: "Prelims MCQ attempt graded and saved.",
        prelims_score: graded.score,
        total_questions: graded.total_questions,
        selected_answers: selectedAnswers,
        results: graded.results,
      },
      { statusCode: 201 }
    );
  } catch (err) {
    return apiErr(res, "CHALLENGE_SUBMIT_FAILED", err.message, 500);
  }
}

// POST /api/v1/news/:id/mains/submit  (multipart: image)
async function submitMains(req, res) {
  try {
    const news = await loadNewsOr404(req.params.id, res);
    if (!news) return;

    let file;
    try {
      const form = await parseMultipart(req);
      file = await fileFromForm(form, "image");
    } catch (err) {
      if (err.code === "INVALID_CONTENT_TYPE") {
        return apiErr(res, "INVALID_CONTENT_TYPE", err.message, 400);
      }
      return apiErr(res, "MULTIPART_PARSE_FAILED", err.message, 400);
    }

    if (!file || !file.buffer?.length) {
      return apiErr(res, "IMAGE_REQUIRED", "multipart field `image` with a binary file is required.", 400);
    }
    if (!String(file.contentType || "").startsWith("image/")) {
      return apiErr(res, "INVALID_IMAGE_TYPE", "Uploaded file must be an image.", 400);
    }

    const vision = await validateAnswerSheet(file.buffer, file.contentType);
    if (!vision.accepted) {
      return apiErr(
        res,
        "INVALID_ANSWER_SHEET_FORMAT",
        "The uploaded photo does not appear to be an academic answer script. Please capture a clear, well-lit image of your handwritten A4 response sheet.",
        422
      );
    }

    let documentId;
    try {
      ({ documentId } = await persistBuffer(file.buffer, {
        contentType: file.contentType,
        kind: "mains_sheet",
        meta: { userId: req.user.id, newsId: String(req.params.id) },
        filename: file.filename || `mains-${req.user.id}-${Date.now()}.jpg`,
      }));
    } catch (err) {
      return apiErr(res, "UPLOAD_FAILED", err.message || "Failed to store answer sheet.", 502);
    }

    const submittedAt = new Date();
    await ChallengeAttempt.findOneAndUpdate(
      { userId: req.user.id, newsId: req.params.id },
      {
        $set: {
          mains: {
            submitted: true,
            submittedAt,
            answerSheetDocumentId: documentId,
            evaluationStatus: "Pending Review",
            insights: vision.insights,
            warningTags: vision.warningTags || [],
          },
        },
        $setOnInsert: {
          userId: req.user.id,
          newsId: req.params.id,
          selectedAnswers: {},
          prelimsScore: 0,
          totalQuestions: Array.isArray(news.mcqs) ? news.mcqs.length : 0,
        },
      },
      { upsert: true, new: true }
    );

    return apiOk(
      res,
      {
        submitted: true,
        answer_sheet_document_id: String(documentId),
        evaluation_status: "Pending Review",
        insights: vision.insights,
        ...(vision.warningTags?.length ? { warning_tags: vision.warningTags } : {}),
      },
      { statusCode: 201 }
    );
  } catch (err) {
    return apiErr(res, "MAINS_SUBMIT_FAILED", err.message, 500);
  }
}

module.exports = { getChallengeStatus, answerMcq, submitMcq, submitMains };
