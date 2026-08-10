const mongoose = require("mongoose");

// Persistent media record. `storageUrl` is the private CDN/S3 location and
// must NEVER appear in API responses — clients address assets by `_id` and
// fetch bytes via GET /api/v1/media/:id.
const mediaAssetSchema = new mongoose.Schema(
  {
    storageUrl: { type: String, required: true, trim: true },
    contentType: { type: String, trim: true, default: "image/jpeg" },
    // news_image | mains_sheet | mains_answer | subject_fallback
    kind: { type: String, required: true, trim: true, index: true },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

mediaAssetSchema.index({ kind: 1, "meta.category": 1 });

module.exports = mongoose.model("MediaAsset", mediaAssetSchema);
