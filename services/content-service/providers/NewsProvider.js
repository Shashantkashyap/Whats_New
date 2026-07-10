/**
 * NewsProvider.js - Provider interface for the news collection layer.
 *
 * The pipeline depends only on this contract, never on how articles are
 * obtained. Chrome MCP is the first implementation; NewsAPI / RSS / Google
 * News / GDELT / X / Reddit / PIB / PDF providers can be added later by
 * subclassing this and implementing collect(), with zero pipeline changes.
 *
 * Canonical article shape returned by every provider:
 *   {
 *     title:       string,
 *     url:         string,
 *     source:      string,   // human name, e.g. "The Hindu"
 *     publishedAt: string,   // ISO 8601
 *     author:      string,
 *     category:    string,
 *     image:       string,   // url or ""
 *     content:     string    // sanitized plain-text body
 *   }
 */

class NewsProvider {
  /** @param {string} name Human-readable provider name. */
  constructor(name) {
    if (new.target === NewsProvider) {
      throw new Error("NewsProvider is abstract; subclass and implement collect()");
    }
    this.name = name || "unknown-provider";
  }

  /**
   * Collect articles for a request.
   * @param {{topic:string, sources?:string[], articlesPerSource?:number, maxAgeHours?:number}} request
   * @returns {Promise<Array<object>>} canonical articles
   */
  // eslint-disable-next-line no-unused-vars
  async collect(request) {
    throw new Error(`${this.name}: collect() not implemented`);
  }
}

module.exports = NewsProvider;
