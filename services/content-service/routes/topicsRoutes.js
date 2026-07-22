const express = require("express");
const router = express.Router();
const executiveController = require("../controllers/executiveController");
const { bearerAuth } = require("../middleware/auth");

// GET /api/v1/topics/tags — home-page curriculum tags.
router.get("/tags", bearerAuth, executiveController.getTags);

module.exports = router;
