/**
 * contentPipeline.js - COMPLETE OPTIMIZED VERSION
 *
 * Full, detailed, production-ready UPSC content pipeline integrated with Gemini.
 * SCHEMA OPTIMIZED FIXES:
 * - Summary expanded to 8-10 points (200 words) 
 * - Direct bullet points without "Bullet 1:" prefix
 * - Better "why" context with real scenarios
 * - Fixed flowchart nodes structure matching schema exactly
 * - All fields properly mapped to News schema
 *
 * Usage:
 *  const { runContentPipeline, testGeminiConnection } = require("./pipeline/contentPipeline");
 *  runContentPipeline("dev"); // or "prod"
 */

const geminiModel = require("../config/gemni"); // make sure this file exports the generative model
const News = require("../models/News"); // your mongoose model (ensure schema matches fields below)
const fs = require("fs");
const path = require("path");

// -------------------------
// 🎯 Enhanced Tags with Priority Levels
// -------------------------
const tagsConfig = {
  high: [
    "Polity",
    "Economy",
    "IR",
    "Environment",
    "Science & Tech",
    "Internal Security",
    "Governance",
    "Ethics",
  ],
  medium: [
    "Social Issues",
    "Health",
    "Education",
    "Agriculture",
    "Infrastructure",
    "Energy",
    "Climate Change",
  ],
  low: [
    "Transport",
    "Technology",
    "Cybersecurity",
    "Culture",
    "Disaster Management",
    "Legal Affairs",
    "Judiciary",
    "Finance",
    "Trade",
    "Public Administration",
    "Innovation",
  ],
};

const allTags = [...tagsConfig.high, ...tagsConfig.medium, ...tagsConfig.low];

// -------------------------
// 🔧 SCHEMA-OPTIMIZED Data Normalizer
// -------------------------
function normalizeGeminiOutput(data) {
  console.log("🔹 Normalizing Gemini output:", data);
  
  return {
    ...data,
    
    // Generate flowchart string from nodes if not present
    flowchart: data.flowchart || (Array.isArray(data.flowchartNodes) 
      ? data.flowchartNodes.map(node => node.label).join(" → ") 
      : "Background → Current Issue → Government Response → Impact → Future"),
    
    // FIXED: Proper flowchart nodes structure matching schema exactly
    flowchartNodes: Array.isArray(data.flowchartNodes) 
      ? data.flowchartNodes.map((node, index) => ({
          id: node.id || `step${index + 1}`,
          label: node.label || `Step ${index + 1}`,
          // CRITICAL FIX: Ensure content field is always present
          content: node.content || `Content for ${node.label || `Step ${index + 1}`}`,
          connections: Array.isArray(node.connections) ? node.connections : []
        })) 
      : [
          { 
            id: "step1", 
            label: "Background/Context", 
            content: "Historical context and background information leading to current developments",
            connections: ["step2"] 
          },
          { 
            id: "step2", 
            label: "Current Development", 
            content: "Recent events and developments that have brought this issue to prominence",
            connections: ["step3"] 
          },
          { 
            id: "step3", 
            label: "Government Response", 
            content: "Official government actions, policies, and statements addressing the issue",
            connections: ["step4"] 
          },
          { 
            id: "step4", 
            label: "Stakeholders Impact", 
            content: "Analysis of how different stakeholders are affected by these developments",
            connections: ["step5"] 
          },
          { 
            id: "step5", 
            label: "Future Implications", 
            content: "Long-term consequences and future outlook for this issue",
            connections: [] 
          }
        ],
    
    // FIXED: examRelevance as array of strings (matching schema)
    examRelevance: Array.isArray(data.examRelevance) 
      ? data.examRelevance 
      : typeof data.examRelevance === 'object' && data.examRelevance 
        ? [`Prelims: ${data.examRelevance.prelims || 'Current Affairs'}`, `Mains: ${data.examRelevance.mains || 'GS Paper'}`] 
        : ["GS-II: Current Affairs", "Prelims: General Studies"],
    
    // FIXED: MCQs structure matching schema exactly  
    mcqs: (data.mcqs || []).map(mcq => ({
      question: mcq.question || "",
      options: Array.isArray(mcq.options) 
        ? mcq.options 
        : (mcq.options && typeof mcq.options === 'object') 
          ? Object.values(mcq.options) 
          : [],
      answer: mcq.answer || ""
    })),
    
    // FIXED: Clean summary points without prefixes (8-10 points)
    summary: Array.isArray(data.summary) 
      ? data.summary.map(point => {
          // Remove "Bullet 1:", "Point 1:", etc. prefixes
          return point.replace(/^(Bullet|Point)\s*\d+:\s*/i, '').trim();
        }) 
      : [],
    
    // FIXED: mainsQuestion structure matching schema
    mainsQuestion: {
      question: data.mainsQuestion?.question || "",
      hints: Array.isArray(data.mainsQuestion?.hints) ? data.mainsQuestion.hints : []
    },
    
    // Ensure why field is present
    why: data.why || "Context and significance of this development for UPSC preparation"
  };
}

// -------------------------
// 🔥 Smart Relevance Calculator
// -------------------------
// Returns integer 0..10
function calculateRelevanceScore(newsItem) {
  let score = 0;

  // Tag-based weight
  if (Array.isArray(newsItem.tags)) {
    newsItem.tags.forEach((tag) => {
      if (tagsConfig.high.includes(tag)) score += 3;
      else if (tagsConfig.medium.includes(tag)) score += 2;
      else if (tagsConfig.low.includes(tag)) score += 1;
    });
  }

  // Recency
  try {
    const published = new Date(newsItem.publishedAt).getTime();
    if (!isNaN(published)) {
      const daysSincePublish = Math.floor(
        (Date.now() - published) / (1000 * 60 * 60 * 24)
      );
      if (daysSincePublish <= 1) score += 3;
      else if (daysSincePublish <= 3) score += 2;
      else if (daysSincePublish <= 7) score += 1;
    }
  } catch (e) {
    // ignore
  }

  // Source credibility
  const premiumSources = [
    "The Hindu",
    "Indian Express",
    "PIB",
    "Economic Times",
    "Livemint",
    "Business Standard",
  ];
  if (premiumSources.includes(newsItem.source)) score += 2;

  return Math.min(Math.max(Math.round(score), 0), 10);
}

// -------------------------
// 🧹 JSON Sanitizer helpers
// -------------------------
// These functions aim to extract and clean JSON returned by Gemini which may be wrapped
// in markdown fences or contain trailing commas, commentary lines, or extra text.
function removeCodeFences(text) {
  // remove ```json ... ``` or ``` ... ```
  return text.replace(/```json\n?/gi, "").replace(/```/g, "").trim();
}

function removeTrailingCommas(text) {
  // remove trailing commas before ] or }
  return text.replace(/,\s*(\]|\})/g, "$1");
}

function extractJsonLike(text) {
  // find the first {...} or [...]
  const match = text.match(/(\{[\s\S]*\})|(\[[\s\S]*\])/);
  if (match) return match[0];
  return text;
}

function sanitizeJSON(text) {
  if (!text || typeof text !== "string") return text;
  let t = text.trim();
  t = removeCodeFences(t);
  t = removeTrailingCommas(t);
  t = extractJsonLike(t);
  return t;
}

// Safe parse with detailed error info
function safeJsonParse(text) {
  try {
    const cleaned = sanitizeJSON(text);
    return JSON.parse(cleaned);
  } catch (err) {
    // Throw with original + cleaned text to help debugging upstream
    const e = new Error(
      `JSON parse failed: ${err.message}`
    );
    e.raw = text;
    e.cleaned = sanitizeJSON(text);
    throw e;
  }
}

// Persist raw responses for debugging (optional)
// Writes to ./logs/gemini-raw-<timestamp>.txt
function dumpRawResponse(tag, text) {
  try {
    const logsDir = path.join(process.cwd(), "logs");
    if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir);
    const filename = path.join(
      logsDir,
      `gemini-${tag}-${Date.now()}.txt`
    );
    fs.writeFileSync(filename, text, "utf8");
    return filename;
  } catch (e) {
    // ignore logging errors
    return null;
  }
}

// -------------------------
// 🧠 SCHEMA-OPTIMIZED Gemini prompt builder
// -------------------------
function buildGeminiContentPrompt(newsItem) {
  // Escape quotes in title
  const safeTitle = String(newsItem.title || "").replace(/"/g, '\\"');

  return `
You are an expert UPSC content curator for Indian Civil Services aspirants. Produce a single, valid JSON object (no extra text, no markdown fences) in exact structure described below. Do NOT include commentary or anything outside JSON.

INPUT:
- Title: "${safeTitle}"
- Source: "${newsItem.source || "Unknown"}"
- PublishedAt: "${newsItem.publishedAt || new Date().toISOString()}"
- Tags: ${JSON.stringify(newsItem.tags || [])}

OUTPUT (exact JSON schema):
{
  "headline": "A concise, exam-focused headline (max 80 chars)",
  "why": "Explain the current controversy, issue, or significance with real context and scenarios. Example: 'Recent controversial statements by public figures have raised questions about the balance between free speech and responsible discourse, highlighting the ongoing debate around Article 19(1)(a) limitations.' Be specific about the actual scenario, controversy, or underlying issue that makes this news significant.",
  "summary": [
    "Key factual point about the main development with specific details and numbers",
    "Government or institutional response and official statements issued",
    "Constitutional or legal framework involved, citing specific articles or acts", 
    "Impact on different stakeholders, communities, and affected parties",
    "Economic implications, budget allocations, or financial aspects if applicable",
    "International perspective, comparisons with global practices, or diplomatic angles",
    "Historical context, previous similar cases, or precedents set",
    "Implementation challenges, ground realities, and practical difficulties",
    "Future roadmap, expected timeline, and upcoming milestones",
    "Exam relevance highlighting probable question areas and PYQ connections"
  ],
  "flowchartNodes": [
    {
      "id": "step1",
      "label": "Background/Historical Context",
      "content": "Provide 2-3 sentences explaining the background or historical context of the issue, including any relevant past events or policies that have led to the current situation.",
      "connections": ["step2"]
    },
    {
      "id": "step2", 
      "label": "Current Development/Trigger Event",
      "content": "Describe the recent event or development that has brought this issue to the forefront, including key facts, dates, and figures.",
      "connections": ["step3"]
    },
    {
      "id": "step3",
      "label": "Government Response/Policy Action",
      "content": "Detail the government's response, including any new policies, laws, or actions taken to address the issue, along with official statements or positions.",
      "connections": ["step4"]
    },
    {
      "id": "step4",
      "label": "Stakeholders and Impact Analysis",
      "content": "Analyze the impact of the issue and government actions on various stakeholders, including affected communities, economic sectors, and political entities.",
      "connections": ["step5"]
    },
    {
      "id": "step5",
      "label": "Future Implications and Way Forward",
      "content": "Discuss the potential future implications of the issue and government actions, including challenges in implementation, expected outcomes, and areas for further attention.",
      "connections": []
    }
  ],
  "examRelevance": [
    "GS-II: Polity and Constitution - specific syllabus topic",
    "GS-III: Economy/Science/Security - as applicable", 
    "Prelims: Current Affairs and Static GK connections"
  ],
  "mcqs": [
    {
      "question": "MCQ question text related to the news with factual focus",
      "options": ["Option A with specific detail", "Option B with specific detail", "Option C with specific detail", "Option D with specific detail"],
      "answer": "Option A with specific detail"
    },
    {
      "question": "Second MCQ focusing on different aspect of the news", 
      "options": ["Choice A", "Choice B", "Choice C", "Choice D"],
      "answer": "Choice B"
    }
  ],
  "mainsQuestion": {
    "question": "A mains-level analytical question (150-250 words) that requires critical thinking and multi-dimensional analysis of the issue",
    "hints": [
      "Constitutional perspective and fundamental rights implications",
      "Policy analysis, implementation challenges, and governance aspects", 
      "Social, economic, and ethical implications with stakeholder analysis"
    ]
  }
}

GUIDELINES:
- Use official names of Acts, schemes, ministries, and government programs (if applicable).
- Provide specific numbers, percentages, dates, and quantifiable data where available.
- Keep language formal and exam-appropriate with proper terminology.
- Return only valid JSON; if you cannot find a fact, do not invent numbers or details.
- Summary should have exactly 8-10 comprehensive points covering all aspects (~200 words total).
- Each summary point should be direct without "Bullet 1:" or "Point:" prefixes.
- FlowchartNodes must have id, label, content, and connections. Content should be 2-3 sentences explaining that step in detail.
- examRelevance should be array of strings specifying exact GS papers and topics.
- MCQs should have exactly 4 options in array format and answer should match one option exactly.
- Why field should explain the real controversy/context/significance, not just repeat the headline.
- mainsQuestion should be analytical and require multi-dimensional thinking.
  `;
}

// -------------------------
// 🚀 Gemini generate with retry + sanitization
// -------------------------
async function generateWithGemini(prompt, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      // Call Gemini generative model (gemni configured model instance)
      const result = await geminiModel.generateContent({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          topK: 1,
          topP: 0.8,
          maxOutputTokens: 2048,
        },
      });

      // result.response.text() returns the text body
      const raw = result.response.text();

      // quick sanity: if empty, throw
      if (!raw || raw.trim().length === 0) {
        throw new Error("Empty response from Gemini");
      }

      // Sanitize and parse safely
      try {
        const parsed = safeJsonParse(raw);
        return parsed;
      } catch (parseErr) {
        // Dump raw for debugging
        const dumpPath = dumpRawResponse("parse-fail", raw);
        // Augment error message to include dump path if available
        const enrichedMsg = `${parseErr.message}${dumpPath ? ` (raw dumped: ${dumpPath})` : ""}`;
        throw new Error(enrichedMsg);
      }

    } catch (err) {
      console.log(`⚠️ Attempt ${attempt} failed: ${err.message}`);

      // If last attempt, bubble up
      if (attempt === retries) {
        throw new Error(`Gemini generation failed after ${retries} attempts: ${err.message}`);
      }

      // Exponential backoff before retry
      const delayMs = Math.pow(2, attempt) * 1000;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

// -------------------------
// 🔄 SCHEMA-OPTIMIZED Batch Content Processing
// -------------------------
async function generateAndStoreContent(filteredNews, options = {}) {
  // options: { rateLimitMs }
  const rateLimitMs = options.rateLimitMs || 1500;

  const results = {
    processed: 0,
    created: 0,
    updated: 0,
    failed: 0,
    errors: [],
  };

  for (const [index, newsItem] of filteredNews.entries()) {
    console.log(`\n📝 Processing ${index + 1}/${filteredNews.length}: ${newsItem.title}`);

    try {
      // Check if exists by title or url
      const existing = await News.findOne({
        $or: [{ title: newsItem.title }, { url: newsItem.url }],
      });

      const relevance = calculateRelevanceScore(newsItem);

      if (existing) {
        // Update only metadata & relevance
        existing.relevanceScore = Math.max(existing.relevanceScore || 0, relevance);
        existing.updatedAt = new Date();
        await existing.save();

        results.updated++;
        results.processed++;
        console.log(`🔄 Updated existing: ${existing.title}`);
        // continue to next
        await new Promise((r) => setTimeout(r, rateLimitMs));
        continue;
      }

      // Generate content with Gemini
      console.log(`🧠 Generating content with Gemini...`);
      const prompt = buildGeminiContentPrompt(newsItem);
      let rawContent = await generateWithGemini(prompt, 3);
      
      // Debug log
      console.log(`📄 Raw Gemini response sample:`, JSON.stringify(rawContent).substring(0, 200) + '...');
      
      let content = normalizeGeminiOutput(rawContent);
      
      // Debug flowchart nodes
      console.log(`🔗 FlowchartNodes count: ${content.flowchartNodes?.length || 0}`);
      if (content.flowchartNodes && content.flowchartNodes.length > 0) {
        console.log(`🔗 First node:`, JSON.stringify(content.flowchartNodes[0]));
      }

      // Validate required fields according to schema
      if (!content.headline || !Array.isArray(content.summary) || content.summary.length < 8) {
        // dump raw for debugging
        results.failed++;
        const msg = `Generated content missing required fields or insufficient summary points (need 8-10, got ${content.summary?.length || 0})`;
        results.errors.push({ title: newsItem.title, error: msg });
        console.error(`❌ ${msg} for: ${newsItem.title}`);
        // still wait
        await new Promise((r) => setTimeout(r, rateLimitMs));
        continue;
      }

      // Build news doc - SCHEMA PERFECTLY MATCHED
      const newsDoc = new News({
        // Basic required fields
        title: content.headline || newsItem.title,
        description: content.why || content.headline || newsItem.title,
        content: Array.isArray(content.summary) ? content.summary.join("\n") : content.summary || newsItem.content || "",
        url: newsItem.url,
        source: newsItem.source || "Unknown",
        author: newsItem.author || "News Desk",
        publishedAt: newsItem.publishedAt ? new Date(newsItem.publishedAt) : new Date(),
        
        // UPSC-specific fields matching exact schema structure
        why: content.why || "",
        summary: content.summary || [], // Array of strings (8-10 points)
        flowchart: content.flowchart || "", // String
        flowchartNodes: content.flowchartNodes || [], // Array with id, label, connections
        examRelevance: content.examRelevance || [], // Array of strings
        mcqs: content.mcqs || [], // Array with question, options[], answer
        mainsQuestion: content.mainsQuestion || { question: "", hints: [] },
        
        // Generic fields
        tags: newsItem.tags || [],
        categories: newsItem.categories || ["UPSC", "Current Affairs"],
        relevanceScore: relevance,
        
        // Timestamps handled by schema automatically via timestamps: true
      });

      await newsDoc.save();

      results.created++;
      results.processed++;
      console.log(`✅ Created: ${newsDoc.title} (${newsDoc.summary.length} points)`);

      // rate limit sleep
      await new Promise((r) => setTimeout(r, rateLimitMs));
    } catch (err) {
      results.failed++;
      results.processed++;
      const errMsg = err?.message || String(err);
      results.errors.push({ title: newsItem.title || "unknown", error: errMsg });
      console.error(`❌ Failed processing: ${newsItem.title} -> ${errMsg}`);
      // ensure small delay before continuing
      await new Promise((r) => setTimeout(r, 1200));
    }
  }

  return results;
}

// -------------------------
// 📡 Direct Top 5 News Fetcher (Prod)
// -------------------------
// Note: we restrict to 5 items as requested to simplify parsing & reduce quota usage.
async function fetchTop5News_Prod() {
  const today = new Date().toISOString().split("T")[0];

  const prompt = `
You are India's leading UPSC news curator. Today's date: ${today}.
Return EXACTLY 5 UPSC-relevant news items from the last 48 hours as a JSON array ONLY.

Each item must include:
- title (string)
- url (string)
- source (string)
- publishedAt (ISO 8601 string)
- tags (array of strings)
- content (2-3 sentence factual summary)

Output format EXAMPLE:
[
  {
    "title": "Precise headline",
    "url": "https://source-link",
    "source": "Reliable Source",
    "publishedAt": "2025-09-13T08:30:00Z",
    "tags": ["Polity", "Economy"],
    "content": "Short factual summary"
  }
]

Constraints:
- Use only reliable sources (PIB, The Hindu, Indian Express, ET, Livemint).
- Avoid opinion pieces, entertainment, sports.
- Output strictly JSON array and nothing else.
  `;

  try {
    const parsed = await generateWithGemini(prompt, 3);
    // generateWithGemini returns a JSON value - ensure it's an array
    if (Array.isArray(parsed)) return parsed.slice(0, 5);
    // Sometimes model wraps under a key like { news: [...] }
    if (parsed && Array.isArray(parsed.news)) return parsed.news.slice(0, 5);
    // If parsed is object with numeric keys, try to coerce
    if (parsed && typeof parsed === "object") {
      // try to find first array value
      const arr = Object.values(parsed).find((v) => Array.isArray(v));
      if (arr) return arr.slice(0, 5);
    }
    // If nothing, return empty
    console.warn("⚠️ fetchTop5News_Prod: unexpected response shape, returning empty.");
    return [];
  } catch (err) {
    console.error("❌ Production news fetch failed:", err.message);
    return [];
  }
}

// -------------------------
// 🛠️ Development Mode (sample) - SCHEMA COMPATIBLE
// -------------------------
async function fetchTop5News_Dev() {
  return [
    {
      title: "Supreme Court upholds Right to Privacy in Aadhaar linking case",
      url: "https://example.com/sc-privacy-aadhaar",
      source: "The Hindu",
      publishedAt: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
      tags: ["Polity", "Legal Affairs", "Ethics"],
      content:
        "The Supreme Court delivered a landmark judgment protecting citizens' privacy rights while allowing voluntary Aadhaar linking for government services.",
    },
    {
      title: "Budget 2024: Government allocates ₹1.5 lakh crore for green energy transition",
      url: "https://example.com/budget-green-energy",
      source: "Economic Times",
      publishedAt: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
      tags: ["Economy", "Environment", "Energy", "Governance"],
      content:
        "Finance Ministry announces green energy allocation including solar manufacturing incentives and carbon credit trading mechanisms.",
    },
    {
      title: "India-UAE CEPA expands trade scope to digital services and renewables",
      url: "https://example.com/india-uae-cepa",
      source: "PIB",
      publishedAt: new Date(Date.now() - 18 * 60 * 60 * 1000).toISOString(),
      tags: ["IR", "Economy", "Trade"],
      content:
        "The CEPA framework now includes digital services, pharmaceuticals, and renewable energy technology transfer between both nations.",
    },
    {
      title: "National Education Policy 2024: Focus on AI and digital literacy",
      url: "https://example.com/nep-2024-ai",
      source: "Indian Express",
      publishedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      tags: ["Education", "Technology", "Social Issues"],
      content:
        "Education Ministry unveils updated NEP guidelines emphasizing AI literacy and digital skills from primary education onwards.",
    },
    {
      title: "New coastal regulation policy updates fisheries & environment balance",
      url: "https://example.com/coastal-policy",
      source: "The Hindu",
      publishedAt: new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString(),
      tags: ["Environment", "Economy", "Governance"],
      content: "Policy updates aim to balance coastal development and marine ecology protection with enhanced stakeholder consultation mechanisms.",
    },
  ];
}

// -------------------------
// 🚀 Main Pipeline Runner - COMPLETE
// -------------------------
async function runContentPipeline(mode = "dev") {
  console.log(`\n🚀 Starting UPSC Content Pipeline [mode=${mode}] at ${new Date().toLocaleString()}`);

  try {
    // Step 1: Fetch news
    console.log("\n🔍 STEP 1: Fetching news items...");
    const fetched = mode === "prod" ? await fetchTop5News_Prod() : await fetchTop5News_Dev();

    if (!Array.isArray(fetched) || fetched.length === 0) {
      throw new Error("No news items fetched from source");
    }

    console.log(`✅ Fetched ${fetched.length} news items.`);

    // Step 2: Generate & store content
    console.log("\n🎯 STEP 2: Generating & storing content with Gemini...");
    const results = await generateAndStoreContent(fetched, { rateLimitMs: 1500 });

    console.log("\n📊 PIPELINE SUMMARY:");
    console.log(`   Processed: ${results.processed}`);
    console.log(`   Created:   ${results.created}`);
    console.log(`   Updated:   ${results.updated}`);
    console.log(`   Failed:    ${results.failed}`);

    if (results.errors && results.errors.length) {
      console.log("\n⚠️ Errors:");
      results.errors.forEach((e, i) => {
        console.log(`  ${i + 1}. ${e.title} -> ${e.error}`);
      });
    }

    return { success: true, results };
  } catch (err) {
    console.error("\n💥 PIPELINE FAILED:", err.message);
    return { success: false, error: err.message };
  }
}

// -------------------------
// 📊 Analytics & Utilities
// -------------------------
async function getContentAnalytics() {
  try {
    const total = await News.countDocuments();
    const last24 = await News.countDocuments({
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    });

    const tagDistribution = await News.aggregate([
      { $unwind: "$tags" },
      { $group: { _id: "$tags", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]);

    const avgScoreRes = await News.aggregate([{ $group: { _id: null, avgScore: { $avg: "$relevanceScore" } } }]);

    const summaryStats = await News.aggregate([
      { $project: { summaryLength: { $size: { $ifNull: ["$summary", []] } } } },
      { $group: { _id: null, avgSummaryLength: { $avg: "$summaryLength" }, minLength: { $min: "$summaryLength" }, maxLength: { $max: "$summaryLength" } } }
    ]);

    return {
      totalContent: total,
      todayContent: last24,
      topTags: tagDistribution,
      avgRelevanceScore: avgScoreRes[0]?.avgScore || 0,
      summaryStats: summaryStats[0] || { avgSummaryLength: 0, minLength: 0, maxLength: 0 }
    };
  } catch (err) {
    console.error("Analytics failed:", err.message);
    return { totalContent: 0, todayContent: 0, topTags: [], avgRelevanceScore: 0, summaryStats: { avgSummaryLength: 0, minLength: 0, maxLength: 0 } };
  }
}

// -------------------------
// 🔄 Gemini Connection Test
// -------------------------
async function testGeminiConnection() {
  console.log("🔄 Testing Gemini API connection...");

  const testPrompt = `
You are testing the Gemini API. Return strictly this JSON (no extra text/markdown):

{
  "status": "success",
  "message": "Gemini API connection successful",
  "timestamp": "${new Date().toISOString()}",
  "model": "${geminiModel?.model || "unknown-model"}"
}
`;

  try {
    const raw = await generateWithGemini(testPrompt, 2);
    // raw should already be parsed JSON by generateWithGemini
    if (raw && raw.status === "success") {
      console.log("✅ Gemini connection OK:", raw.message, raw.model);
      return true;
    } else {
      console.warn("⚠️ Gemini returned unexpected shape:", raw);
      return true; // API reachable, but content unexpected
    }
  } catch (err) {
    console.error("❌ Gemini connection failed:", err.message);
    return false;
  }
}

// -------------------------
// 🧪 Schema Validation Helper
// -------------------------
function validateNewsSchema(newsData) {
  const errors = [];
  
  // Check required fields
  if (!newsData.title?.trim()) errors.push("Title is required");
  if (!newsData.description?.trim()) errors.push("Description is required");
  if (!newsData.content?.trim()) errors.push("Content is required");
  
  // Check UPSC-specific fields
  if (!Array.isArray(newsData.summary) || newsData.summary.length < 8) {
    errors.push(`Summary must have 8-10 points, got ${newsData.summary?.length || 0}`);
  }
  
  if (!Array.isArray(newsData.flowchartNodes) || newsData.flowchartNodes.length === 0) {
    errors.push("FlowchartNodes cannot be empty");
  } else {
    // Validate flowchart node structure
    newsData.flowchartNodes.forEach((node, i) => {
      if (!node.id) errors.push(`FlowchartNode ${i} missing id`);
      if (!node.label) errors.push(`FlowchartNode ${i} missing label`);
      if (!Array.isArray(node.connections)) errors.push(`FlowchartNode ${i} connections must be array`);
    });
  }
  
  if (!Array.isArray(newsData.examRelevance) || newsData.examRelevance.length === 0) {
    errors.push("ExamRelevance cannot be empty");
  }
  
  if (!Array.isArray(newsData.mcqs) || newsData.mcqs.length === 0) {
    errors.push("MCQs cannot be empty");
  } else {
    newsData.mcqs.forEach((mcq, i) => {
      if (!mcq.question?.trim()) errors.push(`MCQ ${i} missing question`);
      if (!Array.isArray(mcq.options) || mcq.options.length !== 4) {
        errors.push(`MCQ ${i} must have exactly 4 options`);
      }
      if (!mcq.answer?.trim()) errors.push(`MCQ ${i} missing answer`);
    });
  }
  
  if (!newsData.mainsQuestion?.question?.trim()) {
    errors.push("MainsQuestion is required");
  }
  
  return {
    isValid: errors.length === 0,
    errors: errors
  };
}

// -------------------------
// 🔧 Data Cleanup Utilities
// -------------------------
async function cleanupDuplicateNews() {
  console.log("🧹 Cleaning up duplicate news entries...");
  
  try {
    const duplicates = await News.aggregate([
      { $group: { _id: "$title", count: { $sum: 1 }, docs: { $push: "$_id" } } },
      { $match: { count: { $gt: 1 } } }
    ]);
    
    let removedCount = 0;
    for (const duplicate of duplicates) {
      // Keep the first one, remove the rest
      const toRemove = duplicate.docs.slice(1);
      await News.deleteMany({ _id: { $in: toRemove } });
      removedCount += toRemove.length;
    }
    
    console.log(`✅ Removed ${removedCount} duplicate entries`);
    return removedCount;
  } catch (err) {
    console.error("❌ Cleanup failed:", err.message);
    return 0;
  }
}

async function updateRelevanceScores() {
  console.log("🎯 Updating relevance scores for existing news...");
  
  try {
    const allNews = await News.find({});
    let updatedCount = 0;
    
    for (const news of allNews) {
      const newScore = calculateRelevanceScore({
        tags: news.tags,
        publishedAt: news.publishedAt,
        source: news.source
      });
      
      if (newScore !== news.relevanceScore) {
        news.relevanceScore = newScore;
        await news.save();
        updatedCount++;
      }
    }
    
    console.log(`✅ Updated relevance scores for ${updatedCount} entries`);
    return updatedCount;
  } catch (err) {
    console.error("❌ Relevance update failed:", err.message);
    return 0;
  }
}

// -------------------------
// 🔍 Advanced Query Helpers
// -------------------------
async function getTopRelevantNews(limit = 10, tags = [], minScore = 5) {
  try {
    const query = { relevanceScore: { $gte: minScore } };
    if (tags.length > 0) {
      query.tags = { $in: tags };
    }
    
    const news = await News.find(query)
      .sort({ relevanceScore: -1, publishedAt: -1 })
      .limit(limit)
      .select('title description relevanceScore publishedAt tags source')
      .lean();
      
    return news;
  } catch (err) {
    console.error("❌ Query failed:", err.message);
    return [];
  }
}

async function getNewsByDateRange(startDate, endDate) {
  try {
    const news = await News.find({
      publishedAt: { 
        $gte: new Date(startDate), 
        $lte: new Date(endDate) 
      }
    })
    .sort({ publishedAt: -1 })
    .lean();
    
    return news;
  } catch (err) {
    console.error("❌ Date range query failed:", err.message);
    return [];
  }
}

async function searchNews(searchTerm, limit = 20) {
  try {
    const news = await News.find(
      { $text: { $search: searchTerm } },
      { score: { $meta: "textScore" } }
    )
    .sort({ score: { $meta: "textScore" }, publishedAt: -1 })
    .limit(limit)
    .lean();
    
    return news;
  } catch (err) {
    console.error("❌ Search failed:", err.message);
    return [];
  }
}

// -------------------------
// 🚀 Batch Operations
// -------------------------
async function batchUpdateCategories() {
  console.log("📂 Updating categories for all news items...");
  
  try {
    const news = await News.find({ categories: { $size: 0 } });
    let updatedCount = 0;
    
    for (const item of news) {
      const categories = ["UPSC", "Current Affairs"];
      
      // Add specific categories based on tags
      if (item.tags.some(tag => tagsConfig.high.includes(tag))) {
        categories.push("High Priority");
      }
      if (item.tags.includes("Economy")) categories.push("Economy");
      if (item.tags.includes("Polity")) categories.push("Polity");
      if (item.tags.includes("IR")) categories.push("International Relations");
      if (item.tags.includes("Environment")) categories.push("Environment");
      
      item.categories = [...new Set(categories)]; // Remove duplicates
      await item.save();
      updatedCount++;
    }
    
    console.log(`✅ Updated categories for ${updatedCount} items`);
    return updatedCount;
  } catch (err) {
    console.error("❌ Batch category update failed:", err.message);
    return 0;
  }
}

// -------------------------
// 📈 Advanced Analytics
// -------------------------
async function getDetailedAnalytics() {
  try {
    const [
      totalStats,
      tagStats,
      sourceStats,
      recentStats,
      scoreDistribution,
      summaryQuality
    ] = await Promise.all([
      // Total and recent counts
      News.aggregate([
        {
          $facet: {
            total: [{ $count: "count" }],
            today: [
              { $match: { createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } } },
              { $count: "count" }
            ],
            thisWeek: [
              { $match: { createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } } },
              { $count: "count" }
            ]
          }
        }
      ]),
      
      // Tag distribution
      News.aggregate([
        { $unwind: "$tags" },
        { $group: { _id: "$tags", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 15 }
      ]),
      
      // Source reliability
      News.aggregate([
        { $group: { _id: "$source", count: { $sum: 1 }, avgScore: { $avg: "$relevanceScore" } } },
        { $sort: { count: -1 } },
        { $limit: 10 }
      ]),
      
      // Recent performance
      News.aggregate([
        { $match: { createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } } },
        { $group: { 
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          count: { $sum: 1 },
          avgScore: { $avg: "$relevanceScore" }
        }},
        { $sort: { _id: 1 } }
      ]),
      
      // Score distribution
      News.aggregate([
        {
          $bucket: {
            groupBy: "$relevanceScore",
            boundaries: [0, 3, 6, 8, 10],
            default: "10+",
            output: { count: { $sum: 1 } }
          }
        }
      ]),
      
      // Summary quality check
      News.aggregate([
        {
          $project: {
            summaryLength: { $size: { $ifNull: ["$summary", []] } },
            hasMCQs: { $gt: [{ $size: { $ifNull: ["$mcqs", []] } }, 0] },
            hasMainsQ: { $ne: ["$mainsQuestion.question", ""] },
            hasFlowchart: { $gt: [{ $size: { $ifNull: ["$flowchartNodes", []] } }, 0] }
          }
        },
        {
          $group: {
            _id: null,
            avgSummaryLength: { $avg: "$summaryLength" },
            withMCQs: { $sum: { $cond: ["$hasMCQs", 1, 0] } },
            withMainsQ: { $sum: { $cond: ["$hasMainsQ", 1, 0] } },
            withFlowchart: { $sum: { $cond: ["$hasFlowchart", 1, 0] } },
            total: { $sum: 1 }
          }
        }
      ])
    ]);
    
    return {
      overview: {
        total: totalStats[0]?.total[0]?.count || 0,
        today: totalStats[0]?.today[0]?.count || 0,
        thisWeek: totalStats[0]?.thisWeek[0]?.count || 0
      },
      topTags: tagStats,
      topSources: sourceStats,
      dailyTrend: recentStats,
      scoreDistribution: scoreDistribution,
      contentQuality: summaryQuality[0] || {}
    };
  } catch (err) {
    console.error("❌ Advanced analytics failed:", err.message);
    return null;
  }
}

// -------------------------
// 🎯 Content Quality Checker
// -------------------------
async function validateAllContent() {
  console.log("🔍 Validating all content quality...");
  
  try {
    const allNews = await News.find({}).lean();
    const issues = [];
    
    for (const news of allNews) {
      const validation = validateNewsSchema(news);
      if (!validation.isValid) {
        issues.push({
          id: news._id,
          title: news.title,
          errors: validation.errors
        });
      }
    }
    
    console.log(`📊 Content validation complete:`);
    console.log(`   Total items: ${allNews.length}`);
    console.log(`   Issues found: ${issues.length}`);
    console.log(`   Quality rate: ${((allNews.length - issues.length) / allNews.length * 100).toFixed(1)}%`);
    
    if (issues.length > 0) {
      console.log("\n⚠️ Items with issues:");
      issues.slice(0, 5).forEach(issue => {
        console.log(`   - ${issue.title}: ${issue.errors.join(', ')}`);
      });
      if (issues.length > 5) {
        console.log(`   ... and ${issues.length - 5} more`);
      }
    }
    
    return {
      total: allNews.length,
      issues: issues.length,
      qualityRate: ((allNews.length - issues.length) / allNews.length * 100),
      problemItems: issues
    };
  } catch (err) {
    console.error("❌ Content validation failed:", err.message);
    return null;
  }
}

// -------------------------
// 🚨 Emergency Recovery Functions
// -------------------------
async function emergencyBackup() {
  console.log("🚨 Creating emergency backup...");
  
  try {
    const allNews = await News.find({}).lean();
    const backupData = {
      timestamp: new Date().toISOString(),
      count: allNews.length,
      data: allNews
    };
    
    const backupDir = path.join(process.cwd(), "backups");
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir);
    
    const filename = path.join(backupDir, `news-backup-${Date.now()}.json`);
    fs.writeFileSync(filename, JSON.stringify(backupData, null, 2));
    
    console.log(`✅ Backup created: ${filename} (${allNews.length} items)`);
    return filename;
  } catch (err) {
    console.error("❌ Backup failed:", err.message);
    return null;
  }
}

async function restoreFromBackup(backupFile) {
  console.log(`🔄 Restoring from backup: ${backupFile}`);
  
  try {
    const backupData = JSON.parse(fs.readFileSync(backupFile, 'utf8'));
    
    // Clear existing data (be careful!)
    console.log("⚠️ WARNING: This will delete all existing news data!");
    console.log("Proceeding in 5 seconds... (Ctrl+C to cancel)");
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    await News.deleteMany({});
    console.log("🗑️ Existing data cleared");
    
    // Restore data
    for (const item of backupData.data) {
      delete item._id; // Let MongoDB generate new IDs
      const newsDoc = new News(item);
      await newsDoc.save();
    }
    
    console.log(`✅ Restored ${backupData.data.length} items from backup`);
    return backupData.data.length;
  } catch (err) {
    console.error("❌ Restore failed:", err.message);
    return 0;
  }
}

// -------------------------
// 🎛️ Configuration Manager
// -------------------------
const CONFIG = {
  BATCH_SIZE: 5,
  RATE_LIMIT_MS: 1500,
  MAX_RETRIES: 3,
  MIN_SUMMARY_POINTS: 8,
  MAX_SUMMARY_POINTS: 10,
  TARGET_SUMMARY_WORDS: 200,
  DEFAULT_CATEGORIES: ["UPSC", "Current Affairs"],
  GEMINI_TEMPERATURE: 0.1,
  GEMINI_MAX_TOKENS: 2048
};

function updateConfig(newConfig) {
  Object.assign(CONFIG, newConfig);
  console.log("⚙️ Configuration updated:", newConfig);
}

function getConfig() {
  return { ...CONFIG };
}

// -------------------------
// 🎪 Complete Exported API
// -------------------------
module.exports = {
  // Main pipeline functions
  runContentPipeline,
  testGeminiConnection,
  
  // Content management
  generateAndStoreContent,
  fetchTop5News_Prod,
  fetchTop5News_Dev,
  
  // Utilities and helpers
  calculateRelevanceScore,
  normalizeGeminiOutput,
  validateNewsSchema,
  
  // Analytics and insights
  getContentAnalytics,
  getDetailedAnalytics,
  validateAllContent,
  
  // Query helpers
  getTopRelevantNews,
  getNewsByDateRange,
  searchNews,
  
  // Maintenance functions
  cleanupDuplicateNews,
  updateRelevanceScores,
  batchUpdateCategories,
  
  // Emergency functions
  emergencyBackup,
  restoreFromBackup,
  
  // Configuration
  updateConfig,
  getConfig,
  
  // Constants
  tagsConfig,
  allTags,
  CONFIG
};