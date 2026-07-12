require("dotenv").config();
const express = require("express");
const cookieParser = require("cookie-parser");
const connectDB = require("./config/db");
const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/user");
const { authenticateToken } = require("./middleware/auth");

const app = express();

app.use(express.json());
app.use(cookieParser());

const base = "/api/v1";

// 🔓 Public routes (no token needed)
app.use(`${base}/auth`, authRoutes);

// 🔒 Protected routes (all need a valid access token)
app.use(`${base}/users`, authenticateToken, userRoutes);

const PORT = process.env.PORT || 4001;

connectDB().then(() => {
  app.listen(PORT, () => console.log(`🚀 User Service running on port ${PORT}`));
});
