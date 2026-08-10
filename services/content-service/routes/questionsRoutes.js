const express = require("express");
const router = express.Router();
const questionController = require("../controllers/questionController");
const { bearerAuth } = require("../middleware/auth");

// Literal paths before "/:id" so "/subjects" and "/practice" are not swallowed
// by the id param route.

// Subject-wise catalogue with live question counts.
router.get("/subjects", bearerAuth, questionController.listSubjects);

// Random practice set for a subject (practice/test mode).
router.get("/practice", bearerAuth, questionController.getPractice);

// Filterable list (subject/topic/tag/difficulty, paginated or random).
router.get("/", bearerAuth, questionController.listQuestions);

// Author / bulk-import questions. Left open (like POST /news) for admin/seed
// tooling and scraped-bank ingestion.
router.post("/", questionController.createQuestions);

router.get("/:id", bearerAuth, questionController.getQuestionById);

module.exports = router;
