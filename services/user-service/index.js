require("dotenv").config();
const connectDB = require("./config/db");
const app = require("./app");

const PORT = process.env.PORT || 4001;

connectDB().then(() => {
  app.listen(PORT, () => console.log(`🚀 User Service running on port ${PORT}`));
});
