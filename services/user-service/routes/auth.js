const express = require("express");
const {
  register,
  login,
  verifyOtp,
  logout,
  forgotPassword,
  resetPassword,
  refreshToken,
} = require("../controllers/authController");

const router = express.Router();

// 🔓 Public routes
router.post("/register", register);
router.post("/verify-otp", verifyOtp);
router.post("/login", login);
router.post("/logout", logout);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);
router.post("/refresh-token", refreshToken);

module.exports = router;
