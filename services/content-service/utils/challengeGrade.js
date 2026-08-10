// Grade dossier-embedded MCQs. selected_answers is a map of question index →
// either an option index (number) or the option string itself.
//
// Never trust a client-supplied score — always derive it here.

function toChallengeMcqs(mcqs = []) {
  return (Array.isArray(mcqs) ? mcqs : []).map((m, i) => ({
    index: i,
    question: m.question,
    options: Array.isArray(m.options) ? m.options : [],
  }));
}

function resolvePick(mcq, raw) {
  if (raw === undefined || raw === null || raw === "") return { picked: null, selectedIndex: null };
  if (typeof raw === "number" && Number.isInteger(raw)) {
    const opts = Array.isArray(mcq.options) ? mcq.options : [];
    return { picked: opts[raw] !== undefined ? opts[raw] : null, selectedIndex: raw };
  }
  const picked = String(raw);
  const opts = Array.isArray(mcq.options) ? mcq.options : [];
  const selectedIndex = opts.indexOf(picked);
  return { picked, selectedIndex: selectedIndex >= 0 ? selectedIndex : null };
}

function answeredCount(selectedAnswers = {}) {
  if (!selectedAnswers || typeof selectedAnswers !== "object" || Array.isArray(selectedAnswers)) return 0;
  return Object.keys(selectedAnswers).filter((k) => {
    const v = selectedAnswers[k];
    return v !== undefined && v !== null && v !== "";
  }).length;
}

// Grade one MCQ. Returns { error } or { index, result }.
function gradeSingleMcq(mcqs = [], questionIndex, selected) {
  const list = Array.isArray(mcqs) ? mcqs : [];
  if (!list.length) {
    return { error: "NO_MCQS", message: "This news item has no prelims MCQs to grade." };
  }
  const idx = Number(questionIndex);
  if (!Number.isInteger(idx) || idx < 0 || idx >= list.length) {
    return { error: "INVALID_QUESTION_INDEX", message: `question_index must be an integer in 0..${list.length - 1}.` };
  }
  if (selected === undefined || selected === null || selected === "") {
    return { error: "INVALID_SELECTION", message: "selected (option index or option text) is required." };
  }

  const mcq = list[idx];
  const { picked, selectedIndex } = resolvePick(mcq, selected);
  if (picked === null) {
    return { error: "INVALID_SELECTION", message: "selected does not match a valid option." };
  }
  const correct = String(mcq.answer || "");
  const isCorrect = picked === correct;

  return {
    index: idx,
    result: {
      index: idx,
      question: mcq.question,
      options: Array.isArray(mcq.options) ? mcq.options : [],
      selected: picked,
      selected_index: selectedIndex,
      correct_answer: correct,
      is_correct: isCorrect,
    },
  };
}

function gradeNewsMcqs(mcqs = [], selectedAnswers = {}) {
  const list = Array.isArray(mcqs) ? mcqs : [];
  if (!list.length) {
    return { error: "NO_MCQS", message: "This news item has no prelims MCQs to grade." };
  }
  if (!selectedAnswers || typeof selectedAnswers !== "object" || Array.isArray(selectedAnswers)) {
    return { error: "INVALID_ANSWERS", message: "selected_answers must be an object map of index → choice." };
  }

  let score = 0;
  const results = [];
  for (let i = 0; i < list.length; i++) {
    const mcq = list[i];
    const raw = selectedAnswers[String(i)] !== undefined ? selectedAnswers[String(i)] : selectedAnswers[i];
    const { picked, selectedIndex } = resolvePick(mcq, raw);
    const correct = String(mcq.answer || "");
    const isCorrect = picked !== null && picked === correct;
    if (isCorrect) score += 1;
    results.push({
      index: i,
      question: mcq.question,
      options: Array.isArray(mcq.options) ? mcq.options : [],
      selected: picked,
      selected_index: selectedIndex,
      correct_answer: correct,
      is_correct: isCorrect,
    });
  }

  return {
    score,
    total_questions: list.length,
    selected_answers: selectedAnswers,
    results,
  };
}

// Compact challenge progress for feed cards (no answer keys).
function toChallengeProgress(attempt, totalQuestions = 0) {
  if (!attempt) {
    return {
      attempted: false,
      completed: false,
      answered_count: 0,
      total_questions: totalQuestions,
      selected_answers: {},
    };
  }
  const selected = attempt.selectedAnswers || {};
  const answered = answeredCount(selected);
  return {
    attempted: answered > 0 || !!attempt.prelimsCompletedAt || !!(attempt.mains && attempt.mains.submitted),
    completed: !!attempt.prelimsCompletedAt,
    answered_count: answered,
    total_questions: attempt.totalQuestions || totalQuestions,
    prelims_score: attempt.prelimsCompletedAt ? attempt.prelimsScore || 0 : null,
    selected_answers: selected,
    mains_submitted: !!(attempt.mains && attempt.mains.submitted),
  };
}

module.exports = {
  toChallengeMcqs,
  gradeNewsMcqs,
  gradeSingleMcq,
  resolvePick,
  answeredCount,
  toChallengeProgress,
};
