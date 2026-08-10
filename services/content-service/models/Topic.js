const mongoose = require("mongoose");

const topicSchema = new mongoose.Schema(
  {
    subjectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subject",
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    // Exam-criticality rating from the rated taxonomy (1 = low, 5 = highest).
    importance: { type: Number, required: true, min: 1, max: 5, default: 3, index: true },
  },
  { timestamps: true }
);

topicSchema.index({ subjectId: 1, name: 1 }, { unique: true });
topicSchema.index({ name: 1 });

module.exports = mongoose.model("Topic", topicSchema);
