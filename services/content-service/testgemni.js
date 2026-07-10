// testGemini.js
require("dotenv").config();
const genAI = require("@google/generative-ai");

async function testGemini() {
  const { GoogleGenerativeAI } = genAI;
  const client = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

  const model = client.getGenerativeModel({ model: process.env.GEMINI_MODEL || "gemini-2.5-flash" });

  const prompt = "Give me a 2 line summary of Chandrayaan-3 mission in JSON format with keys {summary}";
  
  const result = await model.generateContent(prompt);

  console.log("🔹 Raw response:", result.response.text());
}

testGemini().catch(console.error);
