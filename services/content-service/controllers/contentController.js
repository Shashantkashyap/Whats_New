const Content = require("../models/Content");

exports.getByTag = async (req, res) => {
  try {
    const { tag, limit = 5 } = req.query;
    const query = tag ? { tag } : {};
    const data = await Content.find(query).sort({ createdAt: -1 }).limit(Number(limit));
    res.json({ success: true, count: data.length, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
