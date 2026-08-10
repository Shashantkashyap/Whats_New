const mongoose = require("mongoose");
const News = require("../models/News");
const SavedNews = require("../models/SavedNews");
const { apiOk, apiErr } = require("../utils/apiResponse");
const { toFeedItem } = require("../utils/newsPresenter");

// POST /api/v1/news/:id/save
// Bookmarks a news item for the caller. Idempotent (unique index): saving an
// already-saved item is a no-op success.
async function saveNews(req, res) {
  try {
    const userId = req.user && req.user.id;
    const newsId = req.params.id;
    if (!mongoose.isValidObjectId(newsId)) {
      return apiErr(res, "SAVE_INVALID_NEWS", "A valid news id is required.", 400);
    }
    const exists = await News.exists({ _id: newsId });
    if (!exists) return apiErr(res, "SAVE_NEWS_NOT_FOUND", "No news exists for the supplied id.", 404);

    await SavedNews.updateOne(
      { userId, newsId },
      { $setOnInsert: { userId, newsId } },
      { upsert: true }
    );
    return apiOk(res, { news_id: String(newsId), is_bookmarked: true }, { statusCode: 201 });
  } catch (err) {
    // Duplicate key (raced double-save) is still a success.
    if (err.code === 11000) return apiOk(res, { news_id: String(req.params.id), is_bookmarked: true });
    return apiErr(res, "SAVE_FAILED", err.message, 500);
  }
}

// DELETE /api/v1/news/:id/save
async function unsaveNews(req, res) {
  try {
    const userId = req.user && req.user.id;
    const newsId = req.params.id;
    if (!mongoose.isValidObjectId(newsId)) {
      return apiErr(res, "SAVE_INVALID_NEWS", "A valid news id is required.", 400);
    }
    const result = await SavedNews.deleteOne({ userId, newsId });
    return apiOk(res, { news_id: String(newsId), is_bookmarked: false, removed: result.deletedCount });
  } catch (err) {
    return apiErr(res, "UNSAVE_FAILED", err.message, 500);
  }
}

// GET /api/v1/news/saved?page=&limit=
// The caller's saved news, newest-saved first, projected as feed items.
async function getSavedNews(req, res) {
  try {
    const userId = req.user && req.user.id;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const [total, saved] = await Promise.all([
      SavedNews.countDocuments({ userId }),
      SavedNews.find({ userId }).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    ]);

    const ids = saved.map((s) => s.newsId);
    const docs = await News.find({ _id: { $in: ids } }).lean();
    // Preserve saved-order (News.find does not guarantee $in order).
    const byId = new Map(docs.map((d) => [String(d._id), d]));
    const now = Date.now();
    const items = saved
      .map((s) => byId.get(String(s.newsId)))
      .filter(Boolean)
      .map((doc, i) => toFeedItem(doc, skip + i + 1, { now, bookmarked: true }));

    return apiOk(res, { saved: items }, {
      metadata: { total_records: total, page, limit, has_next: skip + saved.length < total },
    });
  } catch (err) {
    return apiErr(res, "SAVED_FETCH_FAILED", err.message, 500);
  }
}

module.exports = { saveNews, unsaveNews, getSavedNews };
