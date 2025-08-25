const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/db");

const User = sequelize.define("User", {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  email: { type: DataTypes.STRING, unique: true, allowNull: false },
  password: { type: DataTypes.STRING, allowNull: false },
  isVerified: { type: DataTypes.BOOLEAN, defaultValue: false },
  refreshToken: { type: DataTypes.TEXT, allowNull: true }, // NEW FIELD


  // Optional profile fields
  firstName: { type: DataTypes.STRING, allowNull: true },
  lastName: { type: DataTypes.STRING, allowNull: true },
  username: { type: DataTypes.STRING, allowNull: true, unique: true },
  bio: { type: DataTypes.TEXT, allowNull: true },
  avatar: { type: DataTypes.STRING, allowNull: true }, // URL
  interests: { type: DataTypes.TEXT, allowNull: true }, // JSON string
});

module.exports = User;
