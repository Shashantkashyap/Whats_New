// Composition root — the whole "What's New" backend in one runnable artifact.
//
// It mounts the user-service and content-service Express apps on a single port.
// Their URL namespaces don't overlap (/api/v1/auth, /api/v1/users vs
// /api/v1/news, /api/v1/content, /api/v1/topics), so one process serves both.
//
// Each service connects its OWN mongoose instance (via its own config/db.js) to
// the shared MONGO_URI — this avoids the "multiple mongoose instances" trap
// where a model registered on one instance can't see a connection opened on
// another. Both connections point at the same database; collections are
// distinct (users/otps vs news), so there is no collision.
//
// Config comes from a single .env in the working directory (or use
// `node --env-file=.env dist/whatsnew-backend.cjs`).

require("dotenv").config();

const express = require("express");
const cors = require("cors");

const userApp = require("./services/user-service/app");
const contentApp = require("./services/content-service/app");
const connectUserDB = require("./services/user-service/config/db");
const connectContentDB = require("./services/content-service/config/db");

const app = express();
app.use(cors());

app.get("/health", (req, res) =>
  res.json({ status: "success", data: { ok: true, uptime_s: Math.round(process.uptime()) } })
);

// Mounted apps fall through to the next when they have no matching route.
app.use(userApp);
app.use(contentApp);

const PORT = process.env.PORT || 8080;

(async () => {
  try {
    await connectUserDB();
    await connectContentDB();
    app.listen(PORT, () => console.log(`🚀 What's New backend running on http://localhost:${PORT}`));
  } catch (err) {
    console.error("❌ Startup failed:", err.message);
    process.exit(1);
  }
})();
