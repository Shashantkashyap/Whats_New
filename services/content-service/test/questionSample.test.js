const test = require("node:test");
const assert = require("node:assert");
const { pickBatch, buildPoolKey } = require("../utils/questionSample");
const { nextRunAt, getSchedulerStatus } = require("../jobs/schedulers");
const cron = require("node-cron");

test("pickBatch prefers unseen then fills from seen", () => {
  const pool = Array.from({ length: 15 }, (_, i) => `q${i}`);
  const first = pickBatch(pool, [], 10);
  assert.equal(first.picked.length, 10);
  assert.equal(first.meta.recycled, 0);
  assert.equal(first.nextSeen.length, 10);

  const second = pickBatch(pool, first.nextSeen, 10);
  assert.equal(second.picked.length, 10);
  assert.equal(second.meta.new_from_unseen, 5);
  assert.equal(second.meta.recycled, 5);
  // All 5 remaining unseen must be included.
  const firstSet = new Set(first.picked);
  const newlyUnseen = second.picked.filter((id) => !firstSet.has(id));
  assert.equal(newlyUnseen.length, 5);
});

test("pickBatch resets after full cycle", () => {
  const pool = ["a", "b", "c"];
  const done = pickBatch(pool, ["a", "b", "c"], 2);
  assert.equal(done.meta.reset, true);
  assert.equal(done.picked.length, 2);
  assert.equal(done.meta.recycled, 0);
});

test("buildPoolKey is stable for topic filters", () => {
  assert.equal(
    buildPoolKey("practice", { topicId: "t1", type: "prelims" }),
    buildPoolKey("practice", { topicId: "t1", type: "prelims" })
  );
  assert.notEqual(
    buildPoolKey("practice", { topicId: "t1" }),
    buildPoolKey("list", { topicId: "t1" })
  );
});

test("nextRunAt returns a future ISO time for hourly cron", () => {
  assert.ok(cron.validate("0 * * * *"));
  const next = nextRunAt("0 * * * *", "UTC", new Date("2026-08-04T10:15:00.000Z"));
  assert.ok(next);
  assert.ok(new Date(next) > new Date("2026-08-04T10:15:00.000Z"));
});

test("getSchedulerStatus lists both jobs", () => {
  const status = getSchedulerStatus();
  assert.ok(Array.isArray(status.jobs));
  assert.equal(status.jobs.length, 2);
  const ids = status.jobs.map((j) => j.id).sort();
  assert.deepEqual(ids, ["content-pipeline", "question-bank"]);
  assert.ok("next_run_at" in status.jobs[0]);
  assert.ok("last_status" in status.jobs[0]);
  assert.ok("equivalent_endpoint" in status.jobs[0]);
});
