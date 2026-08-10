// Pure mappers from a stored News document -> the shapes the Executive
// Intelligence front-end expects. No DB, no Mongoose: they take plain objects
// so they are trivially unit-testable and reusable across endpoints.

const { iconForCategory } = require("../config/curriculum");

const WORDS_PER_MINUTE = 200;

// "6m read" from the article body. Always at least 1 minute.
function readTime(text) {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean).length;
  const minutes = Math.max(1, Math.round(words / WORDS_PER_MINUTE));
  return `${minutes}m read`;
}

// Relative label like "12h ago" / "3d ago". `now` is injectable for tests.
function relativeLabel(date, now = Date.now()) {
  if (!date) return "just now";
  const diffMs = now - new Date(date).getTime();
  if (Number.isNaN(diffMs)) return "just now";
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

// relevanceScore (0-100) -> executive priority band. Thresholds documented here.
function priorityFrom(score = 0) {
  if (score >= 70) return "High";
  if (score >= 40) return "Medium";
  return "Low";
}

function complexityFrom(score = 0) {
  if (score >= 70) return "Advanced";
  if (score >= 40) return "Intermediate";
  return "Basic";
}

// Zero-padded 2-digit position, e.g. 1 -> "01".
// ponytail: 2-digit pad is fine for typical page sizes; a page of >99 items
// would need a wider pad (upgrade: String(n).padStart(width, "0")).
function indexCode(n) {
  return String(n).padStart(2, "0");
}

function primaryCategory(doc) {
  return (Array.isArray(doc.categories) && doc.categories[0]) || "General";
}

// "GS-II • Constitution & Judiciary" style tag. Built from examRelevance
// (e.g. ["GS-II"]) joined with the primary category as best-effort context.
function syllabusTag(doc) {
  const exam = (Array.isArray(doc.examRelevance) ? doc.examRelevance : []).filter(Boolean);
  const category = primaryCategory(doc);
  const left = exam.join(", ");
  if (left && category) return `${left} • ${category}`;
  return left || category;
}

// Turn a doc into slide/pillar sections. Prefers structured flowchartNodes
// (label -> heading, content), falls back to summary bullets.
function sections(doc) {
  const nodes = Array.isArray(doc.flowchartNodes) ? doc.flowchartNodes : [];
  if (nodes.length) {
    return nodes.map((n, i) => ({ index: i + 1, heading: n.label || `Point ${i + 1}`, content: n.content || "" }));
  }
  const bullets = (Array.isArray(doc.summary) ? doc.summary : []).filter(Boolean);
  return bullets.map((b, i) => ({ index: i + 1, heading: `Point ${i + 1}`, content: b }));
}

function id(doc) {
  return doc._id ? String(doc._id) : doc.id;
}

// Public media handle only — never the private storage/CDN URL. Clients fetch
// bytes from GET /api/v1/media/:image_document_id.
function imageDocumentId(doc) {
  if (!doc.imageDocumentId) return null;
  return String(doc.imageDocumentId);
}

// --- Public shapes -------------------------------------------------------

// Feed list item. `position` is the 1-based index across the whole result set.
// `challenge` is per-user MCQ progress (null for guests).
function toFeedItem(doc, position, { now = Date.now(), bookmarked = false, challenge = null } = {}) {
  const category = primaryCategory(doc);
  const totalMcqs = Array.isArray(doc.mcqs) ? doc.mcqs.length : 0;
  return {
    id: id(doc),
    index_code: indexCode(position),
    title: doc.title,
    syllabus_tag: syllabusTag(doc),
    category,
    category_icon: iconForCategory(category),
    image_document_id: imageDocumentId(doc),
    read_time: readTime(doc.content),
    priority: priorityFrom(doc.relevanceScore),
    is_priority: !!doc.isPriority,
    updated_at_label: relativeLabel(doc.updatedAt || doc.publishedAt, now),
    synopsis: doc.description || (Array.isArray(doc.summary) && doc.summary[0]) || "",
    is_bookmarked: bookmarked,
    // Guests: null. Authed: whether they've answered any / all dossier MCQs.
    challenge: challenge || {
      attempted: false,
      completed: false,
      answered_count: 0,
      total_questions: totalMcqs,
      selected_answers: {},
    },
  };
}

// Swipable flashcard deck. Returns null if there is nothing slide-able.
function toDeck(doc, { now = Date.now() } = {}) {
  const secs = sections(doc);
  if (!secs.length) return null;
  const category = primaryCategory(doc);
  return {
    id: id(doc),
    category,
    category_icon: iconForCategory(category),
    tag: syllabusTag(doc),
    title: doc.title,
    image_document_id: imageDocumentId(doc),
    is_priority: !!doc.isPriority,
    slides: secs.map((s) => ({ slide_index: s.index, heading: s.heading, content: s.content })),
    total_slides: secs.length,
    action_cta: "Open Deep Analysis Dossier",
  };
}

// Full editorial dossier for the detail page.
function toBriefDetail(doc, { now = Date.now(), bookmarked = false } = {}) {
  const category = primaryCategory(doc);
  const notes = (doc.mainsQuestion && Array.isArray(doc.mainsQuestion.hints) && doc.mainsQuestion.hints.length)
    ? doc.mainsQuestion.hints
    : (Array.isArray(doc.tags) ? doc.tags : []);
  return {
    id: id(doc),
    title: doc.title,
    syllabus_tag: syllabusTag(doc),
    category,
    category_icon: iconForCategory(category),
    image_document_id: imageDocumentId(doc),
    read_time: readTime(doc.content),
    priority: priorityFrom(doc.relevanceScore),
    is_priority: !!doc.isPriority,
    updated_at_label: relativeLabel(doc.updatedAt || doc.publishedAt, now),
    is_bookmarked: bookmarked,
    core_briefing: doc.why || doc.description || "",
    key_analytical_pillars: sections(doc).map((s) => ({
      pillar_index: indexCode(s.index),
      heading: s.heading,
      content: s.content,
    })),
    mains_focus_question: (doc.mainsQuestion && doc.mainsQuestion.question) || null,
    // Prelims challenge MCQs — options only; answers revealed after submit-mcq.
    prelims_mcqs: (Array.isArray(doc.mcqs) ? doc.mcqs : []).map((m, i) => ({
      index: i,
      question: m.question,
      options: Array.isArray(m.options) ? m.options : [],
    })),
    noted_references: notes,
    telemetry: {
      author: doc.author || null,
      complexity_rating: complexityFrom(doc.relevanceScore),
    },
  };
}

module.exports = {
  readTime,
  relativeLabel,
  priorityFrom,
  complexityFrom,
  indexCode,
  syllabusTag,
  primaryCategory,
  imageDocumentId,
  sections,
  toFeedItem,
  toDeck,
  toBriefDetail,
};
