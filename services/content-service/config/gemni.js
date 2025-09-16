// config/gemini.js
const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Use the right model (not "gemini-pro")
const geminiModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

console.log("TESTING GEMNI API" , geminiModel)

module.exports = geminiModel;
