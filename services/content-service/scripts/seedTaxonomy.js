#!/usr/bin/env node
/**
 * seedTaxonomy.js — one-time (idempotent) import of upsc_taxonomy_v3_rated.json
 * into Subject + Topic collections.
 *
 *   node scripts/seedTaxonomy.js
 *   make seed-taxonomy
 *
 * Safe to re-run: upserts by subject name / (subjectId, topic name).
 */

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../../../.env") });
require("dotenv").config();

const mongoose = require("mongoose");
const connectDB = require("../config/db");
const Subject = require("../models/Subject");
const Topic = require("../models/Topic");
const { SUBJECTS } = require("../config/subjects");
const { clearTaxonomyCache } = require("../utils/taxonomyResolve");

async function seedTaxonomy() {
  let subjectsUpserted = 0;
  let topicsUpserted = 0;

  for (const s of SUBJECTS) {
    const subject = await Subject.findOneAndUpdate(
      { name: s.name },
      { $set: { name: s.name } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    subjectsUpserted++;

    for (const t of s.topics) {
      await Topic.findOneAndUpdate(
        { subjectId: subject._id, name: t.name },
        {
          $set: {
            subjectId: subject._id,
            name: t.name,
            importance: t.importance,
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      topicsUpserted++;
    }
  }

  clearTaxonomyCache();
  const [subjectCount, topicCount] = await Promise.all([
    Subject.countDocuments(),
    Topic.countDocuments(),
  ]);

  return { subjectsUpserted, topicsUpserted, subjectCount, topicCount };
}

async function main() {
  await connectDB();
  try {
    const r = await seedTaxonomy();
    console.log("🌱 Taxonomy seed complete:");
    console.log(`   Subjects upserted: ${r.subjectsUpserted} (db total ${r.subjectCount})`);
    console.log(`   Topics upserted:   ${r.topicsUpserted} (db total ${r.topicCount})`);
  } catch (err) {
    console.error("❌ Seed failed:", err.message);
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close();
  }
}

if (require.main === module) main();

module.exports = { seedTaxonomy };
