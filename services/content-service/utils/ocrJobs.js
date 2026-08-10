// Async OCR job lifecycle for mains answer photos.
// Upload accepts the image in-memory only (no S3); status/text live in AnswerOcrJob.

const mongoose = require("mongoose");
const AnswerOcrJob = require("../models/AnswerOcrJob");
const Test = require("../models/Test");
const { extractAnswerText } = require("./answerOcr");

const STATUSES = Object.freeze({
  QUEUED: "queued",
  IN_PROGRESS: "in_progress",
  DONE: "done",
  FAILED: "failed",
});

function jobKey(userId, testId, questionId) {
  return { userId: String(userId), testId, questionId };
}

function toJobView(job) {
  if (!job) return null;
  const view = {
    question_id: String(job.questionId),
    status: job.status,
  };
  if (job.status === STATUSES.DONE) {
    view.answer_text = job.answerText || "";
    if (job.confidence != null) view.confidence = job.confidence;
  }
  if (job.status === STATUSES.FAILED) {
    view.error = job.error || "OCR failed.";
  }
  return view;
}

// Ensure the test belongs to the user, is mains, and contains the question.
async function assertMainsQuestion(userId, testId, questionId) {
  if (!mongoose.isValidObjectId(testId)) {
    const err = new Error("A valid test id is required.");
    err.code = "TEST_NOT_FOUND";
    throw err;
  }
  if (!mongoose.isValidObjectId(questionId)) {
    const err = new Error("A valid question id is required.");
    err.code = "QUESTION_INVALID";
    throw err;
  }

  const test = await Test.findById(testId).select("userId examType items.questionId").lean();
  if (!test) {
    const err = new Error("No test exists for the supplied id.");
    err.code = "TEST_NOT_FOUND";
    throw err;
  }
  if (String(test.userId) !== String(userId)) {
    const err = new Error("This test belongs to another user.");
    err.code = "TEST_FORBIDDEN";
    throw err;
  }
  if (test.examType !== "mains") {
    const err = new Error("OCR upload applies to mains tests only.");
    err.code = "TEST_WRONG_MODE";
    throw err;
  }
  const belongs = (test.items || []).some((it) => String(it.questionId) === String(questionId));
  if (!belongs) {
    const err = new Error("That question is not part of this test.");
    err.code = "QUESTION_NOT_IN_TEST";
    throw err;
  }
  return test;
}

async function upsertQueuedJob(userId, testId, questionId) {
  const filter = jobKey(userId, testId, questionId);
  return AnswerOcrJob.findOneAndUpdate(
    filter,
    {
      $set: {
        ...filter,
        status: STATUSES.IN_PROGRESS,
        answerText: null,
        confidence: null,
        error: null,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

// Fire-and-forget OCR. Image buffer lives only in this process until done.
function startOcrJob({ userId, testId, questionId, buffer, contentType, deps = {} }) {
  const run = async () => {
    const filter = jobKey(userId, testId, questionId);
    try {
      await AnswerOcrJob.updateOne(filter, { $set: { status: STATUSES.IN_PROGRESS, error: null } });
      const ocr = await extractAnswerText(buffer, contentType, deps);
      const text = String(ocr.text || "").trim();
      if (!text) {
        await AnswerOcrJob.updateOne(filter, {
          $set: {
            status: STATUSES.FAILED,
            answerText: null,
            confidence: ocr.confidence,
            error: "Could not extract readable text. Retake a clearer photo or type the answer.",
          },
        });
        return;
      }
      await AnswerOcrJob.updateOne(filter, {
        $set: {
          status: STATUSES.DONE,
          answerText: text,
          confidence: ocr.confidence,
          error: null,
        },
      });
    } catch (err) {
      await AnswerOcrJob.updateOne(filter, {
        $set: {
          status: STATUSES.FAILED,
          answerText: null,
          error: err.message || "OCR failed.",
        },
      }).catch(() => {});
    }
  };

  // Don't await — upload handler returns 202 immediately.
  setImmediate(() => {
    run().catch(() => {});
  });
}

async function getJobsStatus(userId, testId, questionIds) {
  if (!mongoose.isValidObjectId(testId)) {
    const err = new Error("A valid test id is required.");
    err.code = "TEST_NOT_FOUND";
    throw err;
  }

  const ids = [...new Set((questionIds || []).map(String).filter((id) => mongoose.isValidObjectId(id)))];
  if (!ids.length) {
    const err = new Error("questionIds must be a non-empty array of question ids.");
    err.code = "OCR_STATUS_INVALID";
    throw err;
  }

  // Ownership check once via any matching job or the test itself.
  const test = await Test.findById(testId).select("userId").lean();
  if (!test) {
    const err = new Error("No test exists for the supplied id.");
    err.code = "TEST_NOT_FOUND";
    throw err;
  }
  if (String(test.userId) !== String(userId)) {
    const err = new Error("This test belongs to another user.");
    err.code = "TEST_FORBIDDEN";
    throw err;
  }

  const jobs = await AnswerOcrJob.find({
    userId: String(userId),
    testId,
    questionId: { $in: ids },
  }).lean();

  const byQ = new Map(jobs.map((j) => [String(j.questionId), j]));
  const results = ids.map((qid) => {
    const job = byQ.get(qid);
    if (!job) {
      return { question_id: qid, status: "not_started" };
    }
    return toJobView(job);
  });

  const anyRunning = results.some(
    (r) => r.status === STATUSES.IN_PROGRESS || r.status === STATUSES.QUEUED
  );

  return {
    test_id: String(testId),
    status: anyRunning ? STATUSES.IN_PROGRESS : STATUSES.DONE,
    results,
  };
}

module.exports = {
  STATUSES,
  assertMainsQuestion,
  upsertQueuedJob,
  startOcrJob,
  getJobsStatus,
  toJobView,
};
