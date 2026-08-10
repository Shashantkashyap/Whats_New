const mongoose = require("mongoose");

// Per-user "deck" cursor so practice/list prefer questions not yet served
// for a given filter pool. Resets when the unseen set is empty.
const questionServeCursorSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    poolKey: { type: String, required: true },
    seenIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Question" }],
  },
  { timestamps: true }
);

questionServeCursorSchema.index({ userId: 1, poolKey: 1 }, { unique: true });

module.exports = mongoose.model("QuestionServeCursor", questionServeCursorSchema);
