const test = require("node:test");
const assert = require("node:assert");
const {
  toChallengeMcqs,
  gradeNewsMcqs,
  gradeSingleMcq,
  answeredCount,
  toChallengeProgress,
} = require("../utils/challengeGrade");

const mcqs = [
  { question: "Q1?", options: ["A", "B", "C", "D"], answer: "B" },
  { question: "Q2?", options: ["W", "X", "Y", "Z"], answer: "Y" },
  { question: "Q3?", options: ["1", "2", "3", "4"], answer: "1" },
];

test("toChallengeMcqs strips answers", () => {
  const out = toChallengeMcqs(mcqs);
  assert.equal(out.length, 3);
  assert.equal(out[0].index, 0);
  assert.equal(out[0].question, "Q1?");
  assert.deepEqual(out[0].options, ["A", "B", "C", "D"]);
  assert.equal(out[0].answer, undefined);
});

test("gradeNewsMcqs scores option indices server-side", () => {
  const graded = gradeNewsMcqs(mcqs, { "0": 1, "1": 2, "2": 0 }); // B, Y, 1 — all correct
  assert.equal(graded.error, undefined);
  assert.equal(graded.score, 3);
  assert.equal(graded.total_questions, 3);
  assert.equal(graded.results[0].is_correct, true);
  assert.equal(graded.results[0].correct_answer, "B");
});

test("gradeNewsMcqs accepts option strings and counts wrongs", () => {
  const graded = gradeNewsMcqs(mcqs, { "0": "A", "1": "Y", "2": "4" }); // wrong, right, wrong
  assert.equal(graded.score, 1);
  assert.equal(graded.results[0].is_correct, false);
  assert.equal(graded.results[1].is_correct, true);
  assert.equal(graded.results[2].is_correct, false);
});

test("gradeNewsMcqs rejects empty bank / bad payload", () => {
  assert.equal(gradeNewsMcqs([], { "0": 0 }).error, "NO_MCQS");
  assert.equal(gradeNewsMcqs(mcqs, null).error, "INVALID_ANSWERS");
  assert.equal(gradeNewsMcqs(mcqs, [0, 1]).error, "INVALID_ANSWERS");
});

test("client-supplied score is irrelevant — only selected_answers matter", () => {
  // Even if a cheater would send score: 5, grading ignores it.
  const graded = gradeNewsMcqs(mcqs, { "0": 0, "1": 0, "2": 3 }); // A, W, 4 — all wrong
  assert.equal(graded.score, 0);
});

test("gradeSingleMcq grades one question and rejects bad index", () => {
  const ok = gradeSingleMcq(mcqs, 0, 1); // B — correct
  assert.equal(ok.error, undefined);
  assert.equal(ok.index, 0);
  assert.equal(ok.result.is_correct, true);
  assert.equal(ok.result.correct_answer, "B");

  const wrong = gradeSingleMcq(mcqs, 1, "W");
  assert.equal(wrong.result.is_correct, false);

  assert.equal(gradeSingleMcq(mcqs, 99, 0).error, "INVALID_QUESTION_INDEX");
  assert.equal(gradeSingleMcq(mcqs, 0, null).error, "INVALID_SELECTION");
  assert.equal(gradeSingleMcq([], 0, 0).error, "NO_MCQS");
});

test("answeredCount and toChallengeProgress for feed cards", () => {
  assert.equal(answeredCount({ "0": 1, "2": 0 }), 2);
  assert.equal(answeredCount({}), 0);

  const empty = toChallengeProgress(null, 5);
  assert.equal(empty.attempted, false);
  assert.equal(empty.total_questions, 5);

  const partial = toChallengeProgress(
    { selectedAnswers: { "0": 1, "1": 0 }, totalQuestions: 5 },
    5
  );
  assert.equal(partial.attempted, true);
  assert.equal(partial.completed, false);
  assert.equal(partial.answered_count, 2);
  assert.equal(partial.prelims_score, null);
  assert.deepEqual(partial.selected_answers, { "0": 1, "1": 0 });

  const done = toChallengeProgress(
    {
      selectedAnswers: { "0": 1, "1": 2, "2": 0 },
      totalQuestions: 3,
      prelimsScore: 3,
      prelimsCompletedAt: new Date(),
    },
    3
  );
  assert.equal(done.completed, true);
  assert.equal(done.prelims_score, 3);
});
