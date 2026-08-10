const User = require("../models/User");
const { successResponse, errorResponse } = require("../utils/response");

function publicProfile(user) {
  return {
    id: user.id,
    email: user.email,
    isVerified: user.isVerified,
    firstName: user.firstName || null,
    lastName: user.lastName || null,
    username: user.username || null,
    name: user.name || null,
    bio: user.bio || null,
    avatar: user.avatar || null,
    designation: user.designation || null,
    department: user.department || null,
    cadre: user.cadre || null,
    tier: user.tier || null,
    interests: user.interests || [],
    is_subscription: !!user.is_subscription,
  };
}

// Get full profile
async function getProfile(req, res) {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return errorResponse(res, "User not found", 404);
    return successResponse(res, publicProfile(user));
  } catch (err) {
    return errorResponse(res, err.message, 500);
  }
}

// Plain profile fields that support partial updates (no uniqueness constraint).
const EDITABLE_FIELDS = [
  "firstName", "lastName", "name",
  "bio", "avatar", "designation", "department", "cadre", "tier",
];

// Update profile (partial updates supported)
async function updateProfile(req, res) {
  try {
    const { email, username } = req.body;
    const user = await User.findById(req.user.id);
    if (!user) return errorResponse(res, "User not found", 404);

    // Uniqueness checks for the two unique fields.
    if (email) {
      const exists = await User.findOne({ email });
      if (exists && exists.id !== user.id) return errorResponse(res, "Email already taken", 409);
      user.email = email;
    }
    if (username) {
      const exists = await User.findOne({ username });
      if (exists && exists.id !== user.id) return errorResponse(res, "Username already taken", 409);
      user.username = username;
    }

    for (const f of EDITABLE_FIELDS) {
      if (req.body[f] !== undefined) user[f] = req.body[f];
    }
    if (Array.isArray(req.body.interests)) user.interests = req.body.interests;
    // Subscription state (set by billing in production; editable here for
    // manual/admin/testing flows).
    if (typeof req.body.is_subscription === "boolean") user.is_subscription = req.body.is_subscription;

    await user.save();
    return successResponse(res, publicProfile(user), "Profile updated");
  } catch (err) {
    return errorResponse(res, err.message, 500);
  }
}

// Update interests
async function updateInterests(req, res) {
  try {
    const interests = Array.isArray(req.body.interests) ? req.body.interests : [];
    const user = await User.findByIdAndUpdate(req.user.id, { interests }, { new: true });
    if (!user) return errorResponse(res, "User not found", 404);
    return successResponse(res, user.interests, "Interests updated");
  } catch (err) {
    return errorResponse(res, err.message, 500);
  }
}

// Get interests
async function getInterests(req, res) {
  try {
    const user = await User.findById(req.user.id).select("interests");
    if (!user) return errorResponse(res, "User not found", 404);
    return successResponse(res, user.interests || []);
  } catch (err) {
    return errorResponse(res, err.message, 500);
  }
}

module.exports = {
  getProfile,
  updateProfile,
  updateInterests,
  getInterests,
};
