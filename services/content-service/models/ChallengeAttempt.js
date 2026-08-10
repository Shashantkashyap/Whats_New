const mongoose = require("mongoose");

// Per-user, per-news daily-challenge progress (prelims MCQ + mains sheet).
const challengeAttemptSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    newsId: { type: mongoose.Schema.Types.ObjectId, ref: "News", required: true, index: true },

    prelimsScore: { type: Number, default: 0 },
    totalQuestions: { type: Number, default: 0 },
    // Map of question index (string) -> selected option index (number).
    selectedAnswers: { type: mongoose.Schema.Types.Mixed, default: {} },
    prelimsCompletedAt: { type: Date },

    mains: {
      submitted: { type: Boolean, default: false },
      submittedAt: { type: Date },
      answerSheetDocumentId: { type: mongoose.Schema.Types.ObjectId, ref: "MediaAsset" },
      // Unattempted | Pending Review | Reviewed
      evaluationStatus: { type: String, default: "Unattempted", trim: true },
      insights: { type: mongoose.Schema.Types.Mixed, default: null },
      // e.g. ["VISION_TIMEOUT"] when OCR validation timed out but we still saved.
      warningTags: { type: [String], default: [] },
    },
  },
  { timestamps: true }
);

challengeAttemptSchema.index({ userId: 1, newsId: 1 }, { unique: true });

module.exports = mongoose.model("ChallengeAttempt", challengeAttemptSchema);
