const mongoose = require("mongoose");

// One question inside a test attempt. Question data is SNAPSHOTTED here at
// creation time so grading is stable (and correct answers / model answers stay
// server-side, never leaking into the pre-submission display view).
const testItemSchema = new mongoose.Schema(
  {
    questionId: { type: mongoose.Schema.Types.ObjectId, ref: "Question", required: true },
    question: { type: String, required: true },
    subject: { type: String },
    topic: { type: String, default: null },
    subjectId: { type: mongoose.Schema.Types.ObjectId, ref: "Subject", default: null },
    topicId: { type: mongoose.Schema.Types.ObjectId, ref: "Topic", default: null },
    difficulty: { type: String, default: "medium" },

    // Prelims snapshot
    options: [{ type: String }],
    correctAnswer: { type: String, default: null },
    explanation: { type: String, default: "" },

    // Mains snapshot
    hints: [{ type: String }],
    modelAnswer: { type: String, default: "" },
    maxMarks: { type: Number, default: 10 },

    // Filled on submission/evaluation
    userAnswer: { type: String, default: null }, // prelims: chosen option; mains: written/OCR text
    userAnswerImageId: { type: mongoose.Schema.Types.ObjectId, ref: "MediaAsset", default: null }, // mains photo
    isCorrect: { type: Boolean, default: null }, // prelims
    marks: { type: Number, default: null }, // mains (AI)
    feedback: { type: String, default: null }, // mains (AI)
    improvements: [{ type: String }], // mains (AI)
  },
  { _id: false }
);

const testSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    examType: { type: String, enum: ["prelims", "mains"], required: true },
    mode: { type: String, enum: ["subject_wise", "topic_wise", "mixed"], required: true },
    subject: { type: String, default: null },
    topic: { type: String, default: null },
    subjectId: { type: mongoose.Schema.Types.ObjectId, ref: "Subject", default: null },
    topicId: { type: mongoose.Schema.Types.ObjectId, ref: "Topic", default: null },

    // created -> (prelims) evaluated | (mains) submitted -> evaluated
    status: { type: String, enum: ["created", "submitted", "evaluated"], default: "created", index: true },

    items: [testItemSchema],

    score: { type: Number, default: null }, // prelims: #correct; mains: total marks
    maxScore: { type: Number, default: null },
    submittedAt: { type: Date, default: null },
    evaluatedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

testSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model("Test", testSchema);
