const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Otp = require("../models/Otp");
const { sendEmail } = require("../utils/sendEmail");
const { successResponse, errorResponse, apiOk, apiErr } = require("../utils/response");
const {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} = require("../utils/tokenfunction");

const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const ACCESS_COOKIE_MS = 59 * 60 * 1000;
const REFRESH_COOKIE_MS = 7 * 24 * 60 * 60 * 1000;

function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function cookieOptions(maxAge) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge,
  };
}

// Issue a fresh access+refresh pair, persist the hashed refresh token, and set
// both cookies. Used by verify-otp, login, and refresh (DRY).
async function issueTokens(res, user) {
  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);

  user.refreshToken = await bcrypt.hash(refreshToken, 10);
  await user.save();

  res.cookie("accessToken", accessToken, cookieOptions(ACCESS_COOKIE_MS));
  res.cookie("refreshToken", refreshToken, cookieOptions(REFRESH_COOKIE_MS));
  return { accessToken, refreshToken };
}

// Create (or refresh) a single-purpose OTP for a user and email it.
async function createAndSendOtp(user, purpose, subject) {
  await Otp.deleteMany({ user: user._id, purpose });
  const code = generateOtp();
  await Otp.create({ code, expiresAt: new Date(Date.now() + OTP_TTL_MS), user: user._id, purpose });
  await sendEmail(user.email, subject, `Your OTP is ${code}`, `<h2>Your OTP: ${code}</h2>`);
}

// Fetch a matching, unexpired OTP or return null.
async function findValidOtp(userId, purpose, code) {
  const otp = await Otp.findOne({ user: userId, purpose });
  if (!otp || otp.code !== code || otp.expiresAt < new Date()) return null;
  return otp;
}

// ---------------- Register ----------------
async function register(req, res) {
  try {
    const { email, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({ email, password: hashedPassword });

    await createAndSendOtp(user, "signup", "Your OTP Code");

    return successResponse(res, {}, "User created. Please verify OTP sent to email.", 201);
  } catch (err) {
    return errorResponse(res, err.message, 400);
  }
}

// ---------------- Verify OTP ----------------
async function verifyOtp(req, res) {
  try {
    const { email, code } = req.body;
    const user = await User.findOne({ email });
    if (!user) return errorResponse(res, "User not found", 404);

    const otp = await findValidOtp(user._id, "signup", code);
    if (!otp) return errorResponse(res, "Invalid or expired OTP", 400);

    user.isVerified = true;
    await user.save();
    await Otp.deleteMany({ user: user._id, purpose: "signup" });

    const tokens = await issueTokens(res, user);
    return successResponse(res, { id: user.id, email: user.email, ...tokens }, "Account verified and logged in.");
  } catch (err) {
    return errorResponse(res, err.message, 400);
  }
}

// Executive metadata block returned to the front-end at login.
function executiveProfile(user) {
  return {
    id: user.id,
    name: user.name || [user.firstName, user.lastName].filter(Boolean).join(" ") || null,
    designation: user.designation || null,
    department: user.department || null,
    cadre: user.cadre || null,
    tier: user.tier || null,
    interests: user.interests || [],
  };
}

// ---------------- Login ----------------
// Spec-compliant: returns the session token + executive metadata in the body
// (cookies are still set for the cookie-based flows). Invalid email OR password
// collapse to a single AUTH_INVALID_CREDENTIALS code (also avoids enumeration).
async function login(req, res) {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return apiErr(res, "AUTH_INVALID_CREDENTIALS", "The credentials provided do not match our diplomatic registry.", 401);
    }
    if (!user.isVerified) {
      return apiErr(res, "AUTH_ACCOUNT_UNVERIFIED", "Please verify your account before signing in.", 403);
    }

    const { accessToken } = await issueTokens(res, user);
    const decoded = jwt.decode(accessToken);
    const expires_at = decoded && decoded.exp ? new Date(decoded.exp * 1000).toISOString() : null;

    return apiOk(res, { token: accessToken, expires_at, user: executiveProfile(user) });
  } catch (err) {
    return apiErr(res, "AUTH_LOGIN_FAILED", err.message, 500);
  }
}

// ---------------- Refresh Token ----------------
async function refreshToken(req, res) {
  try {
    const token = req.cookies.refreshToken;
    if (!token) return errorResponse(res, "No refresh token provided", 401);

    const decoded = verifyRefreshToken(token);
    if (!decoded) return errorResponse(res, "Invalid refresh token", 403);

    const user = await User.findById(decoded.id);
    if (!user) return errorResponse(res, "User not found", 404);

    const match = await bcrypt.compare(token, user.refreshToken || "");
    if (!match) return errorResponse(res, "Refresh token mismatch", 403);

    await issueTokens(res, user);
    return successResponse(res, {}, "Token refreshed");
  } catch (err) {
    return errorResponse(res, err.message, 500);
  }
}

// ---------------- Logout ----------------
async function logout(req, res) {
  try {
    if (req.user) await User.findByIdAndUpdate(req.user.id, { refreshToken: null });
    res.clearCookie("accessToken");
    res.clearCookie("refreshToken");
    return successResponse(res, {}, "Logged out");
  } catch (err) {
    return errorResponse(res, err.message, 500);
  }
}

// ---------------- Forgot Password ----------------
async function forgotPassword(req, res) {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user) return errorResponse(res, "User not found", 404);

    await createAndSendOtp(user, "forgot_password", "Password Reset OTP");
    return successResponse(res, {}, "OTP sent to your email.");
  } catch (err) {
    return errorResponse(res, err.message, 500);
  }
}

// ---------------- Reset Password ----------------
async function resetPassword(req, res) {
  try {
    const { email, otp, newPassword } = req.body;

    const user = await User.findOne({ email });
    if (!user) return errorResponse(res, "User not found", 404);

    const otpEntry = await findValidOtp(user._id, "forgot_password", otp);
    if (!otpEntry) return errorResponse(res, "Invalid or expired OTP", 400);

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();
    await otpEntry.deleteOne();

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
