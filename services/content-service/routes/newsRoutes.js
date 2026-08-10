const express = require("express");
const router = express.Router();
const newsController = require("../controllers/newsController");
const executiveController = require("../controllers/executiveController");
const swipeController = require("../controllers/swipeController");
const savedNewsController = require("../controllers/savedNewsController");
const challengeController = require("../controllers/challengeController");
const { bearerAuth, optionalBearerAuth } = require("../middleware/auth");

// ============ Daily News (PUBLIC) ============
// JWT is optional: guests get the full feed; a valid bearer personalizes
// (affinity + is_bookmarked). Declared BEFORE "/:id" so literal paths aren't
// swallowed by the id param route.
router.get("/feed", optionalBearerAuth, executiveController.getFeed);
router.get("/swipe-decks", optionalBearerAuth, executiveController.getSwipeDecks);
router.get("/briefs/:id/details", optionalBearerAuth, executiveController.getBriefDetails);

// ============ Saved news (student feature — auth required) ============
router.get("/saved", bearerAuth, savedNewsController.getSavedNews);
router.post("/:id/save", bearerAuth, savedNewsController.saveNews);
router.delete("/:id/save", bearerAuth, savedNewsController.unsaveNews);

// ============ Daily challenge (auth required) ============
router.get("/:id/challenge/status", bearerAuth, challengeController.getChallengeStatus);
router.post("/:id/challenge/answer-mcq", bearerAuth, challengeController.answerMcq);
router.post("/:id/challenge/submit-mcq", bearerAuth, challengeController.submitMcq);
router.post("/:id/mains/submit", bearerAuth, challengeController.submitMains);

// ============ Swipe tracking (personalization — auth required) ============
router.get("/swipe/affinity", bearerAuth, swipeController.getAffinity);
router.post("/swipe", bearerAuth, swipeController.recordSwipe);
router.post("/:id/swipe", bearerAuth, swipeController.recordSwipe);

// ================= CRUD Routes =================
// GET list/detail stay guest-readable (optional JWT); writes are open admin-style.

router.post("/", newsController.createNews);

router.get("/", optionalBearerAuth, newsController.getAllNews);

router.get("/:id", optionalBearerAuth, newsController.getNewsById);

router.put("/:id", newsController.updateNews);

router.delete("/:id", newsController.deleteNews);

module.exports = router;
