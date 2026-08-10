// Content-relevant image resolver with graceful degradation.
//
//   Pixabay (free, key-only)  ->  Unsplash (if configured)  ->  placeholder
//
// Pixabay is preferred because its API is free and needs only an API key
// (https://pixabay.com/api/docs/). Unsplash stays as an optional secondary so
// existing keys keep working. Pinterest is intentionally NOT used: it has no
// free/public image-search API (only auth'd user-content endpoints), so it
// can't serve as a keyword image source.
//
// Every network path is best-effort and wrapped so a provider outage never
// breaks content creation — the caller always gets a usable URL.

const axios = require("axios");

const PLACEHOLDER = "https://placehold.co/800x400?text=No+Image";
const TIMEOUT_MS = 8000;

async function fromPixabay(query) {
  if (!process.env.PIXABAY_API_KEY) return null;
  const resp = await axios.get("https://pixabay.com/api/", {
    params: {
      key: process.env.PIXABAY_API_KEY,
      q: query,
      image_type: "photo",
      orientation: "horizontal",
      safesearch: true,
      per_page: 3,
    },
    timeout: TIMEOUT_MS,
  });
  const hit = resp.data && Array.isArray(resp.data.hits) && resp.data.hits[0];
  return (hit && (hit.largeImageURL || hit.webformatURL)) || null;
}

async function fromUnsplash(query) {
  if (!process.env.UNSPLASH_ACCESS_KEY) return null;
  const resp = await axios.get("https://api.unsplash.com/search/photos", {
    params: { query, per_page: 1, orientation: "landscape" },
    headers: { Authorization: `Client-ID ${process.env.UNSPLASH_ACCESS_KEY}` },
    timeout: TIMEOUT_MS,
  });
  const r = resp.data && resp.data.results && resp.data.results[0];
  return (r && r.urls && (r.urls.regular || r.urls.small || r.urls.full)) || null;
}

// Resolve a keyword query to a content-relevant image URL. Tries each provider
// in order; the first non-empty result wins. Falls back to a placeholder.
async function getContentImageUrl(query) {
  const q = String(query || "").trim() || "india news current affairs";
  for (const provider of [fromPixabay, fromUnsplash]) {
    try {
      const url = await provider(q);
      if (url) return url;
    } catch (err) {
      console.warn(`image provider ${provider.name} failed:`, err?.message || err);
    }
  }
  return PLACEHOLDER;
}

module.exports = { getContentImageUrl, PLACEHOLDER, fromPixabay, fromUnsplash };
