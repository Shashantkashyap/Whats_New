const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    password: { type: String, required: true },
    isVerified: { type: Boolean, default: false },
    // Stored hashed (bcrypt); rotated on every refresh.
    refreshToken: { type: String, default: null },

    // Optional profile fields
    firstName: { type: String, trim: true, default: null },
    lastName: { type: String, trim: true, default: null },
    // `sparse` so multiple users may leave username unset without colliding on null.
    username: { type: String, trim: true, unique: true, sparse: true, default: null },
    bio: { type: String, trim: true, default: null },
    avatar: { type: String, trim: true, default: null }, // URL

    // Interests are a small, bounded list read/written as a whole — embedding an
    // array on the user is the natural Mongo model (no separate join table).
    interests: { type: [String], default: [] },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
