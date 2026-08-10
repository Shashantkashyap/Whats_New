const test = require("node:test");
const assert = require("node:assert");
const { heuristicEval, evaluateAnswer } = require("../utils/mainsEvaluator");

test("heuristicEval gives 0 for an empty answer", () => {
  const r = heuristicEval("", ["some hint"], 10);
  assert.equal(r.marks, 0);
  assert.ok(r.improvements.length > 0);
});

test("heuristicEval rewards length + hint coverage, clamped to maxMarks", () => {
  const hints = ["federalism", "cooperative"];
  const good = heuristicEval(("federalism cooperative " + "word ".repeat(200)), hints, 10);
  assert.ok(good.marks > 5, `expected a decent score, got ${good.marks}`);
  assert.ok(good.marks <= 10);

  const thin = heuristicEval("short unrelated answer", hints, 10);
  assert.ok(thin.marks < good.marks);
});

test("evaluateAnswer falls back to heuristic when no model is provided", async () => {
  // deps.model=null forces the offline path (no network in tests).
  const r = await evaluateAnswer(
    { question: "Discuss federalism.", hints: ["federalism"], answerText: "word ".repeat(120) + "federalism", maxMarks: 10 },
    { model: null }
  );
  assert.ok(Number.isInteger(r.marks));
  assert.ok(r.marks >= 0 && r.marks <= 10);
  assert.ok(typeof r.feedback === "string");
  assert.ok(Array.isArray(r.improvements));
});
