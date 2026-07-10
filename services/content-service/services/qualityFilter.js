/**
 * qualityFilter.js - Sanitize untrusted page content and drop low-quality
 * articles before they reach Gemini or the DB.
 *
 * SECURITY: extracted page text is UNTRUSTED. sanitizeText():
 *   - strips <script>/<style> blocks and all HTML tags
 *   - removes control characters
 *   - collapses whitespace and caps length
 *   - neutralizes common prompt-injection phrases (best-effort heuristic)
 *
 * Quality: discard articles that are older than maxAgeHours, missing a title
 * or body, whose body is too short, or that look paywalled.
 *
 * Pure + stdlib only.
 */

// ponytail: this is a heuristic denylist, not a guarantee. Real defense is
// that we never pass page text to Gemini AS INSTRUCTIONS - it's always data.
// Upgrade path = wrap untrusted text in an explicit data delimiter server-side.
const INJECTION_PATTERNS = [
  /ignore (all|any|the)? ?(previous|prior|above) (instructions|prompts?)/gi,
  /disregard (all|any|the)? ?(previous|prior|above)/gi,
  /you are now\b/gi,
  /system prompt\b/gi,
  /\bact as\b/gi,
  /<\s*\/?\s*(system|assistant|user)\s*>/gi,
];

const PAYWALL_MARKERS = [
  "subscribe to continue",
  "subscribe to read",
  "this is a premium article",
  "already a subscriber",
  "sign in to read",
  "to continue reading",
  "premium content",
];

function stripHtml(input) {
  return String(input || "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ");
}

function sanitizeText(raw, maxChars = 20_000) {
  let t = stripHtml(raw);
  // eslint-disable-next-line no-control-regex
  t = t.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, " ");
  for (const re of INJECTION_PATTERNS) t = t.replace(re, "[filtered]");
  t = t.replace(/\s+/g, " ").trim();
  if (t.length > maxChars) t = `${t.slice(0, maxChars)}…`;
  return t;
}

function looksPaywalled(article) {
  if (article && article.paywalled === true) return true;
  const body = String(article?.content || "").toLowerCase();
  if (!body) return false;
  return PAYWALL_MARKERS.some((m) => body.includes(m)) && body.length < 600;
}

function ageHours(publishedAt, now) {
  const t = new Date(publishedAt).getTime();
  if (Number.isNaN(t)) return null;
  return (now - t) / (1000 * 60 * 60);
}

/**
 * @returns {{ok:boolean, reason?:string}}
 */
function inspect(article, opts = {}) {
  const now = opts.now || Date.now();
  const maxAgeHours = opts.maxAgeHours ?? 24;
  const minBodyChars = opts.minBodyChars ?? 250;

  if (!article || !String(article.title || "").trim()) return { ok: false, reason: "missing-title" };
  if (looksPaywalled(article)) return { ok: false, reason: "paywalled" };

  const body = String(article.content || "").trim();
  if (!body) return { ok: false, reason: "missing-body" };
  if (body.length < minBodyChars) return { ok: false, reason: "body-too-short" };

  const age = ageHours(article.publishedAt, now);
  // Unknown date is allowed through (some sources omit it); only reject when we
  // KNOW it is too old.
  if (age != null && age > maxAgeHours) return { ok: false, reason: "too-old" };

  return { ok: true };
}

/**
 * Sanitize bodies, then split into kept / dropped.
 * @returns {{kept:Array<object>, dropped:Array<{url:string,title:string,reason:string}>}}
 */
function apply(articles, opts = {}) {
  const kept = [];
  const dropped = [];
  for (const raw of Array.isArray(articles) ? articles : []) {
    const article = { ...raw, content: sanitizeText(raw?.content, opts.maxBodyChars) };
    const verdict = inspect(article, opts);
    if (verdict.ok) kept.push(article);
    else dropped.push({ url: raw?.url || "", title: raw?.title || "", reason: verdict.reason });
  }
  return { kept, dropped };
}

module.exports = { apply, inspect, sanitizeText, stripHtml, looksPaywalled, ageHours };
