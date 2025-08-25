const express = require("express");
const {
  getProfile,
  updateProfile,
  updateInterests,
  getInterests,
} = require("../controllers/userController");

const router = express.Router();

// ✅ Ab in routes me middleware ki need nahi hai
router.get("/me", getProfile);
router.put("/me", updateProfile);

router.get("/interests", getInterests);
router.put("/interests", updateInterests);

module.exports = router;
