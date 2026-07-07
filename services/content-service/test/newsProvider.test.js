const test = require("node:test");
const assert = require("node:assert");
const NewsProvider = require("../providers/NewsProvider");

test("NewsProvider cannot be instantiated directly", () => {
  assert.throws(() => new NewsProvider("x"), /abstract/);
});

test("subclass must implement collect()", async () => {
  class Bad extends NewsProvider {
    constructor() { super("bad"); }
  }
  await assert.rejects(() => new Bad().collect({ topic: "x" }), /not implemented/);
});

test("subclass with collect() works and keeps its name", async () => {
  class Good extends NewsProvider {
    constructor() { super("good"); }
    async collect(req) { return [{ title: req.topic }]; }
  }
  const p = new Good();
  assert.equal(p.name, "good");
  assert.deepEqual(await p.collect({ topic: "hello" }), [{ title: "hello" }]);
});
