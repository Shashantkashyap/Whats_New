const express = require("express");
const router = express.Router();
const mediaController = require("../controllers/mediaController");
const { bearerAuth } = require("../middleware/auth");

// Literal paths before "/:id" so they aren't swallowed by the id param.
router.post("/upload/:testId/:questionId", bearerAuth, mediaController.uploadMedia);
router.post("/ocr-status", bearerAuth, mediaController.ocrStatus);

// Public byte proxy — clients only ever hold a document id, never the storage URL.
router.get("/:id", mediaController.getMedia);

module.exports = router;
