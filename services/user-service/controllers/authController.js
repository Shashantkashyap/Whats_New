const bcrypt = require("bcrypt");
const User = require("../models/User");
const Otp = require("../models/Otp");
const { sendEmail } = require("../utils/sendEmail");
const { successResponse, errorResponse } = require("../utils/response");
const {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} = require("../utils/tokenfunction");

function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function setCookie(res, user) {
  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);

  // Hash refresh token before saving in DB
  const hashedRefreshToken = await bcrypt.hash(refreshToken, 10);
  await user.update({ refreshToken: hashedRefreshToken });

  res.cookie("accessToken", accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 59 * 60 * 1000, // 15 min
  });

  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });

  return { accessToken, refreshToken }; // return bhi kar raha hu
}

// ---------------- Register ----------------
async function register(req, res) {
  try {
    const { email, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({ email, password: hashedPassword });

    // Delete previous OTPs for this user (signup)
    await Otp.destroy({ where: { userId: user.id, purpose: "signup" } });

    const otpCode = generateOtp();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 mins
    await Otp.create({ code: otpCode, expiresAt, userId: user.id, purpose: "signup" });

    await sendEmail(
      email,
      "Your OTP Code",
      `Your OTP is ${otpCode}`,
      `<h2>Your OTP: ${otpCode}</h2>`
    );

    return successResponse(
      res,
      {},
      "User created. Please verify OTP sent to email.",
      201
    );
  } catch (err) {
    return errorResponse(res, err.message, 400);
  }
}

// ---------------- Verify OTP ----------------
async function verifyOtp(req, res) {
  try {
    const { email, code } = req.body;
    const user = await User.findOne({ where: { email } });
    if (!user) return errorResponse(res, "User not found", 404);

    const otp = await Otp.findOne({ where: { userId: user.id, purpose: "signup" } });
    if (!otp || otp.code !== code || new Date(otp.expiresAt) < new Date()) {
      return errorResponse(res, "Invalid or expired OTP", 400);
    }

    await user.update({ isVerified: true });
    await Otp.destroy({ where: { userId: user.id, purpose: "signup" } });

    const tokens = await setCookie(res, user);
    return successResponse(
      res,
      { id: user.id, email: user.email, ...tokens },
      "Account verified and logged in."
    );
  } catch (err) {
    return errorResponse(res, err.message, 400);
  }
}

// ---------------- Login ----------------
async function login(req, res) {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ where: { email } });
    if (!user) return errorResponse(res, "User not found", 404);
    if (!user.isVerified)
      return errorResponse(res, "Please verify account", 403);

    const match = await bcrypt.compare(password, user.password);
    if (!match) return errorResponse(res, "Invalid password", 401);

    const tokens = await setCookie(res, user);
    return successResponse(
      res,
      { id: user.id, email: user.email, ...tokens },
      "Logged in successfully"
    );
  } catch (err) {
    return errorResponse(res, err.message, 400);
  }
}

// ---------------- Refresh Token ----------------
async function refreshToken(req, res) {
  try {
    const token = req.cookies.refreshToken;
    if (!token) return errorResponse(res, "No refresh token provided", 401);

    const decoded = verifyRefreshToken(token);
    if (!decoded) return errorResponse(res, "Invalid refresh token", 403);

    const user = await User.findByPk(decoded.id);
    if (!user) return errorResponse(res, "User not found", 404);

    // Match hashed refresh token
    const match = await bcrypt.compare(token, user.refreshToken || "");
    if (!match) return errorResponse(res, "Refresh token mismatch", 403);

    // Generate new tokens + rotate refresh token
    const newAccessToken = generateAccessToken(user);
    const newRefreshToken = generateRefreshToken(user);

    const hashedNewRefresh = await bcrypt.hash(newRefreshToken, 10);
    await user.update({ refreshToken: hashedNewRefresh });

    res.cookie("accessToken", newAccessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 15 * 60 * 1000,
    });

    res.cookie("refreshToken", newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return successResponse(
      res,
      "Token refreshed"
    );
  } catch (err) {
    return errorResponse(res, err.message, 500);
  }
}

// ---------------- Logout ----------------
async function logout(req, res) {
  if (req.user) {
    await User.update({ refreshToken: null }, { where: { id: req.user.id } });
  }
  res.clearCookie("accessToken");
  res.clearCookie("refreshToken");
  return successResponse(res, {}, "Logged out");
}

// ---------------- Forgot Password ----------------
async function forgotPassword(req, res) {
  try {
    const { email } = req.body;
    const user = await User.findOne({ where: { email } });
    if (!user) return errorResponse(res, "User not found", 404);

    // Clear old forgot_password OTPs
    await Otp.destroy({ where: { userId: user.id, purpose: "forgot_password" } });

    const otpCode = generateOtp();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await Otp.create({
      code: otpCode,
      expiresAt,
      purpose: "forgot_password",
      userId: user.id,
    });

    await sendEmail(
      email,
      "Password Reset OTP",
      `Your OTP for password reset is ${otpCode}`,
      `<h2>Your OTP: ${otpCode}</h2>`
    );

    return successResponse(res, {}, "OTP sent to your email.");
  } catch (err) {
    return errorResponse(res, err.message, 500);
  }
}

// ---------------- Reset Password ----------------
async function resetPassword(req, res) {
  try {
    const { email, otp, newPassword } = req.body;

    const user = await User.findOne({ where: { email } });
    if (!user) return errorResponse(res, "User not found", 404);

    const otpEntry = await Otp.findOne({
      where: { userId: user.id, purpose: "forgot_password" },
    });

    if (
      !otpEntry ||
      otpEntry.code !== otp ||
      new Date(otpEntry.expiresAt) < new Date()
    ) {
      return errorResponse(res, "Invalid or expired OTP", 400);
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await user.update({ password: hashedPassword });

    await otpEntry.destroy();

    return successResponse(res, {}, "Password reset successful.");
  } catch (err) {
    return errorResponse(res, err.message, 500);
  }
}

module.exports = {
  register,
  verifyOtp,
  login,
  refreshToken,
  logout,
  forgotPassword,
  resetPassword,
};
