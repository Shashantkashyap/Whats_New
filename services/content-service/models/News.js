const mongoose = require("mongoose");

const mcqSchema = new mongoose.Schema(
  {
    question: { type: String, required: true },
    options: [{ type: String }], // ["A", "B", "C", "D"]
    answer: { type: String, required: true }, // correct option
  },
  { _id: false }
);

const newsSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    content: {
      type: String,
      required: true,
      trim: true,
    },
    url: {
      type: String,
      trim: true,
    },
    source: {
      type: String,
      trim: true,
    },
    author: {
      type: String,
      trim: true,
    },
    publishedAt: {
      type: Date,
      default: Date.now,
      required: true,
      index: true,
    },

    // 🔥 UPSC-specific fields
    why: {
      type: String, // Reason about this news
      trim: true,
    },
    summary: [
      {
        type: String, // bullet points
        trim: true,
      },
    ],
    flowchart: {
      type: String, // plain text (optional fallback)
      trim: true,
    },
    flowchartNodes: [
      {
        id: { type: String, required: true }, // unique node id
        label: { type: String, required: true }, // node title
        content: { type: String, required: true }, // detailed description of this step (2-3 sentences)
        connections: [{ type: String }], // array of connected node ids
      },
    ],
    examRelevance: [
      {
        type: String, // GS-II, GS-III etc.
        trim: true,
      },
    ],
    mcqs: [mcqSchema], // 5 mast wale most relevant mcqs
    mainsQuestion: {
      question: { type: String, trim: true },
      hints: [{ type: String, trim: true }],
    },

    imageUrl: {
      type: String,
      trim: true,
    },

    // Generic fields
    tags: [
      {
        type: String,
        trim: true,
      },
    ],
    categories: [
      {
        type: String, // e.g. "UPSC", "Polity", "Economy"
        trim: true,
      },
    ],
    relevanceScore: {
      type: Number,
      default: 0,
    },
    // Gemini-generated UPSC exam-value score (1-10) based on exam-relevance,
    // factual depth, and current-affairs weightage. 0 = unrated. Distinct from
    // relevanceScore, which is a heuristic (tags/recency/source).
    rating: {
      type: Number,
      default: 0,
      min: 0,
      max: 10,
    },
    ratingRationale: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true }
);

// 📌 Indexes
newsSchema.index({ rating: -1, publishedAt: -1 });
newsSchema.index({ relevanceScore: -1, publishedAt: -1 });
newsSchema.index({ categories: 1 });
newsSchema.index({ source: 1 });
newsSchema.index({ title: "text", content: "text", description: "text" });

const News = mongoose.model("News", newsSchema);

module.exports = News;
