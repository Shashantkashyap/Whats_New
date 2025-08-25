const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/db");
const User = require("./User");

const Otp = sequelize.define("Otp", {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  code: { type: DataTypes.STRING, allowNull: false },
  expiresAt: { type: DataTypes.DATE, allowNull: false },
purpose: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: "signup", // ✅ default rakha
  },});

User.hasOne(Otp, { foreignKey: "userId", onDelete: "CASCADE" });
Otp.belongsTo(User, { foreignKey: "userId" });

module.exports = Otp;
