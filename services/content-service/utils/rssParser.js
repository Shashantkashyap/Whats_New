/**
 * rssParser.js - Minimal, dependency-free RSS 2.0 / Atom parser.
 *
 * We only consume a handful of well-formed feeds from major outlets, so a
 * focused regex parser is enough and keeps the module (and its tests) free of
 * any XML dependency.
 *
 * ponytail: this is NOT a general XML parser. It handles <item>/<entry>,
 * CDATA, common entities, namespaced tags (content:encoded, dc:creator) and
 * enclosures. Upgrade path = swap parseFeed() for `rss-parser`/`fast-xml-parser`
 * if a feed ever uses exotic XML this can't handle. Pure + stdlib only.
 */

function decodeEntities(input) {
  return String(input || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => safeCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => safeCodePoint(parseInt(d, 10)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&"); // must be last
}

function safeCodePoint(n) {
  try {
    return String.fromCodePoint(n);
  } catch {
    return "";
  }
}

/** Inner text of the first <name>...</name> (name may be namespaced). */
function tagText(block, name) {
  const re = new RegExp(`<${escapeName(name)}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escapeName(name)}>`, "i");
  const m = block.match(re);
  return m ? decodeEntities(m[1]).trim() : "";
}

/** Value of an attribute on the first <name .../> tag. */
function tagAttr(block, name, attrName) {
  const re = new RegExp(`<${escapeName(name)}\\b[^>]*?\\b${attrName}\\s*=\\s*["']([^"']+)["']`, "i");
  const m = block.match(re);
  return m ? decodeEntities(m[1]).trim() : "";
}

function escapeName(name) {
  return String(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function firstNonEmpty(...vals) {
  for (const v of vals) if (v && String(v).trim()) return String(v).trim();
  return "";
}

function extractLink(block) {
  // RSS: <link>url</link>. Atom: <link href="url" rel="alternate"/>.
  const rss = tagText(block, "link");
  if (rss && /^https?:\/\//i.test(rss)) return rss;
  const alternate = matchAtomLink(block, "alternate") || matchAtomLink(block, null);
  if (alternate) return alternate;
  // Fall back to a permalink guid/id.
  const guid = tagText(block, "guid") || tagText(block, "id");
  return /^https?:\/\//i.test(guid) ? guid : rss || "";
}

function matchAtomLink(block, rel) {
  const links = block.match(/<link\b[^>]*\/?>/gi) || [];
  for (const l of links) {
    const href = (l.match(/\bhref\s*=\s*["']([^"']+)["']/i) || [])[1];
    if (!href) continue;
    const linkRel = (l.match(/\brel\s*=\s*["']([^"']+)["']/i) || [])[1];
    if (rel === null && !linkRel) return decodeEntities(href);
    if (rel && (linkRel || "alternate").toLowerCase() === rel) return decodeEntities(href);
  }
  return "";
}

function extractImage(block) {
  return firstNonEmpty(
    tagAttr(block, "enclosure", "url"),
    tagAttr(block, "media:content", "url"),
    tagAttr(block, "media:thumbnail", "url"),
  );
}

function parseItem(block) {
  const title = tagText(block, "title");
  const url = extractLink(block);
  const description = tagText(block, "description") || tagText(block, "summary");
  const content = firstNonEmpty(tagText(block, "content:encoded"), tagText(block, "content"));
  return {
    title,
    url,
    publishedAt: firstNonEmpty(
      tagText(block, "pubDate"),
      tagText(block, "published"),
      tagText(block, "updated"),
      tagText(block, "dc:date"),
    ),
    author: firstNonEmpty(tagText(block, "author"), tagText(block, "dc:creator"), tagText(block, "creator")),
    category: tagText(block, "category"),
    image: extractImage(block),
    // Prefer the richer full-content field; fall back to the summary.
    content: firstNonEmpty(content, description),
    summary: description,
  };
}

/**
 * Parse an RSS 2.0 or Atom feed string into item objects.
 * @param {string} xml
 * @returns {Array<{title,url,publishedAt,author,category,image,content,summary}>}
 */
function parseFeed(xml) {
  const text = String(xml || "");
  const itemBlocks = text.match(/<item\b[\s\S]*?<\/item>/gi) || [];
  const entryBlocks = itemBlocks.length ? [] : text.match(/<entry\b[\s\S]*?<\/entry>/gi) || [];
  const blocks = itemBlocks.length ? itemBlocks : entryBlocks;
  return blocks.map(parseItem).filter((it) => it.title || it.url);
}

module.exports = { parseFeed, decodeEntities, parseItem };
