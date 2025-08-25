const express = require("express");
const dotenv = require("dotenv");
const cookieParser = require("cookie-parser");
const { sequelize } = require("./config/db");
const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/user");
const { authenticateToken } = require("./middleware/auth");

dotenv.config();
const app = express();

app.use(express.json());
app.use(cookieParser());

const base = "/api/v1";

// 🔓 Public routes (No token needed)
app.use(`${base}/auth`, authRoutes);

// 🔒 Protected routes (All need token)
app.use(`${base}/users`, authenticateToken, userRoutes);

const PORT = process.env.PORT || 4001;

sequelize.sync().then(() => {
  console.log("Database connected ✅");
  app.listen(PORT, () => console.log(`User Service running on port ${PORT}`));
});
