const express = require("express");
const cors = require("cors");

const newsRoutes = require("./routes/newsRoutes");
const contentRoutes = require("./routes/contentRoutes");
const topicsRoutes = require("./routes/topicsRoutes");

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use("/api/v1/news", newsRoutes);
app.use("/api/v1/content", contentRoutes);
app.use("/api/v1/topics", topicsRoutes);

module.exports = app;
