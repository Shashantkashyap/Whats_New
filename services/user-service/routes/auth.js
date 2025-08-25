const express = require("express");
const {
  register,
  login,
  verifyOtp,
  logout,
} = require("../controllers/authController");

const router = express.Router();

// 🔓 Public routes
router.post("/register", register);
router.post("/verify-otp", verifyOtp);
router.post("/login", login);
router.post("/logout", logout);

module.exports = router;
