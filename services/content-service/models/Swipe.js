const mongoose = require("mongoose");

// One row per (user, news card) swipe decision on the swipeable deck.
// `tags` is a denormalized snapshot of the card's tags at swipe time so the
// personalization signal is stable and computable without re-joining News.
const swipeSchema = new mongoose.Schema(
  {
    // From the JWT (minted by user-service). Stored as string to avoid coupling
    // to the user-service's mongoose instance/ObjectId.
    userId: { type: String, required: true, index: true },
    newsId: { type: mongoose.Schema.Types.ObjectId, ref: "News", required: true },
    direction: { type: String, enum: ["left", "right"], required: true },
    tags: [{ type: String, trim: true }],
  },
  { timestamps: true }
);

// A user re-swiping the same card overwrites the earlier decision rather than
// stacking duplicates (see upsert in swipeController.recordSwipe).
swipeSchema.index({ userId: 1, newsId: 1 }, { unique: true });
swipeSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model("Swipe", swipeSchema);
