const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/db");
const User = require("./User");

const Interest = sequelize.define("Interest", {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  category: { type: DataTypes.STRING, allowNull: false }, // e.g. "AI", "Frontend"
});

User.hasMany(Interest, { foreignKey: "userId" });
Interest.belongsTo(User, { foreignKey: "userId" });

module.exports = Interest;
