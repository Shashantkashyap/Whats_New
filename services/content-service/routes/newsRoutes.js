const express = require("express");
const router = express.Router();
const newsController = require("../controllers/newsController");
const executiveController = require("../controllers/executiveController");
const { bearerAuth } = require("../middleware/auth");

// ============ Executive Intelligence (front-end suite) ============
// These are declared BEFORE "/:id" so literal paths like "/feed" and
// "/swipe-decks" are not swallowed by the id param route. All require a bearer.
router.get("/feed", bearerAuth, executiveController.getFeed);
router.get("/swipe-decks", bearerAuth, executiveController.getSwipeDecks);
router.get("/briefs/:id/details", bearerAuth, executiveController.getBriefDetails);

// ================= CRUD Routes =================

// Create News
router.post("/", newsController.createNews);

// Get All News (with filters + pagination by date)
router.get("/", newsController.getAllNews);

// Get Single News by ID
router.get("/:id", newsController.getNewsById);

// Update News
router.put("/:id", newsController.updateNews);

// Delete News
router.delete("/:id", newsController.deleteNews);

module.exports = router;
