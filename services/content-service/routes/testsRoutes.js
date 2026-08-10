const express = require("express");
const router = express.Router();
const testController = require("../controllers/testController");
const { bearerAuth } = require("../middleware/auth");

// Test engine — student-only, so every route requires a bearer token.
// Modes: subject_wise | topic_wise | mixed. Types: prelims | mains.
router.post("/", bearerAuth, testController.createTest);
router.get("/", bearerAuth, testController.listTests);
router.get("/:id", bearerAuth, testController.getTest);

// Prelims: grade selected options and reveal answers + solutions.
router.post("/:id/submit", bearerAuth, testController.submitTest);

// Mains: upload written answers, then run AI evaluation.
router.post("/:id/answers", bearerAuth, testController.uploadAnswers);
router.post("/:id/evaluate", bearerAuth, testController.evaluateTest);

module.exports = router;
