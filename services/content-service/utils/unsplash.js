import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

/**
 * Fetches an image URL from Unsplash for a given headline.
 *
 * @param {string} headline - The news headline
 * @returns {Promise<string>} - Unsplash image URL (safe to store in DB)
 */
export const getUnsplashImageUrl = async (headline) => {
  try {
    const response = await axios.get("https://api.unsplash.com/search/photos", {
      params: { query: headline, per_page: 1 },
      headers: {
        Authorization: `Client-ID ${process.env.UNSPLASH_ACCESS_KEY}`,
      },
    });

    return (
      response.data.results[0]?.urls?.regular ||
      "https://placehold.co/800x400?text=No+Image"
    );
  } catch (error) {
    console.error("Unsplash fetch error:", error.message);
    return "https://placehold.co/800x400?text=No+Image"
;
  }
};
