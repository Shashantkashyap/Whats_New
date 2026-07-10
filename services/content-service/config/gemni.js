// config/gemini.js
const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Model is env-overridable so a retired name (e.g. the old gemini-1.5-flash,
// which now 404s) can be swapped without a code change. Use `gemini-flash-latest`
// to always track the current flash model.
const geminiModel = genAI.getGenerativeModel({
  model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
});

module.exports = geminiModel;
