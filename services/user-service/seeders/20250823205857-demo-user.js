module.exports = {
  async up(queryInterface) {
    await queryInterface.bulkInsert("Users", [
      {
        email: "demo@example.com",
        password: "hashedpassword", // real me bcrypt use karna
        isVerified: true,
        interests: JSON.stringify(["AI", "DevOps"]),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("Users", null, {});
  },
};
