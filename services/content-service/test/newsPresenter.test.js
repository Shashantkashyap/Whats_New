const test = require("node:test");
const assert = require("node:assert");
const {
  readTime,
  relativeLabel,
  priorityFrom,
  complexityFrom,
  indexCode,
  syllabusTag,
  toFeedItem,
  toDeck,
  toBriefDetail,
} = require("../utils/newsPresenter");

const HOUR = 3600 * 1000;

test("readTime computes minutes at 200 wpm, min 1", () => {
  assert.equal(readTime("word ".repeat(1200)), "6m read");
  assert.equal(readTime("short"), "1m read");
  assert.equal(readTime(""), "1m read");
});

test("relativeLabel buckets minutes/hours/days", () => {
  const now = Date.now();
  assert.equal(relativeLabel(new Date(now - 12 * HOUR), now), "12h ago");
  assert.equal(relativeLabel(new Date(now - 25 * HOUR), now), "1d ago");
  assert.equal(relativeLabel(new Date(now - 30000), now), "just now");
  assert.equal(relativeLabel(null, now), "just now");
});

test("priorityFrom / complexityFrom band by score", () => {
  assert.equal(priorityFrom(90), "High");
  assert.equal(priorityFrom(50), "Medium");
  assert.equal(priorityFrom(10), "Low");
  assert.equal(complexityFrom(90), "Advanced");
  assert.equal(complexityFrom(50), "Intermediate");
  assert.equal(complexityFrom(10), "Basic");
});

test("indexCode zero-pads to 2 digits", () => {
  assert.equal(indexCode(1), "01");
  assert.equal(indexCode(12), "12");
});

test("syllabusTag joins examRelevance with primary category", () => {
  assert.equal(syllabusTag({ examRelevance: ["GS-II"], categories: ["Polity"] }), "GS-II • Polity");
  assert.equal(syllabusTag({ examRelevance: [], categories: ["Economy"] }), "Economy");
});

const sampleDoc = {
  _id: "brief-102",
  title: "Electoral Bond Verdict",
  description: "SC struck down the scheme.",
  content: "word ".repeat(1000),
  categories: ["Polity"],
  examRelevance: ["GS-II"],
  relevanceScore: 85,
  publishedAt: new Date(Date.now() - 12 * HOUR),
  author: "Dr. Arvinder Singh",
  why: "Landmark transparency ruling.",
  flowchartNodes: [
    { label: "Unconstitutional", content: "Violates RTI." },
    { label: "Proportionality", content: "Failed the test." },
  ],
  mainsQuestion: { question: "Analyze the verdict.", hints: ["RPA 1951"] },
};

test("toFeedItem maps position, icon, priority and synopsis", () => {
  const now = Date.now();
  const item = toFeedItem(sampleDoc, 1, { now });
  assert.equal(item.id, "brief-102");
  assert.equal(item.index_code, "01");
  assert.equal(item.category, "Polity");
  assert.equal(item.category_icon, "shield");
  assert.equal(item.priority, "High");
  assert.equal(item.updated_at_label, "12h ago");
  assert.equal(item.synopsis, "SC struck down the scheme.");
  assert.equal(item.is_bookmarked, false);
  assert.equal(item.challenge.attempted, false);
  assert.equal(item.challenge.answered_count, 0);
});

test("toFeedItem attaches per-user challenge progress", () => {
  const item = toFeedItem(
    { ...sampleDoc, mcqs: [{}, {}, {}] },
    1,
    {
      challenge: {
        attempted: true,
        completed: false,
        answered_count: 1,
        total_questions: 3,
        selected_answers: { "0": 2 },
        prelims_score: null,
        mains_submitted: false,
      },
    }
  );
  assert.equal(item.challenge.attempted, true);
  assert.equal(item.challenge.answered_count, 1);
  assert.deepEqual(item.challenge.selected_answers, { "0": 2 });
});

test("image_document_id is exposed; private URLs are never returned", () => {
  const withImg = toFeedItem({ ...sampleDoc, imageDocumentId: "507f1f77bcf86cd799439011", imageUrl: "https://secret/x.jpg" }, 1);
  assert.equal(withImg.image_document_id, "507f1f77bcf86cd799439011");
  assert.equal(withImg.image_url, undefined);
  const noImg = toFeedItem(sampleDoc, 1);
  assert.equal(noImg.image_document_id, null);
  assert.equal(toDeck({ ...sampleDoc, imageDocumentId: "507f1f77bcf86cd799439012" }).image_document_id, "507f1f77bcf86cd799439012");
  assert.equal(toBriefDetail({ ...sampleDoc, imageDocumentId: "507f1f77bcf86cd799439013" }).image_document_id, "507f1f77bcf86cd799439013");
});

test("toDeck builds slides from flowchartNodes; null when empty", () => {
  const deck = toDeck(sampleDoc);
  assert.equal(deck.total_slides, 2);
  assert.equal(deck.slides[0].slide_index, 1);
  assert.equal(deck.slides[0].heading, "Unconstitutional");
  assert.equal(deck.action_cta, "Open Deep Analysis Dossier");
  assert.equal(toDeck({ _id: "x", title: "no content" }), null);
});

test("toBriefDetail exposes pillars, mains question, references and telemetry", () => {
  const d = toBriefDetail(sampleDoc);
  assert.equal(d.core_briefing, "Landmark transparency ruling.");
  assert.equal(d.key_analytical_pillars[0].pillar_index, "01");
  assert.equal(d.mains_focus_question, "Analyze the verdict.");
  assert.deepEqual(d.noted_references, ["RPA 1951"]);
  assert.equal(d.telemetry.author, "Dr. Arvinder Singh");
  assert.equal(d.telemetry.complexity_rating, "Advanced");
});

test("toBriefDetail exposes prelims_mcqs without answers", () => {
  const d = toBriefDetail({
    ...sampleDoc,
    mcqs: [{ question: "Q?", options: ["A", "B"], answer: "B" }],
  });
  assert.equal(d.prelims_mcqs.length, 1);
  assert.equal(d.prelims_mcqs[0].question, "Q?");
  assert.equal(d.prelims_mcqs[0].answer, undefined);
  assert.deepEqual(d.prelims_mcqs[0].options, ["A", "B"]);
});

test("presenters fall back to summary bullets when no flowchartNodes", () => {
  const doc = { _id: "b2", title: "T", summary: ["First point", "Second point"], categories: ["Economy"] };
  const deck = toDeck(doc);
  assert.equal(deck.total_slides, 2);
  assert.equal(deck.slides[0].content, "First point");
  const detail = toBriefDetail(doc);
  assert.equal(detail.key_analytical_pillars.length, 2);
});
