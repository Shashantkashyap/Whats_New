/**
 * Prefer unseen question ids from a pool; if short, fill randomly from already-seen.
 * When every id has been seen, reshuffle (clear seen) and sample again.
 *
 * Example: pool=15, count=10
 *  call1 → 10 unseen
 *  call2 → 5 unseen + 5 from previous seen
 *  call3 → unseen empty → reset → 10 from full pool
 */

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function idStr(id) {
  return String(id);
}

function buildPoolKey(source, filter = {}) {
  // Stable key so topic_id X practice and list share or stay separate by source.
  const parts = [
    source || "practice",
    filter.subject || "",
    filter.topicId || filter.topic || "",
    filter.type || "",
    filter.difficulty || "",
    filter.tags || filter.tag || "",
  ];
  return parts.join("|");
}

/**
 * @param {Array} poolIds - all ids in the filtered pool
 * @param {Array} seenIds - previously returned ids
 * @param {number} count
 * @returns {{ picked: string[], nextSeen: string[], meta: object }}
 */
function pickBatch(poolIds, seenIds, count) {
  const pool = [...new Set((poolIds || []).map(idStr))];
  const n = Math.max(0, Math.min(Number(count) || 0, pool.length));
  if (!pool.length || n === 0) {
    return {
      picked: [],
      nextSeen: (seenIds || []).map(idStr).filter((id) => pool.includes(id)),
      meta: { pool_size: pool.length, unseen_before: 0, recycled: 0, reset: false },
    };
  }

  let seen = [...new Set((seenIds || []).map(idStr).filter((id) => pool.includes(id)))];
  let unseen = pool.filter((id) => !seen.includes(id));
  let reset = false;

  if (unseen.length === 0) {
    // Full cycle complete — reshuffle from the whole pool.
    seen = [];
    unseen = [...pool];
    reset = true;
  }

  const fromUnseen = shuffle(unseen).slice(0, n);
  let recycled = 0;
  let picked = fromUnseen;

  if (picked.length < n) {
    const need = n - picked.length;
    const fillFrom = shuffle(seen.filter((id) => !picked.includes(id)));
    const fillers = fillFrom.slice(0, need);
    recycled = fillers.length;
    picked = picked.concat(fillers);

    // Still short only if pool itself is smaller than count (already capped by n).
    if (picked.length < n) {
      const rest = shuffle(pool.filter((id) => !picked.includes(id))).slice(0, n - picked.length);
      recycled += rest.length;
      picked = picked.concat(rest);
    }
  }

  const nextSeen = [...new Set([...seen, ...picked])];
  return {
    picked,
    nextSeen,
    meta: {
      pool_size: pool.length,
      unseen_before: unseen.length,
      recycled,
      reset,
      new_from_unseen: fromUnseen.length,
    },
  };
}

module.exports = { shuffle, pickBatch, buildPoolKey, idStr };
