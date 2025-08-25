const { Sequelize } = require("sequelize");
const dotenv = require("dotenv");
dotenv.config();

// Backend runtime DB connection
const sequelize = new Sequelize(
  process.env.DB_NAME, // Database name
  process.env.DB_USER, // DB user
  process.env.DB_PASS, // DB password
  {
    host: process.env.DB_HOST, // Railway host
    port: Number(process.env.DB_PORT), // Railway port
    dialect: "postgres",
    logging: false,
    dialectOptions: {
      ssl: {
        require: true, // Railway requires SSL
        rejectUnauthorized: false,
      },
    },
  }
);

async function connectDB() {
  try {
    await sequelize.authenticate();
    console.log("✅ Connected to Railway Postgres");
  } catch (err) {
    console.error("❌ DB connection failed:", err.message);
  }
}

module.exports = { sequelize, connectDB };
