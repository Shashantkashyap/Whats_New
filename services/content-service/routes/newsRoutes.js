const express = require("express");
const router = express.Router();
const newsController = require("../controllers/newsController");

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
