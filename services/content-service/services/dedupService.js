/**
 * dedupService.js - Detect and merge duplicate articles before Gemini.
 *
 * Duplicates are detected by (in order):
 *   1. normalized URL match
 *   2. normalized title match
 *   3. title similarity >= threshold (Jaccard over word sets)
 *
 * When duplicates are found they are MERGED: the richest article (longest
 * body) is kept and any missing fields are filled from the others.
 *
 * Pure + stdlib only.
 */

const DEFAULT_THRESHOLD = 0.82;

const STOPWORDS = new Set([
  "the", "a", "an", "of", "to", "in", "on", "for", "and", "or", "as", "at",
  "by", "with", "is", "are", "was", "were", "be", "from", "that", "this",
  "it", "its", "into", "over", "after", "new", "says", "said",
]);

function normalizeTitle(title) {
  return String(title || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleTokens(title) {
  return normalizeTitle(title)
    .split(" ")
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

function normalizeUrl(url) {
  try {
    const u = new URL(String(url));
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    let path = u.pathname.replace(/\/+$/, "");
    return `${host}${path}`.toLowerCase();
  } catch {
    return String(url || "").trim().toLowerCase();
  }
}

/** Jaccard similarity over title word sets. 0..1. */
function similarity(a, b) {
  const A = new Set(titleTokens(a));
  const B = new Set(titleTokens(b));
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  const union = A.size + B.size - inter;
  return union === 0 ? 0 : inter / union;
}

function bodyLen(a) {
  return (a && typeof a.content === "string" ? a.content.length : 0);
}

/** Merge `dup` into `keep`, preferring the richer body and filling blanks. */
function merge(keep, dup) {
  const primary = bodyLen(dup) > bodyLen(keep) ? dup : keep;
  const secondary = primary === keep ? dup : keep;
  const merged = { ...secondary, ...primary };
  for (const k of Object.keys(secondary)) {
    if (merged[k] == null || merged[k] === "") merged[k] = secondary[k];
  }
  return merged;
}

/**
 * Deduplicate + merge.
 * @param {Array<object>} articles
 * @param {{threshold?:number}} opts
 * @returns {{articles:Array<object>, removed:number}}
 */
function dedupe(articles, opts = {}) {
  const threshold = typeof opts.threshold === "number" ? opts.threshold : DEFAULT_THRESHOLD;
  const kept = [];
  let removed = 0;

  for (const article of Array.isArray(articles) ? articles : []) {
    if (!article || (!article.title && !article.url)) {
      removed++;
      continue;
    }
    const nUrl = normalizeUrl(article.url);
    const nTitle = normalizeTitle(article.title);

    const idx = kept.findIndex((k) => {
      if (nUrl && normalizeUrl(k.url) === nUrl) return true;
      if (nTitle && normalizeTitle(k.title) === nTitle) return true;
      return similarity(k.title, article.title) >= threshold;
    });

    if (idx === -1) {
      kept.push(article);
    } else {
      kept[idx] = merge(kept[idx], article);
      removed++;
    }
  }

  return { articles: kept, removed };
}

module.exports = { dedupe, similarity, normalizeTitle, normalizeUrl, titleTokens };
