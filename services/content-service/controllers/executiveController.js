const mongoose = require("mongoose");
const News = require("../models/News");
const Swipe = require("../models/Swipe");
const SavedNews = require("../models/SavedNews");
const ChallengeAttempt = require("../models/ChallengeAttempt");
const { apiOk, apiErr } = require("../utils/apiResponse");
const { CURRICULUM_TAGS, tagsForSlug } = require("../config/curriculum");
const { toFeedItem, toBriefDetail } = require("../utils/newsPresenter");
const { buildDateFilter } = require("../utils/dateRange");
const { computeAffinity, rankByAffinity, sortTagsByAffinity } = require("../utils/personalize");
const { toChallengeProgress } = require("../utils/challengeGrade");

const MAX_LIMIT = 50;
const DECK_LIMIT = 15;

// Priority (exam-critical) first, then swipe-affinity ranking (applied in JS),
// then editorial relevance and recency from the DB sort.
const NEWS_SORT = { isPriority: -1, relevanceScore: -1, publishedAt: -1 };

// Escape user input before embedding it in a RegExp (fuzzy search).
function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Normalize mixed string/ObjectId news ids so Mongo `$nin` and Set lookups agree.
function asObjectIds(ids) {
  const out = [];
  for (const id of ids || []) {
    const s = String(id || "");
    if (mongoose.isValidObjectId(s)) out.push(new mongoose.Types.ObjectId(s));
  }
  return out;
}

// Load a user's swipe history and derive their per-tag affinity. Returns empty
// signal for anonymous/unseen users so every endpoint degrades gracefully.
async function loadAffinity(userId) {
  if (!userId) return { affinity: new Map(), swipedIds: [] };
  // distinct() + string userId keeps exclusion correct even if older rows were
  // written with slightly different ObjectId casting on upsert.
  const [swipes, distinctIds] = await Promise.all([
    Swipe.find({ userId: String(userId) }).select("tags direction").lean(),
    Swipe.distinct("newsId", { userId: String(userId) }),
  ]);
  return { affinity: computeAffinity(swipes), swipedIds: asObjectIds(distinctIds) };
}

// Set of newsIds (as strings) the user has saved, for is_bookmarked marking.
async function loadSavedSet(userId, newsIds) {
  if (!userId || !newsIds.length) return new Set();
  const saved = await SavedNews.find({ userId, newsId: { $in: newsIds } }).select("newsId").lean();
  return new Set(saved.map((s) => String(s.newsId)));
}

// Map newsId → ChallengeAttempt for feed challenge progress (answered MCQs).
async function loadChallengeMap(userId, newsIds) {
  if (!userId || !newsIds.length) return new Map();
  const attempts = await ChallengeAttempt.find({ userId, newsId: { $in: newsIds } })
    .select("newsId selectedAnswers prelimsScore totalQuestions prelimsCompletedAt mains")
    .lean();
  return new Map(attempts.map((a) => [String(a.newsId), a]));
}

// GET /api/v1/topics/tags
// Curriculum tags with a live active_dossiers_count per tag. Ordered priority
// (exam-critical topics) first, then by the caller's swipe affinity; "All"
// stays pinned to the top.
async function getTags(req, res) {
  try {
    const total = await News.estimatedDocumentCount();
    const tags = await Promise.all(
      CURRICULUM_TAGS.map(async (t) => {
        const count = !t.matchTags
          ? total
          : await News.countDocuments({ tags: { $in: t.matchTags } });
        return { id: t.id, slug: t.slug, label: t.label, icon: t.icon, is_priority: !!t.is_priority, active_dossiers_count: count };
      })
    );

    const { affinity } = await loadAffinity(req.user && req.user.id);
    const ordered = sortTagsByAffinity(tags, affinity, tagsForSlug);
    return apiOk(res, { tags: ordered }, { metadata: { personalized: affinity.size > 0 } });
  } catch (err) {
    return apiErr(res, "TAGS_FETCH_FAILED", err.message, 500);
  }
}

// GET /api/v1/news/feed?tag=&query=&page=&limit=&date=&from=&to=&all=
// Filterable by curriculum tag (now correctly matched against News.tags),
// free-text query, and date window. Results are re-ranked by swipe affinity.
async function getFeed(req, res) {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(req.query.limit, 10) || 15));
    const skip = (page - 1) * limit;

    const filter = {};
    const matchTags = tagsForSlug(req.query.tag);
    if (matchTags) filter.tags = { $in: matchTags };

    // Date filter is opt-in for the browse feed (no default day restriction).
    const { filter: dateFilter, applied } = buildDateFilter(req.query);
    Object.assign(filter, dateFilter);

    // ?priority=true surfaces only high-priority (exam-critical) daily news.
    if (/^(1|true|yes)$/i.test(String(req.query.priority || ""))) filter.isPriority = true;

    if (req.query.query) {
      // Partial fuzzy matching across titles, synopses (description/content),
      // tags, and categories, per the spec's search requirements.
      const rx = new RegExp(escapeRegex(req.query.query.trim()), "i");
      filter.$or = [{ title: rx }, { description: rx }, { content: rx }, { tags: rx }, { categories: rx }];
    }

    const now = Date.now();
    // Public endpoint: personalization only kicks in when a token is present.
    const userId = req.user && req.user.id;
    const { affinity } = await loadAffinity(userId);
    const [total, docs] = await Promise.all([
      News.countDocuments(filter),
      News.find(filter).sort(NEWS_SORT).skip(skip).limit(limit).lean(),
    ]);

    // Re-rank the fetched page by affinity so preferred subjects surface first.
    // ponytail: ranks within the page only (not the whole result set); upgrade
    // path = a stored per-user affinity vector applied in the DB sort.
    const ranked = rankByAffinity(docs, affinity);
    const newsIds = ranked.map((d) => d._id);
    const [savedSet, challengeMap] = await Promise.all([
      loadSavedSet(userId, newsIds),
      loadChallengeMap(userId, newsIds),
    ]);
    const feed = ranked.map((doc, i) => {
      const totalMcqs = Array.isArray(doc.mcqs) ? doc.mcqs.length : 0;
      return toFeedItem(doc, skip + i + 1, {
        now,
        bookmarked: savedSet.has(String(doc._id)),
        challenge: toChallengeProgress(challengeMap.get(String(doc._id)), totalMcqs),
      });
    });
    const metadata = {
      total_records: total,
      page,
      limit,
      has_next: skip + docs.length < total,
      date: applied.label,
      personalized: affinity.size > 0,
    };
    return apiOk(res, { feed }, { metadata });
  } catch (err) {
    return apiErr(res, "FEED_FETCH_FAILED", err.message, 500);
  }
}

// GET /api/v1/news/swipe-decks?date=&all=
// Prefers TODAY's news by default (falls back to recent when today is thin),
// hides cards the user already swiped, and orders the rest by swipe affinity.
// Response shape matches GET /news/feed: { feed: [toFeedItem...] }.
async function getSwipeDecks(req, res) {
  try {
    const now = Date.now();
    const userId = req.user && req.user.id;
    const { affinity, swipedIds } = await loadAffinity(userId);
    const swipedSet = new Set(swipedIds.map(String));

    // Default to today; ?date / ?from&to / ?all override.
    const { filter: dateFilter, applied } = buildDateFilter(req.query, { defaultToday: true });
    // $and keeps date + exclusion independent (never overwrite each other).
    const baseFilter = swipedIds.length
      ? { $and: [dateFilter, { _id: { $nin: swipedIds } }] }
      : dateFilter;

    let docs = await News.find(baseFilter)
      .sort(NEWS_SORT)
      .limit(DECK_LIMIT)
      .lean();

    // Belt-and-suspenders: drop any already-swiped ids that slipped past $nin
    // (e.g. legacy string-typed newsId rows).
    docs = docs.filter((d) => !swipedSet.has(String(d._id)));

    // Today (the default) can be thin early in the day — backfill with the most
    // recent unseen cards so the deck is never empty, without ignoring an
    // explicit date/range/all request from the client.
    if (docs.length < DECK_LIMIT && applied.mode === "today") {
      const seen = asObjectIds([...swipedIds, ...docs.map((d) => d._id)]);
      const backfill = await News.find(seen.length ? { _id: { $nin: seen } } : {})
        .sort({ isPriority: -1, publishedAt: -1 })
        .limit(DECK_LIMIT - docs.length)
        .lean();
      docs = docs.concat(backfill.filter((d) => !swipedSet.has(String(d._id))));
    }

    const ranked = rankByAffinity(docs, affinity);
    const newsIds = ranked.map((d) => d._id);
    const [savedSet, challengeMap] = await Promise.all([
      loadSavedSet(userId, newsIds),
      loadChallengeMap(userId, newsIds),
    ]);
    const feed = ranked.map((doc, i) => {
      const totalMcqs = Array.isArray(doc.mcqs) ? doc.mcqs.length : 0;
      return toFeedItem(doc, i + 1, {
        now,
        bookmarked: savedSet.has(String(doc._id)),
        challenge: toChallengeProgress(challengeMap.get(String(doc._id)), totalMcqs),
      });
    });
    return apiOk(res, { feed }, {
      metadata: {
        total_records: feed.length,
        page: 1,
        limit: DECK_LIMIT,
        has_next: false,
        date: applied.label,
        personalized: affinity.size > 0,
        swiped_excluded: swipedIds.length,
      },
    });
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
    const userId = req.user && req.user.id;
    const savedSet = await loadSavedSet(userId, [doc._id]);
    return apiOk(res, toBriefDetail(doc, {
      now: Date.now(),
      bookmarked: savedSet.has(String(doc._id)),
    }));
  } catch (err) {
    return apiErr(res, "BRIEF_FETCH_FAILED", err.message, 500);
  }
}

module.exports = { getTags, getFeed, getSwipeDecks, getBriefDetails };
