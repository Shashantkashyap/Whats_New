const User = require("../models/User");
const { successResponse, errorResponse } = require("../utils/response");

// Get full profile
async function getProfile(req, res) {
  try {
    const user = await User.findByPk(req.user.id);
    if (!user) return errorResponse(res, "User not found", 404);

    return successResponse(res, {
      id: user.id,
      email: user.email,
      isVerified: user.isVerified,
      firstName: user.firstName || null,
      lastName: user.lastName || null,
      username: user.username || null,
      bio: user.bio || null,
      avatar: user.avatar || null,
      interests: JSON.parse(user.interests || "[]"),
    });
  } catch (err) {
    return errorResponse(res, err.message, 500);
  }
}

// Update profile (partial updates supported)
async function updateProfile(req, res) {
  try {
    const { email, firstName, lastName, username, bio, avatar } = req.body;
    const user = await User.findByPk(req.user.id);
    if (!user) return errorResponse(res, "User not found", 404);

    // Email uniqueness check
    if (email) {
      const exists = await User.findOne({ where: { email } });
      if (exists && exists.id !== user.id)
        return errorResponse(res, "Email already taken", 409);
      user.email = email;
    }

    // Username uniqueness check
    if (username) {
      const exists = await User.findOne({ where: { username } });
      if (exists && exists.id !== user.id)
        return errorResponse(res, "Username already taken", 409);
      user.username = username;
    }

    // Update optional fields
    if (firstName !== undefined) user.firstName = firstName;
    if (lastName !== undefined) user.lastName = lastName;
    if (bio !== undefined) user.bio = bio;
    if (avatar !== undefined) user.avatar = avatar;

    await user.save();
    return successResponse(
      res,
      {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        username: user.username,
        bio: user.bio,
        avatar: user.avatar,
      },
      "Profile updated"
    );
  } catch (err) {
    return errorResponse(res, err.message, 500);
  }
}

// Update interests separately
async function updateInterests(req, res) {
  try {
    const { interests } = req.body;
    const user = await User.findByPk(req.user.id);
    if (!user) return errorResponse(res, "User not found", 404);

    user.interests = JSON.stringify(interests || []);
    await user.save();

    return successResponse(res, interests || [], "Interests updated");
  } catch (err) {
    return errorResponse(res, err.message, 500);
  }
}

// Get interests
async function getInterests(req, res) {
  try {
    const user = await User.findByPk(req.user.id);
    if (!user) return errorResponse(res, "User not found", 404);

    return successResponse(res, JSON.parse(user.interests || "[]"));
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
