// Pure helpers for the test engine — question selection, prelims grading, and
// the pre-submission display projection. No DB / no network so they are
// trivially unit-testable; testController wires them to Mongo + AI.

const EXAM_TYPES = ["prelims", "mains"];
const MODES = ["subject_wise", "topic_wise", "mixed"];

// Validate the create-test request. Returns { error } or { ok: true }.
function validateTestParams({ examType, mode, subject, topic, subjectId, topicId } = {}) {
  if (!EXAM_TYPES.includes(examType)) return { error: "examType must be 'prelims' or 'mains'" };
  if (!MODES.includes(mode)) return { error: "mode must be 'subject_wise', 'topic_wise' or 'mixed'" };
  if (mode === "subject_wise" && !subject && !subjectId) {
    return { error: "subject (or subject_id) is required for subject_wise mode" };
  }
  if (mode === "topic_wise" && !topic && !topicId) {
    return { error: "topic (or topic_id) is required for topic_wise mode" };
  }
  return { ok: true };
}

// Mongo filter selecting the pool a test draws from.
//   subject_wise -> all questions under a subjectId / subject name
//   topic_wise   -> a specific topicId / topic name
//   mixed        -> whole bank for that exam type (caller may weight by importance)
function buildQuestionFilter({ examType, mode, subject, topic, subjectId, topicId } = {}) {
  const filter = { type: examType };
  if (mode === "subject_wise") {
    if (subjectId) filter.subjectId = subjectId;
    else filter.subject = subject;
  } else if (mode === "topic_wise") {
    if (topicId) filter.topicId = topicId;
    else {
      filter.topic = topic;
      if (subject) filter.subject = subject;
      if (subjectId) filter.subjectId = subjectId;
    }
  }
  return filter;
}

// Weighted random sample without replacement. `weightOf(item)` defaults to 1.
// ponytail: O(n * maxWeight) via expanded index list; fine for bank < ~20k and
// importance 1..5. Upgrade = alias method / reservoir with weights.
function weightedSample(items, count, weightOf = () => 1) {
  if (!items.length || count <= 0) return [];
  const bag = [];
  items.forEach((item, i) => {
    const w = Math.max(1, Math.round(Number(weightOf(item)) || 1));
    for (let k = 0; k < w; k++) bag.push(i);
  });
  const picked = new Set();
  const out = [];
  while (out.length < Math.min(count, items.length) && bag.length) {
    const idx = bag.splice(Math.floor(Math.random() * bag.length), 1)[0];
    if (picked.has(idx)) continue;
    picked.add(idx);
    out.push(items[idx]);
  }
  return out;
}

// Snapshot a Question doc into a Test item (all data, incl. answers, kept so
// grading is stable and offline).
function toTestItem(q) {
  return {
    questionId: q._id,
    question: q.question,
    subject: q.subject,
    topic: q.topic || null,
    subjectId: q.subjectId || null,
    topicId: q.topicId || null,
    difficulty: q.difficulty || "medium",
    options: Array.isArray(q.options) ? q.options : [],
    correctAnswer: q.answer || null,
    explanation: q.explanation || "",
    hints: Array.isArray(q.hints) ? q.hints : [],
    modelAnswer: q.modelAnswer || "",
    maxMarks: q.maxMarks || 10,
  };
}

function toDisplayItem(item, examType) {
  const base = {
    question_id: String(item.questionId),
    question: item.question,
    subject: item.subject,
    topic: item.topic,
    topic_id: item.topicId ? String(item.topicId) : null,
    difficulty: item.difficulty,
  };
  if (examType === "mains") {
    return { ...base, hints: item.hints || [], max_marks: item.maxMarks };
  }
  return { ...base, options: item.options || [] };
}

function toResultItem(item) {
  return {
    question_id: String(item.questionId),
    question: item.question,
    options: item.options || [],
    your_answer: item.userAnswer,
    correct_answer: item.correctAnswer,
    is_correct: item.isCorrect,
    explanation: item.explanation || "",
  };
}

function gradePrelims(items, answersMap = {}) {
  let score = 0;
  for (const item of items) {
    const picked = answersMap[String(item.questionId)];
    item.userAnswer = picked === undefined ? null : picked;
    item.isCorrect = picked !== undefined && picked === item.correctAnswer;
    if (item.isCorrect) score += 1;
  }
  return { score, total: items.length };
}

function answersToMap(answers) {
  const map = {};
  
  // If we mistakenly got an array of arrays (e.g. from [req.body] when req.body is already an array)
  if (Array.isArray(answers) && answers.length === 1 && Array.isArray(answers[0])) {
    answers = answers[0];
  }

  if (Array.isArray(answers)) {
    for (const a of answers) {
      if (!a) continue;
      const qId = a.question_id || a.questionId || a.id;
      if (!qId) continue;
      
      const val = a.selectedOption !== undefined ? a.selectedOption : (a.answer_text || a.answerText || a.text || a.answer);
      if (val !== undefined) {
        map[String(qId)] = val;
      }
    }
  } else if (answers && typeof answers === "object") {
    // If answers is a dictionary of { questionId: answerText }
    for (const key of Object.keys(answers)) {
      map[String(key)] = answers[key];
    }
  }
  return map;
}

module.exports = {
  EXAM_TYPES,
  MODES,
  validateTestParams,
  buildQuestionFilter,
  weightedSample,
  toTestItem,
  toDisplayItem,
  toResultItem,
  gradePrelims,
  answersToMap,
};
