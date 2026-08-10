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

    // Executive profile metadata surfaced in the login response for the
    // Executive Intelligence front-end (all optional).
    name: { type: String, trim: true, default: null },
    designation: { type: String, trim: true, default: null },
    department: { type: String, trim: true, default: null },
    cadre: { type: String, trim: true, default: null },
    tier: { type: String, trim: true, default: null },

    // Interests are a small, bounded list read/written as a whole — embedding an
    // array on the user is the natural Mongo model (no separate join table).
    interests: { type: [String], default: [] },

    // Distinguishes a paying UPSC subscriber/student from a general news reader.
    // Gates student-only features (tests, practice, saved news) at the product
    // layer; surfaced in the login/profile response as `is_subscription`.
    is_subscription: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Give every user a unique default username. Derived from _id (which Mongoose
// assigns before save and is globally unique) so uniqueness is guaranteed with
// no collision/retry handling. Users can still override it later.
userSchema.pre("save", function (next) {
  if (!this.username) this.username = `user_${this._id}`;
  next();
});

module.exports = mongoose.model("User", userSchema);
