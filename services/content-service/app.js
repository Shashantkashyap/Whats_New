const express = require("express");
const cors = require("cors");

const newsRoutes = require("./routes/newsRoutes");
const contentRoutes = require("./routes/contentRoutes");
const topicsRoutes = require("./routes/topicsRoutes");
const questionsRoutes = require("./routes/questionsRoutes");
const testsRoutes = require("./routes/testsRoutes");
const mediaRoutes = require("./routes/mediaRoutes");
const { mountDocs } = require("./docs/openapi");

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// API docs — Swagger UI at /docs, spec at /openapi.json. Mounted here so it is
// also reachable on the composed server (which mounts this app).
mountDocs(app);

// Routes
app.use("/api/v1/news", newsRoutes);
app.use("/api/v1/media", mediaRoutes);
app.use("/api/v1/content", contentRoutes);
app.use("/api/v1/topics", topicsRoutes);
app.use("/api/v1/questions", questionsRoutes);
app.use("/api/v1/tests", testsRoutes);

module.exports = app;
