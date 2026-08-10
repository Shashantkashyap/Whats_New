const test = require("node:test");
const assert = require("node:assert");
const {
  validateTestParams,
  buildQuestionFilter,
  weightedSample,
  toTestItem,
  toDisplayItem,
  gradePrelims,
  answersToMap,
} = require("../utils/testEngine");

test("validateTestParams enforces mode/type and required scoping", () => {
  assert.ok(validateTestParams({ examType: "bad", mode: "mixed" }).error);
  assert.ok(validateTestParams({ examType: "prelims", mode: "bad" }).error);
  assert.ok(validateTestParams({ examType: "prelims", mode: "subject_wise" }).error); // needs subject
  assert.ok(validateTestParams({ examType: "mains", mode: "topic_wise" }).error); // needs topic
  assert.ok(validateTestParams({ examType: "prelims", mode: "mixed" }).ok);
  assert.ok(validateTestParams({ examType: "mains", mode: "subject_wise", subject: "Economy" }).ok);
  assert.ok(validateTestParams({ examType: "prelims", mode: "topic_wise", topicId: "tid" }).ok);
  assert.ok(validateTestParams({ examType: "prelims", mode: "subject_wise", subjectId: "sid" }).ok);
});

test("buildQuestionFilter scopes by mode (prefers FKs)", () => {
  assert.deepEqual(buildQuestionFilter({ examType: "prelims", mode: "mixed" }), { type: "prelims" });
  assert.deepEqual(buildQuestionFilter({ examType: "prelims", mode: "subject_wise", subject: "Economy" }), { type: "prelims", subject: "Economy" });
  assert.deepEqual(buildQuestionFilter({ examType: "prelims", mode: "subject_wise", subjectId: "sid" }), { type: "prelims", subjectId: "sid" });
  assert.deepEqual(buildQuestionFilter({ examType: "mains", mode: "topic_wise", topicId: "tid" }), { type: "mains", topicId: "tid" });
  assert.deepEqual(buildQuestionFilter({ examType: "mains", mode: "topic_wise", topic: "RBI", subject: "Economy" }), { type: "mains", topic: "RBI", subject: "Economy" });
});

test("weightedSample prefers higher weights without duplicates", () => {
  const items = [{ id: "a", w: 1 }, { id: "b", w: 5 }, { id: "c", w: 1 }];
  const picked = weightedSample(items, 2, (x) => x.w);
  assert.equal(picked.length, 2);
  assert.equal(new Set(picked.map((p) => p.id)).size, 2);
});

test("toDisplayItem hides answers (prelims=options only, mains=hints only)", () => {
  const prelims = toTestItem({ _id: "q1", question: "Q?", options: ["A", "B"], answer: "A", explanation: "because", subject: "Polity & Governance" });
  const dp = toDisplayItem(prelims, "prelims");
  assert.deepEqual(dp.options, ["A", "B"]);
  assert.equal(dp.correct_answer, undefined);
  assert.equal(dp.explanation, undefined);

  const mains = toTestItem({ _id: "q2", question: "Discuss.", hints: ["h1", "h2"], modelAnswer: "secret", maxMarks: 15, subject: "Ethics" });
  const dm = toDisplayItem(mains, "mains");
  assert.deepEqual(dm.hints, ["h1", "h2"]);
  assert.equal(dm.max_marks, 15);
  assert.equal(dm.modelAnswer, undefined);
  assert.equal(dm.model_answer, undefined);
});

test("gradePrelims scores correct picks and records answers", () => {
  const items = [
    toTestItem({ _id: "q1", question: "1", options: ["A", "B"], answer: "A", subject: "S" }),
    toTestItem({ _id: "q2", question: "2", options: ["A", "B"], answer: "B", subject: "S" }),
    toTestItem({ _id: "q3", question: "3", options: ["A", "B"], answer: "A", subject: "S" }),
  ];
  const map = answersToMap([
    { questionId: "q1", selectedOption: "A" }, // correct
    { questionId: "q2", selectedOption: "A" }, // wrong
    // q3 unanswered
  ]);
  const { score, total } = gradePrelims(items, map);
  assert.equal(score, 1);
  assert.equal(total, 3);
  assert.equal(items[0].isCorrect, true);
  assert.equal(items[1].isCorrect, false);
  assert.equal(items[2].userAnswer, null);
  assert.equal(items[2].isCorrect, false);
});

test("answersToMap accepts array and object, prelims and mains keys", () => {
  assert.deepEqual(answersToMap([{ questionId: "q1", selectedOption: "A" }]), { q1: "A" });
  assert.deepEqual(answersToMap([{ questionId: "q2", answerText: "essay" }]), { q2: "essay" });
  assert.deepEqual(answersToMap({ q3: "X" }), { q3: "X" });
});
