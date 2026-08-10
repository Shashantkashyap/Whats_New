// Resolve taxonomy Subject/Topic ObjectIds for question docs. Seed must have
// run first (scripts/seedTaxonomy.js) so names map to stable ids.

const Subject = require("../models/Subject");
const Topic = require("../models/Topic");
const {
  normalizeSubject,
  findTopicInSubject,
  fuzzyTopicInSubject,
  defaultTopicForSubject,
} = require("../config/subjects");

let cache = null; // { bySubjectName, byTopicKey, byTopicId }

async function loadTaxonomyCache() {
  if (cache) return cache;
  const subjects = await Subject.find().lean();
  const topics = await Topic.find().lean();
  const bySubjectName = new Map(subjects.map((s) => [s.name, s]));
  const byTopicKey = new Map(); // `${subjectId}|${topicNameLower}` → topic
  const byTopicId = new Map(topics.map((t) => [String(t._id), t]));
  for (const t of topics) {
    byTopicKey.set(`${String(t.subjectId)}|${t.name.toLowerCase()}`, t);
  }
  cache = { bySubjectName, byTopicKey, byTopicId, subjects, topics };
  return cache;
}

function clearTaxonomyCache() {
  cache = null;
}

async function resolveSubjectRef({ subject, subjectId } = {}) {
  const c = await loadTaxonomyCache();
  if (subjectId) {
    const sub = c.subjects.find((s) => String(s._id) === String(subjectId));
    if (!sub) return { error: "subject_id not found in taxonomy" };
    return { subjectId: sub._id, subject: sub.name };
  }
  const subjectName = normalizeSubject(subject);
  if (!subjectName || !c.bySubjectName.has(subjectName)) {
    return { error: `unknown subject "${subject}" — seed taxonomy first` };
  }
  const sub = c.bySubjectName.get(subjectName);
  return { subjectId: sub._id, subject: subjectName };
}

async function resolveTopicRef({ subject, topic, topicId, subjectId } = {}) {
  const c = await loadTaxonomyCache();

  if (topicId) {
    const t = c.byTopicId.get(String(topicId));
    if (!t) return { error: "topic_id not found in taxonomy" };
    const sub = c.subjects.find((s) => String(s._id) === String(t.subjectId));
    if (!sub) return { error: "topic_id has no parent subject" };
    if (subject && normalizeSubject(subject) !== sub.name) {
      return { error: `topic_id does not belong to subject "${subject}"` };
    }
    return {
      subjectId: t.subjectId,
      topicId: t._id,
      subject: sub.name,
      topic: t.name,
      importance: t.importance,
      match: "id",
    };
  }

  const subjectName = normalizeSubject(subject);
  if (!subjectName || !c.bySubjectName.has(subjectName)) {
    return { error: `unknown subject "${subject}" — seed taxonomy first` };
  }
  const sub = c.bySubjectName.get(subjectName);

  if (!topic) return { error: "topic_id (or topic name) is required" };

  const exact = findTopicInSubject(subjectName, topic);
  if (exact) {
    const t = c.byTopicKey.get(`${String(sub._id)}|${exact.name.toLowerCase()}`);
    if (!t) return { error: `topic "${exact.name}" not seeded — run seedTaxonomy` };
    return {
      subjectId: sub._id,
      topicId: t._id,
      subject: subjectName,
      topic: exact.name,
      importance: t.importance,
      match: "exact",
    };
  }

  return { error: `topic must be an exact taxonomy topic under "${subjectName}"` };
}

// Best-effort match for migrating legacy free-text topics.
async function bestEffortTopic({ subject, topic } = {}) {
  const c = await loadTaxonomyCache();
  const subjectName = normalizeSubject(subject);
  if (!subjectName || !c.bySubjectName.has(subjectName)) {
    return { error: `unknown subject "${subject}"` };
  }
  const sub = c.bySubjectName.get(subjectName);

  const exact = findTopicInSubject(subjectName, topic);
  if (exact) {
    const t = c.byTopicKey.get(`${String(sub._id)}|${exact.name.toLowerCase()}`);
    if (t) {
      return {
        subjectId: sub._id,
        topicId: t._id,
        subject: subjectName,
        topic: exact.name,
        match: "exact",
      };
    }
  }

  const fuzzy = fuzzyTopicInSubject(subjectName, topic);
  if (fuzzy) {
    const t = c.byTopicKey.get(`${String(sub._id)}|${fuzzy.name.toLowerCase()}`);
    if (t) {
      return {
        subjectId: sub._id,
        topicId: t._id,
        subject: subjectName,
        topic: fuzzy.name,
        match: "fuzzy",
      };
    }
  }

  const fallback = defaultTopicForSubject(subjectName);
  if (fallback) {
    const t = c.byTopicKey.get(`${String(sub._id)}|${fallback.name.toLowerCase()}`);
    if (t) {
      return {
        subjectId: sub._id,
        topicId: t._id,
        subject: subjectName,
        topic: fallback.name,
        match: "default",
      };
    }
  }

  return { error: "no topic match", match: "unmatched" };
}

module.exports = {
  loadTaxonomyCache,
  clearTaxonomyCache,
  resolveSubjectRef,
  resolveTopicRef,
  bestEffortTopic,
};
