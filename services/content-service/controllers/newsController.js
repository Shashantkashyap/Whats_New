const News = require("../models/News");
const { buildDateFilter } = require("../utils/dateRange");
const { publicNews, publicNewsList } = require("../utils/publicNews");

// Accept the API-facing `is_priority` alias and map it onto the schema's
// `isPriority` field (leave the request body otherwise untouched).
function mapPriority(body = {}) {
  const out = { ...body };
  if (out.is_priority !== undefined) {
    out.isPriority = !!out.is_priority;
    delete out.is_priority;
  }
  return out;
}

// ================= CREATE =================
exports.createNews = async (req, res) => {
  try {
    const newsData = mapPriority(req.body);

    // Optional: AI se flowchartNodes generate karke bhej sakte ho
    // newsData.flowchartNodes = await generateFlowchartNodes(newsData.summary);

    // Never accept a raw storage URL from clients — only document ids.
    delete newsData.imageUrl;
    const news = new News(newsData);
    await news.save();

    res.status(201).json({ success: true, data: publicNews(news) });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// ================= READ ALL (with filters + date range) =================
// Date behaviour (what the front-end asked for):
//   • default (no params) → TODAY's news only
//   • ?date=YYYY-MM-DD     → that specific day's news
//   • ?all=true            → every day (no date restriction)
//   • ?from=…&to=…         → an explicit inclusive date range
// Pagination is standard skip/limit (page=1&limit=20), independent of the date.
exports.getAllNews = async (req, res) => {
  try {
    let { page = 1, category, source, keywords, limit = 20, minRating, date, from, to, all, priority } = req.query;
    page = Math.max(1, parseInt(page, 10) || 1);
    limit = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (page - 1) * limit;

    // Date window: today by default; ?date / ?from&to / ?all override.
    // Shared with the executive feed/swipe-decks via utils/dateRange.
    const { filter, applied } = buildDateFilter(
      { date, from, to, all },
      { defaultToday: true }
    );

    if (category) filter.categories = { $in: category.split(",") };
    if (source) filter.source = source;
    // ?priority=true surfaces only high-priority (exam-critical) daily news.
    if (/^(1|true|yes)$/i.test(String(priority || ""))) filter.isPriority = true;
    // Aspirant view: only surface content at/above a minimum exam-value rating.
    if (minRating !== undefined && minRating !== "" && !isNaN(minRating)) {
      filter.rating = { $gte: parseInt(minRating, 10) };
    }
    if (keywords) {
      filter.$or = [
        { title: { $regex: keywords, $options: "i" } },
        { content: { $regex: keywords, $options: "i" } },
        { description: { $regex: keywords, $options: "i" } },
      ];
    }

    // Highest exam-value rating first (aspirant view); relevanceScore and
    // recency break ties, so unrated/legacy content still ranks sensibly.
    const [total, newsList] = await Promise.all([
      News.countDocuments(filter),
      News.find(filter)
        // Priority (exam-critical) news first, then exam-value rating, heuristic
        // relevance, and recency.
        .sort({ isPriority: -1, rating: -1, relevanceScore: -1, publishedAt: -1 })
        .skip(skip)
        .limit(limit),
    ]);

    res.status(200).json({
      success: true,
      page,
      limit,
      total,
      hasNext: skip + newsList.length < total,
      date: applied.label,
      count: newsList.length,
      data: publicNewsList(newsList),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ================= READ BY ID =================
exports.getNewsById = async (req, res) => {
  try {
    const news = await News.findById(req.params.id);
    if (!news)
      return res
        .status(404)
        .json({ success: false, message: "News not found" });

    res.status(200).json({ success: true, data: publicNews(news) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ================= UPDATE =================
exports.updateNews = async (req, res) => {
  try {
    const body = mapPriority(req.body);
    delete body.imageUrl;
    const news = await News.findByIdAndUpdate(req.params.id, body, {
      new: true,
      runValidators: true,
    });
    if (!news)
      return res
        .status(404)
        .json({ success: false, message: "News not found" });

    res.status(200).json({ success: true, data: publicNews(news) });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// ================= DELETE =================
exports.deleteNews = async (req, res) => {
  try {
    const news = await News.findByIdAndDelete(req.params.id);
    if (!news)
      return res
        .status(404)
        .json({ success: false, message: "News not found" });

    res
      .status(200)
      .json({ success: true, message: "News deleted successfully" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
