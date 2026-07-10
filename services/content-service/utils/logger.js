/**
 * logger.js - Minimal structured logger for the news collection layer.
 *
 * Emits one JSON object per line (easy to grep / ship to a log pipeline).
 * Deliberately dependency-free (stdlib only) so it can be required from pure
 * modules without pulling in the app's heavy dependency tree.
 *
 * SECURITY: never pass article bodies / full page HTML here. `redact()` drops
 * known-sensitive keys and truncates long strings as a backstop, but callers
 * are expected to log metadata (counts, durations, urls, sources), not content.
 */

const BODY_KEYS = new Set(["body", "content", "html", "text", "articleBody"]);
const MAX_STR = 300;

function redact(value, depth = 0) {
  if (value == null) return value;
  if (typeof value === "string") return value.length > MAX_STR ? `${value.slice(0, MAX_STR)}…[truncated]` : value;
  if (typeof value !== "object" || depth > 4) return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => redact(v, depth + 1));
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = BODY_KEYS.has(k) ? "[omitted]" : redact(v, depth + 1);
  }
  return out;
}

function emit(level, event, meta) {
  const line = {
    ts: new Date().toISOString(),
    level,
    component: "news",
    event,
    ...(meta ? redact(meta) : {}),
  };
  const sink = level === "error" ? console.error : console.log;
  try {
    sink(JSON.stringify(line));
  } catch {
    sink(`{"level":"${level}","event":"${event}","note":"unserializable meta"}`);
  }
}

module.exports = {
  info: (event, meta) => emit("info", event, meta),
  warn: (event, meta) => emit("warn", event, meta),
  error: (event, meta) => emit("error", event, meta),
  /** Time an async fn and log start/success/failure with duration. */
  async timed(event, meta, fn) {
    const start = Date.now();
    emit("info", `${event}.start`, meta);
    try {
      const result = await fn();
      emit("info", `${event}.done`, { ...meta, durationMs: Date.now() - start });
      return result;
    } catch (err) {
      emit("error", `${event}.fail`, { ...meta, durationMs: Date.now() - start, error: err?.message || String(err) });
      throw err;
    }
  },
  redact,
};
