// UPSC subject taxonomy (subjects -> topics with importance) loaded from the
// shipped upsc_taxonomy_v3_rated.json, plus the mapping from the pipeline's
// news-tags to a subject. Seeded into Subject/Topic collections via
// scripts/seedTaxonomy.js — runtime validation uses this file so unit tests
// don't need Mongo.

const taxonomy = require("./upsc_taxonomy_v3_rated.json");

const SUBJECTS = Array.isArray(taxonomy.subjects) ? taxonomy.subjects : [];
const SUBJECT_NAMES = SUBJECTS.map((s) => s.name);
const SUBJECT_SET = new Set(SUBJECT_NAMES);

// Flatten topic entries to { name, importance } regardless of legacy string form.
function normalizeTopicEntry(t) {
  if (typeof t === "string") return { name: t, importance: 3 };
  return {
    name: String(t.name || "").trim(),
    importance: Math.min(5, Math.max(1, Number(t.importance) || 3)),
  };
}

const SUBJECTS_NORMALIZED = SUBJECTS.map((s) => ({
  name: s.name,
  topics: (Array.isArray(s.topics) ? s.topics : []).map(normalizeTopicEntry).filter((t) => t.name),
}));

// Pipeline news-tags (see contentPipeline.tagsConfig) -> canonical subject name.
const TAG_TO_SUBJECT = {
  Polity: "Polity & Governance",
  Governance: "Polity & Governance",
  Judiciary: "Polity & Governance",
  "Legal Affairs": "Polity & Governance",
  "Public Administration": "Polity & Governance",
  Economy: "Economy",
  Finance: "Economy",
  Trade: "Economy",
  Agriculture: "Economy",
  Infrastructure: "Economy",
  Energy: "Economy",
  Transport: "Economy",
  IR: "International Relations",
  "Science & Tech": "Science & Technology",
  Technology: "Science & Technology",
  Cybersecurity: "Science & Technology",
  Innovation: "Science & Technology",
  Environment: "Environment & Ecology",
  "Climate Change": "Environment & Ecology",
  "Internal Security": "Security & Disaster Management",
  "Disaster Management": "Security & Disaster Management",
  Ethics: "Ethics, Integrity & Aptitude",
  "Social Issues": "Indian Society",
  Health: "Indian Society",
  Education: "Indian Society",
  Culture: "Indian Society",
};

const DEFAULT_SUBJECT = "General Studies";

function subjectForTags(tags = []) {
  for (const t of tags) {
    if (TAG_TO_SUBJECT[t]) return TAG_TO_SUBJECT[t];
  }
  return DEFAULT_SUBJECT;
}

function normalizeSubject(name) {
  if (!name) return null;
  if (SUBJECT_SET.has(name)) return name;
  const lc = String(name).toLowerCase();
  return SUBJECT_NAMES.find((s) => s.toLowerCase() === lc) || name;
}

// Topic objects ({ name, importance }) under a subject.
function topicsForSubject(name) {
  const s = SUBJECTS_NORMALIZED.find((x) => x.name === normalizeSubject(name));
  return s ? s.topics.slice() : [];
}

// Exact (case-insensitive) topic match under a subject. Returns the canonical
// { name, importance } or null.
function findTopicInSubject(subjectName, topicName) {
  if (!topicName) return null;
  const topics = topicsForSubject(subjectName);
  const lc = String(topicName).trim().toLowerCase();
  return topics.find((t) => t.name.toLowerCase() === lc) || null;
}

// Fuzzy: topic name contained in taxonomy name or vice-versa (min length 6).
function fuzzyTopicInSubject(subjectName, topicName) {
  if (!topicName) return null;
  const needle = String(topicName).trim().toLowerCase();
  if (needle.length < 4) return null;
  const topics = topicsForSubject(subjectName);
  const exact = findTopicInSubject(subjectName, topicName);
  if (exact) return exact;
  const hits = topics.filter((t) => {
    const hay = t.name.toLowerCase();
    return hay.includes(needle) || (needle.length >= 6 && needle.includes(hay));
  });
  if (!hits.length) return null;
  hits.sort((a, b) => b.importance - a.importance);
  return hits[0];
}

// Highest-importance topic under a subject (fallback for harvest/retag).
function defaultTopicForSubject(subjectName) {
  const topics = topicsForSubject(subjectName);
  if (!topics.length) return null;
  return topics.slice().sort((a, b) => b.importance - a.importance)[0];
}

// Flat list of every topic with its subject — used by topic-first generation.
function allTopics() {
  const out = [];
  for (const s of SUBJECTS_NORMALIZED) {
    for (const t of s.topics) {
      out.push({ subject: s.name, name: t.name, importance: t.importance });
    }
  }
  return out;
}

module.exports = {
  SUBJECTS: SUBJECTS_NORMALIZED,
  SUBJECT_NAMES,
  TAG_TO_SUBJECT,
  DEFAULT_SUBJECT,
  subjectForTags,
  normalizeSubject,
  topicsForSubject,
  findTopicInSubject,
  fuzzyTopicInSubject,
  defaultTopicForSubject,
  allTopics,
};
