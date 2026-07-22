// Bundles the whole backend into a single self-contained CJS file — the Node
// equivalent of a fat JAR. Run it with `node dist/whatsnew-backend.cjs`.
//
// External deps below are NOT bundled on purpose:
//  - @modelcontextprotocol/sdk: lazy-required only for the opt-in
//    NEWS_PROVIDER=chrome-mcp path (default is rss). Install it separately if
//    you use chrome-mcp.
//  - The rest are optional native/dynamic add-ons that the mongodb driver and
//    `ws` probe for at runtime inside try/catch — they are never needed for the
//    default rss + API path, and can't be inlined into a single JS file anyway.

const esbuild = require("esbuild");

esbuild
  .build({
    entryPoints: ["server.js"],
    bundle: true,
    platform: "node",
    target: "node18",
    format: "cjs",
    outfile: "dist/whatsnew-backend.cjs",
    banner: { js: "#!/usr/bin/env node" },
    logLevel: "info",
    external: [
      "@modelcontextprotocol/sdk",
      "@modelcontextprotocol/sdk/*",
      "puppeteer",
      "puppeteer-core",
      // mongodb driver optional add-ons (probed via try/catch)
      "kerberos",
      "@mongodb-js/zstd",
      "@aws-sdk/credential-providers",
      "gcp-metadata",
      "snappy",
      "@napi-rs/snappy",
      "socks",
      "aws4",
      "mongodb-client-encryption",
      "bson-ext",
      // ws optional performance add-ons
      "bufferutil",
      "utf-8-validate",
    ],
  })
  .then(() => console.log("✅ Built dist/whatsnew-backend.cjs"))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
