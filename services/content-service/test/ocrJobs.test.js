const test = require("node:test");
const assert = require("node:assert");
const { toJobView, STATUSES } = require("../utils/ocrJobs");

test("toJobView shapes done / failed / in_progress", () => {
  assert.deepEqual(
    toJobView({
      questionId: "q1",
      status: STATUSES.DONE,
      answerText: "hello",
      confidence: 0.9,
    }),
    { question_id: "q1", status: "done", answer_text: "hello", confidence: 0.9 }
  );
  assert.deepEqual(
    toJobView({ questionId: "q2", status: STATUSES.FAILED, error: "blank" }),
    { question_id: "q2", status: "failed", error: "blank" }
  );
  assert.deepEqual(
    toJobView({ questionId: "q3", status: STATUSES.IN_PROGRESS }),
    { question_id: "q3", status: "in_progress" }
  );
});
