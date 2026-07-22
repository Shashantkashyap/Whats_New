const News = require("../models/News");

// ================= CREATE =================
exports.createNews = async (req, res) => {
  try {
    const newsData = req.body;

    // Optional: AI se flowchartNodes generate karke bhej sakte ho
    // newsData.flowchartNodes = await generateFlowchartNodes(newsData.summary);

    const news = new News(newsData);
    await news.save();

    res.status(201).json({ success: true, data: news });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// ================= READ ALL (with filters + date pagination) =================
exports.getAllNews = async (req, res) => {
  try {
    let { page = 1, category, source, keywords, limit = 20, minRating } = req.query;
    page = parseInt(page, 10);
    limit = parseInt(limit, 10);

    // page=1 → today, page=2 → yesterday ...
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() - (page - 1));

    const startOfDay = new Date(targetDate.setHours(0, 0, 0, 0));
    const endOfDay = new Date(targetDate.setHours(23, 59, 59, 999));

    let filter = {
      publishedAt: { $gte: startOfDay, $lte: endOfDay },
    };

    if (category) filter.categories = { $in: category.split(",") };
    if (source) filter.source = source;
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
    const newsList = await News.find(filter)
      .sort({ rating: -1, relevanceScore: -1, publishedAt: -1 })
      .limit(limit);

    res.status(200).json({
      success: true,
      page,
      date: startOfDay.toISOString().split("T")[0],
      count: newsList.length,
      data: newsList,
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

    res.status(200).json({ success: true, data: news });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ================= UPDATE =================
exports.updateNews = async (req, res) => {
  try {
    const news = await News.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!news)
      return res
        .status(404)
        .json({ success: false, message: "News not found" });

    res.status(200).json({ success: true, data: news });
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
