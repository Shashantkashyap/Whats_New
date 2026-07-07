/**
 * concurrency.js - Small parallelism + retry helpers (stdlib only).
 */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Run `fn` over `items` with at most `limit` in flight at once.
 * Never rejects: each result is `{ status, value|reason, item }` so one
 * failure never aborts the batch (the pipeline must continue when a source
 * fails). Order of the returned array matches the input order.
 */
async function mapLimit(items, limit, fn) {
  const list = Array.from(items);
  const results = new Array(list.length);
  const size = Math.max(1, Math.min(limit || 1, list.length || 1));
  let next = 0;

  async function worker() {
    while (next < list.length) {
      const i = next++;
      try {
        results[i] = { status: "fulfilled", value: await fn(list[i], i), item: list[i] };
      } catch (reason) {
        results[i] = { status: "rejected", reason, item: list[i] };
      }
    }
  }

  await Promise.all(Array.from({ length: size }, worker));
  return results;
}

/**
 * Retry an async fn with exponential backoff.
 * @param {Function} fn
 * @param {{retries?:number, baseDelayMs?:number, onRetry?:Function}} opts
 */
async function withRetry(fn, opts = {}) {
  const retries = Number.isInteger(opts.retries) ? opts.retries : 2;
  const baseDelayMs = opts.baseDelayMs || 1000;
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastErr = err;
      if (attempt === retries) break;
      if (typeof opts.onRetry === "function") opts.onRetry(attempt + 1, err);
      await sleep(baseDelayMs * Math.pow(2, attempt));
    }
  }
  throw lastErr;
}

module.exports = { mapLimit, withRetry, sleep };
