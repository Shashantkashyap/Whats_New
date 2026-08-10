const mongoose = require("mongoose");

// A user's bookmark on a news item. One row per (user, news); saving again is a
// no-op (unique index), unsaving deletes the row.
const savedNewsSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    newsId: { type: mongoose.Schema.Types.ObjectId, ref: "News", required: true },
  },
  { timestamps: true }
);

savedNewsSchema.index({ userId: 1, newsId: 1 }, { unique: true });
savedNewsSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model("SavedNews", savedNewsSchema);
