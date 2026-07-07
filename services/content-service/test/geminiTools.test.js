const test = require("node:test");
const assert = require("node:assert");
const { SCRAPE_NEWS_DECLARATION, makeScrapeNewsHandler, collectNews } = require("../services/geminiTools");

const silent = { info() {}, warn() {}, error() {} };

test("declaration exposes scrape_news with a required topic", () => {
  assert.equal(SCRAPE_NEWS_DECLARATION.name, "scrape_news");
  assert.deepEqual(SCRAPE_NEWS_DECLARATION.parameters.required, ["topic"]);
});

test("handler requires a NewsProvider", () => {
  assert.throws(() => makeScrapeNewsHandler({}), /requires a NewsProvider/);
});

test("handler forwards args to provider.collect", async () => {
  let received;
  const provider = { async collect(req) { received = req; return [{ title: "x" }]; } };
  const handler = makeScrapeNewsHandler(provider, silent);
  const out = await handler({ topic: "GST", sources: ["PIB"], articlesPerSource: 3, maxAgeHours: 12 });
  assert.deepEqual(out, [{ title: "x" }]);
  assert.deepEqual(received, { topic: "GST", sources: ["PIB"], articlesPerSource: 3, maxAgeHours: 12 });
});

test("handler rejects empty topic", async () => {
  const handler = makeScrapeNewsHandler({ async collect() { return []; } }, silent);
  await assert.rejects(() => handler({}), /topic is required/);
});

test("collectNews falls back to direct scrape when model is null", async () => {
  const calls = [];
  const provider = { async collect(req) { calls.push(req); return [{ title: "fallback story" }]; } };
  const out = await collectNews({ provider, model: null, logger: silent });
  assert.deepEqual(out, [{ title: "fallback story" }]);
  assert.equal(calls.length, 1);
  assert.ok(calls[0].topic, "fallback used a default topic");
});

test("collectNews runs the agentic tool loop when Gemini calls scrape_news", async () => {
  const provider = { async collect(req) { return [{ title: `scraped:${req.topic}` }]; } };
  const fakeModel = {
    startChat() {
      return {
        async sendMessage() {
          return { response: { functionCalls: () => [{ name: "scrape_news", args: { topic: "elections" } }] } };
        },
      };
    },
  };
  const out = await collectNews({ provider, model: fakeModel, logger: silent });
  assert.deepEqual(out, [{ title: "scraped:elections" }]);
});

test("collectNews falls back when agentic loop yields nothing", async () => {
  let fallbackUsed = false;
  const provider = {
    async collect(req) {
      if (req.topic === "elections") return []; // agentic call returns empty
      fallbackUsed = true;
      return [{ title: "from fallback" }];
    },
  };
  const fakeModel = {
    startChat() {
      return { async sendMessage() { return { response: { functionCalls: () => [{ name: "scrape_news", args: { topic: "elections" } }] } }; } };
    },
  };
  const out = await collectNews({ provider, model: fakeModel, logger: silent });
  assert.equal(fallbackUsed, true);
  assert.deepEqual(out, [{ title: "from fallback" }]);
});
