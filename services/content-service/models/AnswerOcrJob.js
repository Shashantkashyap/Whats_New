const mongoose = require("mongoose");

// Temporary OCR draft for a mains answer photo. Image bytes are NOT stored —
// only status + extracted text, keyed by (user, test, question). TTL cleans up.
const answerOcrJobSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    testId: { type: mongoose.Schema.Types.ObjectId, ref: "Test", required: true },
    questionId: { type: mongoose.Schema.Types.ObjectId, ref: "Question", required: true },
    // queued → in_progress → done | failed
    status: {
      type: String,
      enum: ["queued", "in_progress", "done", "failed"],
      default: "queued",
      index: true,
    },
    answerText: { type: String, default: null },
    confidence: { type: Number, default: null },
    error: { type: String, default: null },
  },
  { timestamps: true }
);

answerOcrJobSchema.index({ userId: 1, testId: 1, questionId: 1 }, { unique: true });
// ponytail: 24h TTL on drafts; upgrade = longer retention or persist onto Test.items.
answerOcrJobSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 24 * 60 * 60 });

module.exports = mongoose.model("AnswerOcrJob", answerOcrJobSchema);
