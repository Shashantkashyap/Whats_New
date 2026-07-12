const express = require("express");
const router = express.Router();
const { runContentPipeline } = require("../pipeline/contentPipeline");

// -------------------------
// Manual trigger
// -------------------------
// The pipeline browses/scrapes news and runs several Gemini calls — that can
// take minutes, far longer than an HTTP request should block. So we accept the
// job and run it in the background, returning 202 immediately. The client polls
// the news endpoints for results (or checks logs) instead of holding the socket.
router.post("/fetch-now", (req, res) => {
  const mode = req.query.mode === "dev" ? "dev" : "prod";
  console.log(`🔹 API Triggered: Fetching UPSC Content [mode=${mode}]`);

  runContentPipeline(mode)
    .then((result) => console.log("✅ Pipeline finished:", JSON.stringify(result.results || result)))
    .catch((err) => console.error("❌ Background pipeline error:", err.message));

  res.status(202).json({
    success: true,
    message: `Content pipeline started (mode=${mode}); results will appear shortly.`,
  });
});

module.exports = router;
