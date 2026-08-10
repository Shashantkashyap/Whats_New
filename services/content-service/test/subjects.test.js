const test = require("node:test");
const assert = require("node:assert");
const {
  SUBJECT_NAMES,
  subjectForTags,
  normalizeSubject,
  topicsForSubject,
  findTopicInSubject,
  defaultTopicForSubject,
  allTopics,
  DEFAULT_SUBJECT,
} = require("../config/subjects");
const { toQuestionDoc } = require("../controllers/questionController");

test("taxonomy loads the expected subjects with rated topics", () => {
  assert.ok(SUBJECT_NAMES.includes("Polity & Governance"));
  assert.ok(SUBJECT_NAMES.includes("Economy"));
  assert.ok(SUBJECT_NAMES.length >= 10);
  const polityTopics = topicsForSubject("Polity & Governance");
  assert.ok(polityTopics.length > 0);
  assert.ok(polityTopics[0].name);
  assert.ok(polityTopics[0].importance >= 1 && polityTopics[0].importance <= 5);
  assert.ok(allTopics().length >= 200);
});

test("subjectForTags maps pipeline tags to a canonical subject", () => {
  assert.equal(subjectForTags(["Polity", "Governance"]), "Polity & Governance");
  assert.equal(subjectForTags(["Trade"]), "Economy");
  assert.equal(subjectForTags(["IR"]), "International Relations");
  assert.equal(subjectForTags(["Science & Tech"]), "Science & Technology");
  assert.equal(subjectForTags(["NotATag"]), DEFAULT_SUBJECT);
  assert.equal(subjectForTags([]), DEFAULT_SUBJECT);
});

test("normalizeSubject is case-insensitive; findTopicInSubject is exact", () => {
  assert.equal(normalizeSubject("economy"), "Economy");
  const topics = topicsForSubject("Polity & Governance");
  const sample = topics[0].name;
  assert.ok(findTopicInSubject("Polity & Governance", sample));
  assert.ok(findTopicInSubject("Polity & Governance", sample.toUpperCase()));
  assert.equal(findTopicInSubject("Polity & Governance", "Not A Real Topic XYZ"), null);
  assert.ok(defaultTopicForSubject("Economy"));
});

test("toQuestionDoc requires an exact taxonomy topic", () => {
  assert.ok(toQuestionDoc({ answer: "A", options: ["A"] }).error); // no question
  assert.ok(toQuestionDoc({ question: "Q?" }).error); // no answer
  assert.ok(toQuestionDoc({ question: "Q?", answer: "Z", options: ["A", "B"] }).error);
  assert.ok(toQuestionDoc({ question: "Q?", answer: "A", options: ["A", "B"], tags: ["Trade"] }).error); // no topic

  const topic = topicsForSubject("Economy")[0].name;
  const { doc, error } = toQuestionDoc({
    question: "Q?",
    answer: "A",
    options: ["A", "B"],
    subject: "Economy",
    topic,
  });
  assert.equal(error, undefined);
  assert.equal(doc.subject, "Economy");
  assert.equal(doc.topic, topic);
  assert.equal(doc.type, "prelims");
});

test("toQuestionDoc rejects free-text topics not in taxonomy", () => {
  const { error } = toQuestionDoc({
    question: "Q?",
    answer: "A",
    options: ["A"],
    subject: "Polity & Governance",
    topic: "Indian Legislature Random Alias",
  });
  assert.match(error, /exact taxonomy topic/);
});

test("toQuestionDoc accepts a mains question with exact topic", () => {
  const topic = topicsForSubject("Polity & Governance")[0].name;
  const { doc, error } = toQuestionDoc({
    type: "mains",
    question: "Critically examine cooperative federalism in India.",
    hints: ["GST Council", "NITI Aayog"],
    subject: "Polity & Governance",
    topic,
    maxMarks: 15,
  });
  assert.equal(error, undefined);
  assert.equal(doc.type, "mains");
  assert.equal(doc.answer, undefined);
  assert.deepEqual(doc.hints, ["GST Council", "NITI Aayog"]);
  assert.equal(doc.maxMarks, 15);
  assert.equal(doc.topic, topic);
});
