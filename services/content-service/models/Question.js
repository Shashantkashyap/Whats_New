const mongoose = require("mongoose");

// Subject-wise practice/test question. Distinct from the MCQs embedded in a
// News dossier: this is the standalone, growable question bank the practice
// mode draws from. Questions can be authored directly, bulk-imported, or
// harvested from news MCQs (see scripts/harvestQuestions.js).
//
// Topic-first rule: every question MUST link to an exact taxonomy Topic
// (topicId). Free-text / subject-only tagging is rejected at insert time.
const questionSchema = new mongoose.Schema(
  {
    // "prelims" = objective MCQ (has options + a single answer); "mains" =
    // descriptive question (no options/answer; carries hints + a model answer
    // used only for AI evaluation, never shown before submission).
    type: { type: String, enum: ["prelims", "mains"], default: "prelims", index: true },

    question: { type: String, required: true, trim: true },
    options: [{ type: String, trim: true }], // prelims: typically 4 choices
    // Required for prelims (must equal one option); optional for mains.
    answer: {
      type: String,
      trim: true,
      required: function () {
        return this.type !== "mains";
      },
    },
    explanation: { type: String, trim: true, default: "" }, // prelims solution

    // Mains-only: hints shown to the aspirant before they answer, and an
    // optional model answer that grounds the AI evaluation (kept server-side).
    hints: [{ type: String, trim: true }],
    modelAnswer: { type: String, trim: true, default: "" },
    maxMarks: { type: Number, default: 10 }, // mains: marks the question is out of

    // Strict taxonomy FKs (seeded from upsc_taxonomy_v3_rated.json).
    subjectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subject",
      required: true,
      index: true,
    },
    topicId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Topic",
      required: true,
      index: true,
    },
    // Denormalized names for API responses / legacy filters (always mirror FKs).
    subject: { type: String, required: true, trim: true, index: true },
    topic: { type: String, required: true, trim: true, index: true },
    tags: [{ type: String, trim: true }],

    difficulty: { type: String, enum: ["easy", "medium", "hard"], default: "medium" },
    source: { type: String, trim: true, default: null },
    // When harvested from a news dossier, the originating News _id (used to
    // de-duplicate on re-runs).
    sourceNewsId: { type: mongoose.Schema.Types.ObjectId, ref: "News", default: null },
    // Set by retag migration when no confident topic match was found and the
    // question was assigned a subject default / discarded flag.
    retagStatus: {
      type: String,
      enum: ["exact", "fuzzy", "default", "unmatched", null],
      default: null,
    },
  },
  { timestamps: true }
);

questionSchema.index({ type: 1, subjectId: 1, topicId: 1 });
questionSchema.index({ type: 1, topicId: 1 });
// Guards against importing the exact same question twice under the same topic.
questionSchema.index({ topicId: 1, type: 1, question: 1 }, { unique: true });
questionSchema.index({ question: "text" });

module.exports = mongoose.model("Question", questionSchema);
