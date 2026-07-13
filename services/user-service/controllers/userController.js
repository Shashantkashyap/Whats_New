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
    bio: user.bio || null,
    avatar: user.avatar || null,
    interests: user.interests || [],
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

// Update profile (partial updates supported)
async function updateProfile(req, res) {
  try {
    const { email, firstName, lastName, username, bio, avatar } = req.body;
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

    if (firstName !== undefined) user.firstName = firstName;
    if (lastName !== undefined) user.lastName = lastName;
    if (bio !== undefined) user.bio = bio;
    if (avatar !== undefined) user.avatar = avatar;

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
