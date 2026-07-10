/**
 * chromeMcpService.js - Thin client for a Chrome MCP server.
 *
 * Responsibilities ONLY (no business logic):
 *   - connect to a Chrome MCP server (we are the MCP client)
 *   - open pages, navigate, wait, evaluate scripts, list/close pages
 *   - enforce the domain allowlist on every navigation
 *   - disconnect / clean up
 *
 * The backend decides HOW browsing happens; higher layers (newsScraperService)
 * decide WHAT to collect. The MCP SDK is lazy-required inside connect() so this
 * module (and its unit tests, which inject a fake client) load without it.
 *
 * `deps.createClient` is the seam for testing: it must return an object with
 *   { callTool({name, arguments}) => Promise<result>, close() => Promise<void> }
 */

const config = require("../config/newsConfig");
const logger = require("../utils/logger");

class ChromeMcpError extends Error {}

class ChromeMcpService {
  constructor(cfg = config, deps = {}) {
    this.cfg = cfg;
    this.log = deps.logger || logger;
    this.createClient = deps.createClient || defaultClientFactory(cfg);
    this.client = null;
  }

  get tools() {
    return this.cfg.chromeMcp.tools;
  }

  async connect() {
    if (this.client) return this.client;
    this.client = await this.log.timed("mcp.connect", { command: this.cfg.chromeMcp.command }, () =>
      this.createClient()
    );
    return this.client;
  }

  async _call(name, args) {
    if (!this.client) await this.connect();
    const result = await this.client.callTool({ name, arguments: args || {} });
    return parseToolResult(result);
  }

  /** Open a new browser page, optionally navigating to an (allowed) url. */
  async newPage(url) {
    if (url) this._assertAllowed(url);
    const res = await this._call(this.tools.newPage, url ? { url } : {});
    this.log.info("mcp.newPage", { url: url || null });
    return res;
  }

  /** Navigate the active page. Rejects any non-allowlisted URL. */
  async navigate(url) {
    this._assertAllowed(url);
    this.log.info("mcp.navigate", { url });
    return this._call(this.tools.navigate, { url });
  }

  /**
   * Evaluate a JS function (as a string, e.g. "() => document.title") in the
   * page context and return its parsed result. Page content is UNTRUSTED.
   */
  async evaluate(functionString) {
    // ponytail: arg shape follows chrome-devtools-mcp (`function`). Other MCP
    // servers may expect `expression`; override by wrapping this method.
    return this._call(this.tools.evaluate, { function: functionString });
  }

  async waitFor(text, timeoutMs) {
    return this._call(this.tools.waitFor, {
      text: text || undefined,
      timeout: timeoutMs || this.cfg.pageTimeoutMs,
    });
  }

  async listPages() {
    return this._call(this.tools.listPages, {});
  }

  async closePage(pageId) {
    this.log.info("mcp.closePage", { pageId: pageId ?? null });
    return this._call(this.tools.closePage, pageId != null ? { pageIdx: pageId } : {});
  }

  async disconnect() {
    if (!this.client) return;
    try {
      await this.client.close();
    } catch (err) {
      this.log.warn("mcp.disconnect.error", { error: err?.message });
    } finally {
      this.client = null;
    }
  }

  _assertAllowed(url) {
    if (!this.cfg.isAllowedUrl(url)) {
      throw new ChromeMcpError(`Refusing to visit non-allowlisted URL: ${url}`);
    }
  }
}

/** Extract text payload from an MCP tool result and JSON-parse if possible. */
function parseToolResult(result) {
  if (result == null) return null;
  if (result.isError) {
    const msg = extractText(result) || "MCP tool returned an error";
    throw new ChromeMcpError(msg);
  }
  const text = extractText(result);
  if (text == null) return result;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function extractText(result) {
  const content = result && result.content;
  if (Array.isArray(content)) {
    const textPart = content.find((c) => c && c.type === "text" && typeof c.text === "string");
    if (textPart) return textPart.text;
  }
  if (typeof result === "string") return result;
  return null;
}

/** Default factory: lazily builds a real stdio MCP client. */
function defaultClientFactory(cfg) {
  return async function createClient() {
    let Client, StdioClientTransport;
    try {
      ({ Client } = require("@modelcontextprotocol/sdk/client/index.js"));
      ({ StdioClientTransport } = require("@modelcontextprotocol/sdk/client/stdio.js"));
    } catch (err) {
      throw new ChromeMcpError(
        "@modelcontextprotocol/sdk is not installed. Run `npm i @modelcontextprotocol/sdk` in services/content-service."
      );
    }
    const transport = new StdioClientTransport({
      command: cfg.chromeMcp.command,
      args: cfg.chromeMcp.args,
    });
    const client = new Client({ name: "whats-new-content-service", version: "1.0.0" }, { capabilities: {} });
    await client.connect(transport);
    return client;
  };
}

module.exports = ChromeMcpService;
module.exports.ChromeMcpError = ChromeMcpError;
module.exports.parseToolResult = parseToolResult;
