#!/usr/bin/env node
/**
 * retagQuestions.js — migrate legacy free-text Question.topic strings onto
 * strict Topic FKs after seedTaxonomy has run.
 *
 * Match order per question:
 *   1. exact taxonomy topic name under its subject
 *   2. fuzzy containment match
 *   3. highest-importance topic under the subject (flagged retagStatus=default)
 *   4. unmatched → flag + optionally discard (--discard-unmatched)
 *
 *   node scripts/retagQuestions.js
 *   node scripts/retagQuestions.js --discard-unmatched
 *   make retag-questions
 */

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../../../.env") });
require("dotenv").config();

const mongoose = require("mongoose");
const connectDB = require("../config/db");
const Question = require("../models/Question");
const { bestEffortTopic, loadTaxonomyCache } = require("../utils/taxonomyResolve");

const DISCARD = process.argv.includes("--discard-unmatched");

async function retagQuestions({ discardUnmatched = false } = {}) {
  await loadTaxonomyCache(); // fail fast if seed hasn't run
  const cursor = Question.find().cursor();
  const counts = { exact: 0, fuzzy: 0, default: 0, unmatched: 0, discarded: 0, total: 0 };

  for await (const q of cursor) {
    counts.total++;
    const result = await bestEffortTopic({ subject: q.subject, topic: q.topic });

    if (result.error || result.match === "unmatched") {
      counts.unmatched++;
      if (discardUnmatched) {
        await Question.deleteOne({ _id: q._id });
        counts.discarded++;
      }
      // else leave untouched — still missing FKs until discarded or fixed manually
      continue;
    }

    q.subjectId = result.subjectId;
    q.topicId = result.topicId;
    q.subject = result.subject;
    q.topic = result.topic;
    q.retagStatus = result.match;
    counts[result.match] = (counts[result.match] || 0) + 1;

    try {
      await q.save();
    } catch (err) {
      // Unique index collision after canonicalizing topic — drop the dupe.
      if (err.code === 11000) {
        await Question.deleteOne({ _id: q._id });
        counts.discarded++;
      } else {
        throw err;
      }
    }
  }

  return counts;
}

async function main() {
  await connectDB();
  try {
    const r = await retagQuestions({ discardUnmatched: DISCARD });
    console.log("🏷️  Question retag complete:");
    console.log(`   Total:      ${r.total}`);
    console.log(`   Exact:      ${r.exact}`);
    console.log(`   Fuzzy:      ${r.fuzzy}`);
    console.log(`   Default:    ${r.default}`);
    console.log(`   Unmatched:  ${r.unmatched}`);
    console.log(`   Discarded:  ${r.discarded}`);
  } catch (err) {
    console.error("❌ Retag failed:", err.message);
    console.error("   Tip: run `make seed-taxonomy` first.");
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close();
  }
}

if (require.main === module) main();

module.exports = { retagQuestions };
