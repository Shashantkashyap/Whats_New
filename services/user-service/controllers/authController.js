const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Otp = require("../models/Otp");
const { sendEmail } = require("../utils/sendEmail"); // mailer se sendEmail export karna hoga
const { successResponse, errorResponse } = require("../utils/response");

function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function setCookie(res, user) {
  const token = jwt.sign(
    { id: user.id, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: "7d" } // optional: 7 din validity
  );

  res.cookie("token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
  });
}

async function register(req, res) {
  try {
    const { email, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({ email, password: hashedPassword });

    const otpCode = generateOtp();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 mins
    await Otp.create({ code: otpCode, expiresAt, userId: user.id });

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

async function verifyOtp(req, res) {
  try {
    const { email, code } = req.body;
    const user = await User.findOne({ where: { email } });
    if (!user) return errorResponse(res, "User not found", 404);

    const otp = await Otp.findOne({ where: { userId: user.id } });
    if (!otp || otp.code !== code || new Date(otp.expiresAt) < new Date()) {
      return errorResponse(res, "Invalid or expired OTP", 400);
    }

    await user.update({ isVerified: true });
    await otp.destroy();

    setCookie(res, user);
    return successResponse(
      res,
      { id: user.id, email: user.email },
      "Account verified and logged in."
    );
  } catch (err) {
    return errorResponse(res, err.message, 400);
  }
}

async function login(req, res) {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ where: { email } });
    if (!user) return errorResponse(res, "User not found", 404);
    if (!user.isVerified)
      return errorResponse(res, "Please verify account", 403);

    const match = await bcrypt.compare(password, user.password);
    if (!match) return errorResponse(res, "Invalid password", 401);

    setCookie(res, user);
    return successResponse(
      res,
      { id: user.id, email: user.email },
      "Logged in successfully"
    );
  } catch (err) {
    return errorResponse(res, err.message, 400);
  }
}

async function logout(req, res) {
  res.clearCookie("token");
  return successResponse(res, {}, "Logged out");
}

module.exports = {
  register,
  verifyOtp,
  login,
  logout,
};
