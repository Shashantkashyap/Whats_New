/**
 * newsCache.js - TTL cache for scraped news keyed by topic + sources.
 *
 * Prevents re-scraping the same topic within the TTL window.
 *
 * ponytail: in-process Map only - not shared across instances/restarts.
 * Upgrade path = swap the get/set body for Redis with the same interface.
 */

class NewsCache {
  constructor({ ttlMs = 15 * 60 * 1000 } = {}) {
    this.ttlMs = ttlMs;
    this.store = new Map();
  }

  static keyFor(topic, sources = []) {
    const t = String(topic || "").trim().toLowerCase();
    const s = [...sources].map((x) => String(x).toLowerCase()).sort().join(",");
    return `${t}::${s}`;
  }

  get(topic, sources) {
    const key = NewsCache.keyFor(topic, sources);
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  set(topic, sources, value) {
    const key = NewsCache.keyFor(topic, sources);
    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
    return value;
  }

  clear() {
    this.store.clear();
  }

  get size() {
    return this.store.size;
  }
}

module.exports = NewsCache;
