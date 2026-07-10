/**
 * mcp-smoke.js - Manual smoke tests for the Chrome MCP news flow.
 *
 * These hit a REAL Chrome MCP server (and real websites), so they are not part
 * of `npm test`. Run them by hand to calibrate the integration on real hardware.
 *
 * Prereqs:
 *   - `npm install` in services/content-service (installs @modelcontextprotocol/sdk)
 *   - A Chrome/Chromium the MCP server can drive
 *   - Network access to the newspaper sites
 *
 * Usage:
 *   node scripts/mcp-smoke.js connect
 *       Launch the MCP server, list its tools, disconnect. Proves the transport
 *       + SDK + server command all work.
 *
 *   node scripts/mcp-smoke.js raw <allowlisted-url>
 *       new_page -> navigate -> evaluate a trivial script, printing the RAW
 *       (unparsed) tool results. Use this to see exactly how evaluate_script
 *       and wait_for shape their responses, so parsing can be calibrated.
 *
 *   node scripts/mcp-smoke.js scrape <topic> [sourceName]
 *       Run ChromeMCPNewsProvider.collect() for real (scrape -> dedup ->
 *       quality filter) and print the resulting articles as JSON. No Gemini,
 *       no MongoDB. Defaults to a single source ("The Hindu") to stay quick.
 */

require("dotenv").config();
const config = require("../config/newsConfig");
const ChromeMcpService = require("../services/chromeMcpService");
const ChromeMCPNewsProvider = require("../providers/ChromeMCPNewsProvider");

async function cmdConnect() {
  const svc = new ChromeMcpService();
  await svc.connect();
  const tools = await svc.client.listTools();
  console.log("Connected. Server tools:");
  for (const t of tools.tools || []) console.log(`  - ${t.name}`);
  await svc.disconnect();
  console.log("Disconnected OK.");
}

async function cmdRaw(url) {
  if (!url) throw new Error("usage: raw <allowlisted-url>");
  if (!config.isAllowedUrl(url)) throw new Error(`URL not on allowlist: ${url}`);

  const svc = new ChromeMcpService();
  await svc.connect();
  const t = config.chromeMcp.tools;

  const show = (label, res) => {
    console.log(`\n=== ${label} (raw) ===`);
    console.log(JSON.stringify(res, null, 2));
  };

  show("new_page", await svc.client.callTool({ name: t.newPage, arguments: { url } }));
  show("navigate_page", await svc.client.callTool({ name: t.navigate, arguments: { type: "url", url } }));
  show(
    "evaluate_script",
    await svc.client.callTool({ name: t.evaluate, arguments: { function: "() => JSON.stringify({ title: document.title, h1: (document.querySelector('h1')||{}).textContent || '' })" } })
  );

  await svc.disconnect();
}

async function cmdScrape(topic, sourceName) {
  if (!topic) throw new Error('usage: scrape "<topic>" [sourceName]');
  const provider = new ChromeMCPNewsProvider();
  const sources = sourceName ? [sourceName] : ["The Hindu"];
  console.log(`Scraping topic="${topic}" sources=${JSON.stringify(sources)} ...`);
  const articles = await provider.collect({ topic, sources, articlesPerSource: 3 });
  console.log(`\nGot ${articles.length} article(s):`);
  console.log(
    JSON.stringify(
      articles.map((a) => ({ ...a, content: `${(a.content || "").slice(0, 160)}… (${(a.content || "").length} chars)` })),
      null,
      2
    )
  );
}

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  switch (cmd) {
    case "connect": return cmdConnect();
    case "raw": return cmdRaw(args[0]);
    case "scrape": return cmdScrape(args[0], args[1]);
    default:
      console.log("commands: connect | raw <url> | scrape \"<topic>\" [sourceName]");
      process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("SMOKE FAILED:", err?.message || err);
    process.exit(1);
  });
