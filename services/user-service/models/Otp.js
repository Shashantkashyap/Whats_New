const mongoose = require("mongoose");

const otpSchema = new mongoose.Schema(
  {
    code: { type: String, required: true },
    // TTL index: Mongo auto-removes the document once `expiresAt` passes, so
    // stale OTPs clean themselves up. The controllers still verify expiry
    // explicitly (TTL sweeps run on a ~60s interval, not instantly).
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
    purpose: { type: String, required: true, default: "signup" },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Otp", otpSchema);
