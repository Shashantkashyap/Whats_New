const express = require("express");
const router = express.Router();
const executiveController = require("../controllers/executiveController");
const { optionalBearerAuth } = require("../middleware/auth");

// GET /api/v1/topics/tags — home-page curriculum tags. Public (part of the
// daily-news dashboard); personalized ordering kicks in when a token is present.
router.get("/tags", optionalBearerAuth, executiveController.getTags);

module.exports = router;
