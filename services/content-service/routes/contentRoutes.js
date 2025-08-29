const express = require("express");
const { getByTag } = require("../controllers/contentController");

const router = express.Router();

router.get("/", getByTag);

module.exports = router;
