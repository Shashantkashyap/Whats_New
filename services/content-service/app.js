const express = require("express");
const contentRoutes = require("./routes/contentRoutes");

const app = express();
app.use(express.json());

app.use("/api/content", contentRoutes);

module.exports = app;
