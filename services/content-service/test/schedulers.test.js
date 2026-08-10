const test = require("node:test");
const assert = require("node:assert");
const cron = require("node-cron");
const { pickTopics } = require("../scripts/generateQuestions");

test("default cron expressions are valid", () => {
  // Keep in sync with jobs/schedulers.js defaults.
  assert.ok(cron.validate("0 */2 * * *"), "content every 2h");
  assert.ok(cron.validate("0 * * * *"), "questions every 1h");
});

test("pickTopics rotates capped slices across hours", () => {
  const topics = Array.from({ length: 10 }, (_, i) => ({ name: `T${i}` }));
  const a = pickTopics(topics, 3, 0).map((t) => t.name);
  const b = pickTopics(topics, 3, 1).map((t) => t.name);
  assert.deepEqual(a, ["T0", "T1", "T2"]);
  assert.deepEqual(b, ["T3", "T4", "T5"]);
  assert.equal(pickTopics(topics, null).length, 10);
  assert.equal(pickTopics(topics, 100).length, 10);
});
