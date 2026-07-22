const mongoose = require("mongoose");
const News = require("../models/News");
const { apiOk, apiErr } = require("../utils/apiResponse");
const { CURRICULUM_TAGS, categoriesForSlug } = require("../config/curriculum");
const { toFeedItem, toDeck, toBriefDetail } = require("../utils/newsPresenter");

const MAX_LIMIT = 50;
const DECK_LIMIT = 15;

// Escape user input before embedding it in a RegExp (fuzzy search).
function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// GET /api/v1/topics/tags
// Curriculum tags with a live active_dossiers_count per category.
async function getTags(req, res) {
  try {
    const total = await News.estimatedDocumentCount();
    const tags = await Promise.all(
      CURRICULUM_TAGS.map(async (t) => {
        let count;
        if (!t.matchCategories) {
          count = total;
        } else {
          count = await News.countDocuments({ categories: { $in: t.matchCategories } });
        }
        return { id: t.id, slug: t.slug, label: t.label, icon: t.icon, active_dossiers_count: count };
      })
    );
    return apiOk(res, { tags });
  } catch (err) {
    return apiErr(res, "TAGS_FETCH_FAILED", err.message, 500);
  }
}

// GET /api/v1/news/feed?tag=&query=&page=&limit=
async function getFeed(req, res) {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(req.query.limit, 10) || 15));
    const skip = (page - 1) * limit;

    const filter = {};
    const categories = categoriesForSlug(req.query.tag);
    if (categories) filter.categories = { $in: categories };

    if (req.query.query) {
      // Partial fuzzy matching across titles, synopses (description/content),
      // and categories, per the spec's search requirements.
      const rx = new RegExp(escapeRegex(req.query.query.trim()), "i");
      filter.$or = [{ title: rx }, { description: rx }, { content: rx }, { categories: rx }];
    }

    const now = Date.now();
    const [total, docs] = await Promise.all([
      News.countDocuments(filter),
      News.find(filter).sort({ relevanceScore: -1, publishedAt: -1 }).skip(skip).limit(limit).lean(),
    ]);

    const feed = docs.map((doc, i) => toFeedItem(doc, skip + i + 1, { now }));
    const metadata = { total_records: total, page, limit, has_next: skip + docs.length < total };
    return apiOk(res, { feed }, { metadata });
  } catch (err) {
    return apiErr(res, "FEED_FETCH_FAILED", err.message, 500);
  }
}

// GET /api/v1/news/swipe-decks
async function getSwipeDecks(req, res) {
  try {
    const now = Date.now();
    const docs = await News.find({})
      .sort({ relevanceScore: -1, publishedAt: -1 })
      .limit(DECK_LIMIT)
      .lean();
    const deck = docs.map((d) => toDeck(d, { now })).filter(Boolean);
    return apiOk(res, { deck });
  } catch (err) {
    return apiErr(res, "DECKS_FETCH_FAILED", err.message, 500);
  }
}

// GET /api/v1/news/briefs/:id/details
async function getBriefDetails(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return apiErr(res, "BRIEF_NOT_FOUND", "No briefing exists for the supplied identifier.", 404);
    }
    const doc = await News.findById(id).lean();
    if (!doc) {
      return apiErr(res, "BRIEF_NOT_FOUND", "No briefing exists for the supplied identifier.", 404);
    }
    return apiOk(res, toBriefDetail(doc, { now: Date.now() }));
  } catch (err) {
    return apiErr(res, "BRIEF_FETCH_FAILED", err.message, 500);
  }
}

module.exports = { getTags, getFeed, getSwipeDecks, getBriefDetails };
