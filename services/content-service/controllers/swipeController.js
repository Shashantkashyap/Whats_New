const mongoose = require("mongoose");
const News = require("../models/News");
const Swipe = require("../models/Swipe");
const { apiOk, apiErr } = require("../utils/apiResponse");
const { computeAffinity } = require("../utils/personalize");

// POST /api/v1/news/:id/swipe   body: { direction: "left" | "right" }
// (also accepts { newsId, direction } on POST /api/v1/news/swipe)
// Records the user's swipe on a card. Idempotent per (user, card): re-swiping
// updates the stored direction instead of duplicating rows. The card's tags are
// snapshotted so the affinity signal is stable over time.
async function recordSwipe(req, res) {
  try {
    const userId = req.user && req.user.id;
    if (!userId) return apiErr(res, "AUTH_TOKEN_MISSING", "Authentication is required to record a swipe.", 401);

    const newsId = req.params.id || req.body.newsId;
    const direction = String(req.body.direction || "").toLowerCase();

    if (!mongoose.isValidObjectId(newsId)) {
      return apiErr(res, "SWIPE_INVALID_CARD", "A valid news card id is required.", 400);
    }
    if (direction !== "left" && direction !== "right") {
      return apiErr(res, "SWIPE_INVALID_DIRECTION", "direction must be 'left' or 'right'.", 400);
    }

    const newsOid = new mongoose.Types.ObjectId(String(newsId));
    const uid = String(userId);
    const news = await News.findById(newsOid).select("tags").lean();
    if (!news) return apiErr(res, "SWIPE_CARD_NOT_FOUND", "No news card exists for the supplied id.", 404);

    // Always persist ObjectId newsId + string userId so swipe-decks `$nin`
    // exclusion matches News._id reliably after either record endpoint.
    const swipe = await Swipe.findOneAndUpdate(
      { userId: uid, newsId: newsOid },
      { $set: { userId: uid, newsId: newsOid, direction, tags: news.tags || [] } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return apiOk(res, {
      id: String(swipe._id),
      news_id: String(newsOid),
      direction: swipe.direction,
      tags: swipe.tags,
    }, { statusCode: 201 });
  } catch (err) {
    return apiErr(res, "SWIPE_RECORD_FAILED", err.message, 500);
  }
}

// GET /api/v1/news/swipe/affinity
// The user's current per-tag affinity (right swipes +1, left -1), sorted
// strongest-first. Useful for debugging and for a "your interests" surface.
async function getAffinity(req, res) {
  try {
    const userId = req.user && req.user.id;
    if (!userId) return apiErr(res, "AUTH_TOKEN_MISSING", "Authentication is required.", 401);

    const swipes = await Swipe.find({ userId: String(userId) }).select("tags direction").lean();
    const affinity = computeAffinity(swipes);
    const tags = [...affinity.entries()]
      .map(([tag, score]) => ({ tag, score }))
      .sort((a, b) => b.score - a.score);

    return apiOk(res, { total_swipes: swipes.length, affinity: tags });
  } catch (err) {
    return apiErr(res, "AFFINITY_FETCH_FAILED", err.message, 500);
  }
}

module.exports = { recordSwipe, getAffinity };
