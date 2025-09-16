const express = require("express");
const router = express.Router();
const { runContentPipeline } = require("../pipeline/contentPipeline");

// -------------------------
// Manual trigger for testing
// -------------------------
router.post("/fetch-now", async (req, res) => {
  console.log("🔹 API Triggered: Fetching UPSC Content");
  try {
    const result = await runContentPipeline("prod");

    res.status(200).json({
      success: true,
      message: "Content pipeline executed",
      result,
    });
  } catch (err) {
    console.error("❌ API Pipeline Error:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
