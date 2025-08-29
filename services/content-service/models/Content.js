const mongoose = require("mongoose");

const ContentSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    url: { type: String, required: true, unique: true },
    summary: { type: String, required: true },
    tag: { type: String, required: true }, // one of central tags
    source: { type: String },
    publishedAt: { type: Date },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Content", ContentSchema);
