const test = require("node:test");
const assert = require("node:assert");
const { parseFeed, decodeEntities } = require("../utils/rssParser");

const RSS = `<?xml version="1.0"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/">
<channel>
  <title>Example</title>
  <item>
    <title><![CDATA[GST reform &amp; the economy]]></title>
    <link>https://indianexpress.com/article/gst-reform</link>
    <pubDate>Wed, 09 Jul 2026 06:00:00 +0530</pubDate>
    <dc:creator>Jane Doe</dc:creator>
    <category>Economy</category>
    <description>Short summary here.</description>
    <content:encoded><![CDATA[<p>Full body paragraph one.</p><p>Paragraph two.</p>]]></content:encoded>
    <enclosure url="https://img.example/1.jpg" type="image/jpeg"/>
  </item>
  <item>
    <title>Second story</title>
    <link>https://www.thehindu.com/news/second</link>
  </item>
</channel>
</rss>`;

const ATOM = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <title>Atom headline</title>
    <link rel="alternate" href="https://news.google.com/atom-1"/>
    <published>2026-07-09T10:00:00Z</published>
    <summary>Atom summary text.</summary>
  </entry>
</feed>`;

test("parses RSS items with CDATA, entities, namespaced tags", () => {
  const items = parseFeed(RSS);
  assert.equal(items.length, 2);
  const a = items[0];
  assert.equal(a.title, "GST reform & the economy");
  assert.equal(a.url, "https://indianexpress.com/article/gst-reform");
  assert.equal(a.author, "Jane Doe");
  assert.equal(a.category, "Economy");
  assert.equal(a.image, "https://img.example/1.jpg");
  assert.match(a.content, /Full body paragraph one/);
  assert.equal(a.summary, "Short summary here.");
});

test("falls back to summary link and handles minimal items", () => {
  const items = parseFeed(RSS);
  assert.equal(items[1].url, "https://www.thehindu.com/news/second");
  assert.equal(items[1].content, ""); // no description/content -> empty
});

test("parses Atom entries via href link", () => {
  const items = parseFeed(ATOM);
  assert.equal(items.length, 1);
  assert.equal(items[0].title, "Atom headline");
  assert.equal(items[0].url, "https://news.google.com/atom-1");
  assert.equal(items[0].content, "Atom summary text.");
});

test("empty / garbage input yields no items", () => {
  assert.deepEqual(parseFeed(""), []);
  assert.deepEqual(parseFeed("<html>not a feed</html>"), []);
});

test("decodeEntities handles numeric and named entities", () => {
  assert.equal(decodeEntities("a &amp; b &#39;c&#39; &#x2019;"), "a & b 'c' \u2019");
});
