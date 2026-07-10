const test = require("node:test");
const assert = require("node:assert");
const { mapLimit, withRetry } = require("../utils/concurrency");

test("mapLimit runs all items and preserves order", async () => {
  const out = await mapLimit([1, 2, 3, 4], 2, async (n) => n * 10);
  assert.deepEqual(out.map((r) => r.value), [10, 20, 30, 40]);
  assert.ok(out.every((r) => r.status === "fulfilled"));
});

test("mapLimit never rejects; captures per-item failures", async () => {
  const out = await mapLimit([1, 2, 3], 3, async (n) => {
    if (n === 2) throw new Error("boom");
    return n;
  });
  assert.equal(out[0].status, "fulfilled");
  assert.equal(out[1].status, "rejected");
  assert.equal(out[1].reason.message, "boom");
  assert.equal(out[2].status, "fulfilled");
});

test("mapLimit respects the concurrency ceiling", async () => {
  let inFlight = 0;
  let peak = 0;
  await mapLimit([1, 2, 3, 4, 5, 6], 2, async () => {
    inFlight++;
    peak = Math.max(peak, inFlight);
    await new Promise((r) => setTimeout(r, 10));
    inFlight--;
  });
  assert.ok(peak <= 2, `peak concurrency ${peak} exceeded 2`);
});

test("withRetry retries then succeeds", async () => {
  let attempts = 0;
  const result = await withRetry(
    async () => {
      attempts++;
      if (attempts < 3) throw new Error("fail");
      return "ok";
    },
    { retries: 3, baseDelayMs: 1 }
  );
  assert.equal(result, "ok");
  assert.equal(attempts, 3);
});

test("withRetry throws after exhausting retries", async () => {
  let attempts = 0;
  await assert.rejects(
    () => withRetry(async () => { attempts++; throw new Error("nope"); }, { retries: 2, baseDelayMs: 1 }),
    /nope/
  );
  assert.equal(attempts, 3); // initial + 2 retries
});
