"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("Otps", "purpose", {
      type: Sequelize.STRING,
      allowNull: false,
      defaultValue: "signup", // ✅ default rakha
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn("Otps", "purpose");
  },
};
