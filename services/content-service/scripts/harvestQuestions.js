#!/usr/bin/env node
/**
 * harvestQuestions.js — lift News-embedded MCQs into the Question bank with a
 * strict taxonomy topicId (never free-text news tags as topic).
 *
 * Subject from TAG_TO_SUBJECT; topic via bestEffortTopic (exact → fuzzy →
 * highest-importance default under that subject).
 *
 * Prerequisite: `make seed-taxonomy`
 * Usage:  node scripts/harvestQuestions.js
 */

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../../../.env") });
require("dotenv").config();

const mongoose = require("mongoose");
const connectDB = require("../config/db");
const News = require("../models/News");
const Question = require("../models/Question");
const { subjectForTags, DEFAULT_SUBJECT, SUBJECT_NAMES } = require("../config/subjects");
const { toQuestionDoc, attachTaxonomyIds } = require("../controllers/questionController");
const { bestEffortTopic, loadTaxonomyCache } = require("../utils/taxonomyResolve");

async function harvest() {
  await loadTaxonomyCache();
  const newsWithMcqs = await News.find({ "mcqs.0": { $exists: true } })
    .select("mcqs tags source _id")
    .lean();

  let candidates = 0;
  const docs = [];
  let skippedSubject = 0;

  for (const news of newsWithMcqs) {
    const subject = subjectForTags(news.tags || []);
    if (!SUBJECT_NAMES.includes(subject)) {
      skippedSubject += (news.mcqs || []).length;
      continue;
    }
    // Prefer first tag as a fuzzy hint; fall back to subject default topic.
    const topicHint = (news.tags && news.tags[0]) || null;
    const matched = await bestEffortTopic({ subject, topic: topicHint });
    if (matched.error) {
      skippedSubject += (news.mcqs || []).length;
      continue;
    }

    for (const mcq of news.mcqs || []) {
      if (!mcq.question || !mcq.answer) continue;
      candidates++;
      const { doc, error } = toQuestionDoc({
        type: "prelims",
        question: mcq.question,
        options: Array.isArray(mcq.options) ? mcq.options : [],
        answer: mcq.answer,
        subject: matched.subject,
        topic: matched.topic,
        tags: news.tags || [],
        source: news.source || null,
        sourceNewsId: news._id,
      });
      if (error) continue;
      doc.retagStatus = matched.match;
      docs.push(doc);
    }
  }

  const { ready, invalid } = await attachTaxonomyIds(docs);

  let inserted = 0;
  if (ready.length) {
    try {
      const res = await Question.insertMany(ready, { ordered: false });
      inserted = res.length;
    } catch (err) {
      inserted = err.insertedDocs ? err.insertedDocs.length : 0;
    }
  }

  return {
    newsScanned: newsWithMcqs.length,
    candidates,
    inserted,
    skipped: candidates - inserted,
    invalid: invalid.length,
    skippedSubject,
    defaultSubject: DEFAULT_SUBJECT,
  };
}

async function main() {
  await connectDB();
  try {
    const report = await harvest();
    console.log("📚 Question harvest complete:");
    console.log(`   News scanned:     ${report.newsScanned}`);
    console.log(`   MCQ candidates:   ${report.candidates}`);
    console.log(`   Inserted:         ${report.inserted}`);
    console.log(`   Skipped (dupe):   ${report.skipped}`);
    console.log(`   Invalid resolve:  ${report.invalid}`);
    console.log(`   Skipped subject:  ${report.skippedSubject}`);
  } catch (err) {
    console.error("❌ Harvest failed:", err.message);
    console.error("   Tip: run `make seed-taxonomy` first.");
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close();
  }
}

if (require.main === module) main();

module.exports = { harvest };
