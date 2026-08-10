// Turns a user's swipe history into a per-tag affinity signal and uses it to
// re-rank news. Pure functions (plain objects in, plain data out) so they are
// trivially unit-testable and reusable by every personalized endpoint.
//
// Model: a right swipe on a card is a positive vote for each of that card's
// tags (+1), a left swipe is a negative vote (-1). Summing across a user's
// swipes gives a net affinity per tag — the subjects they lean into over time.

// computeAffinity(swipes) -> Map<tag, netScore>
// Each swipe carries a `direction` ("left" | "right") and a `tags` snapshot
// (the card's tags at swipe time, so ranking is stable even if the doc changes).
function computeAffinity(swipes = []) {
  const affinity = new Map();
  for (const s of swipes) {
    const weight = s && s.direction === "right" ? 1 : s && s.direction === "left" ? -1 : 0;
    if (!weight) continue;
    const tags = Array.isArray(s.tags) ? s.tags : [];
    for (const tag of tags) {
      affinity.set(tag, (affinity.get(tag) || 0) + weight);
    }
  }
  return affinity;
}

// Affinity score for a single document = sum of its tags' affinities.
function scoreDoc(doc, affinity) {
  if (!affinity || affinity.size === 0) return 0;
  const tags = Array.isArray(doc.tags) ? doc.tags : [];
  return tags.reduce((sum, t) => sum + (affinity.get(t) || 0), 0);
}

// rankByAffinity(docs, affinity) -> new array sorted by affinity desc.
// Stable: docs with equal affinity keep their incoming order (which callers set
// to relevance/recency), so with no swipe history the input order is preserved.
function rankByAffinity(docs = [], affinity) {
  if (!affinity || affinity.size === 0) return [...docs];
  return docs
    .map((doc, i) => ({ doc, i, score: scoreDoc(doc, affinity) }))
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .map((x) => x.doc);
}

// sortTagsByAffinity(tags, affinity, tagMatchers) -> new array.
// Orders curriculum tags for display: "All" pinned first, then exam-critical
// (is_priority) topics, then by how much the user leans into the subjects they
// cover (swipe affinity), annotating each with `affinity_score`.
// `tagMatchers(tag)` returns the news-tags that count toward that curriculum
// tag (null = "all", which is always pinned first).
function sortTagsByAffinity(tags = [], affinity, tagMatchers) {
  const scored = tags.map((t, i) => {
    const matchTags = typeof tagMatchers === "function" ? tagMatchers(t.slug) : null;
    let score = 0;
    if (affinity && affinity.size && Array.isArray(matchTags)) {
      score = matchTags.reduce((sum, mt) => sum + (affinity.get(mt) || 0), 0);
    }
    const pinned = !matchTags; // "all" (null matchers) stays on top
    return { ...t, affinity_score: score, _i: i, _pinned: pinned };
  });
  scored.sort((a, b) => {
    if (a._pinned !== b._pinned) return a._pinned ? -1 : 1;
    const ap = a.is_priority ? 1 : 0;
    const bp = b.is_priority ? 1 : 0;
    if (ap !== bp) return bp - ap; // exam-critical topics first
    return b.affinity_score - a.affinity_score || a._i - b._i;
  });
  return scored.map(({ _i, _pinned, ...rest }) => rest);
}

module.exports = { computeAffinity, scoreDoc, rankByAffinity, sortTagsByAffinity };
