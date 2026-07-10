const test = require("node:test");
const assert = require("node:assert");
const ChromeMcpService = require("../services/chromeMcpService");
const { parseToolResult, ChromeMcpError } = ChromeMcpService;

function fakeClient() {
  const calls = [];
  return {
    calls,
    async callTool({ name, arguments: args }) {
      calls.push({ name, args });
      if (name === "evaluate_script") return { content: [{ type: "text", text: JSON.stringify({ title: "T" }) }] };
      return { content: [{ type: "text", text: "ok" }] };
    },
    async close() { this.closed = true; },
  };
}

test("parseToolResult extracts text and JSON-parses", () => {
  assert.deepEqual(parseToolResult({ content: [{ type: "text", text: '{"a":1}' }] }), { a: 1 });
  assert.equal(parseToolResult({ content: [{ type: "text", text: "hello" }] }), "hello");
});

test("parseToolResult throws on isError", () => {
  assert.throws(() => parseToolResult({ isError: true, content: [{ type: "text", text: "bad" }] }), ChromeMcpError);
});

test("navigate rejects non-allowlisted URLs", async () => {
  const svc = new ChromeMcpService(undefined, { createClient: async () => fakeClient() });
  await svc.connect();
  await assert.rejects(() => svc.navigate("https://evil.example.com/x"), /non-allowlisted/);
});

test("navigate allows approved domains and calls the configured tool", async () => {
  const client = fakeClient();
  const svc = new ChromeMcpService(undefined, { createClient: async () => client });
  await svc.navigate("https://www.thehindu.com/news/story");
  const call = client.calls.find((c) => c.name === "navigate_page");
  assert.ok(call, "navigate_page called");
  assert.equal(call.args.url, "https://www.thehindu.com/news/story");
});

test("evaluate returns parsed JSON from the page", async () => {
  const svc = new ChromeMcpService(undefined, { createClient: async () => fakeClient() });
  const out = await svc.evaluate("() => ({})");
  assert.deepEqual(out, { title: "T" });
});

test("disconnect closes the client and clears it", async () => {
  const client = fakeClient();
  const svc = new ChromeMcpService(undefined, { createClient: async () => client });
  await svc.connect();
  await svc.disconnect();
  assert.equal(client.closed, true);
  assert.equal(svc.client, null);
});
