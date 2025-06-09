require("dotenv").config();

const HUGGINGFACE_API_TOKEN = process.env.HUGGINGFACE_API_KEY;

// Abilico — Accessibility keyword extraction module (open‑source edition)
// ======================================================================
// This ES‑module analyses user reviews with **open‑source NLP models**
// (via Hugging Face Inference API) to identify accessibility‑related
// keywords and group them into high‑level categories.
//
// 👉 No proprietary LLMs required.  You only need a free HuggingFace token
//    and the model ID you want to use (defaults to "facebook/bart-large-mnli" —
//    a popular zero‑shot classifier).
//
// -------------------------------------------------------------------------
// Usage
// -------------------------------------------------------------------------
// import { extractAccessibilityKeywords } from "./extractAccessibility.js";
// const HF_API_KEY = "hf_...";  // https://huggingface.co/settings/tokens
// const { keywords, categories } =
//       await extractAccessibilityKeywords(reviewsArray, {
//         hfApiKey: HF_API_KEY,
//         modelId:  "facebook/bart-large-mnli", // optional – any zero‑shot model
//         scoreThreshold: 0.4,                  // optional – relevance cut‑off
//       });
// console.log(keywords, categories);
// -------------------------------------------------------------------------
// The function is side‑effect‑free — you decide where and how to store the
// results (e.g. attach them to each place, cache them, render chips, etc.).
// -------------------------------------------------------------------------

/* eslint-disable curly */

/**
 * High‑level categories ➜ canonical keywords.
 * These serve two purposes:
 *   1. Provide candidate labels to the zero‑shot classifier.
 *   2. Supply a pure‑JS fallback when the remote call fails.
 */
const CATEGORY_KEYWORDS = {
  Restrooms: ["accessible restroom", "accessible toilet", "family restroom"],
  Entrances: ["step‑free entrance", "automatic door", "ramp entrance"],
  Parking: ["accessible parking", "disabled parking bay"],
  Mobility: ["wheelchair accessible", "ramp", "elevator", "wide doorway"],
  Vision: ["braille signage", "large print menu", "tactile paving"],
  Hearing: ["sign language", "hearing loop", "visual alarm", "captioned video"],
  Seating: ["accessible seating", "companion seating", "priority seating"],
  Services: [
    "assistance available",
    "staff assistance",
    "service animal friendly",
  ],
};

// Flatten the keyword list once so we can give it to the zero‑shot model.
const ALL_KEYWORDS = Object.values(CATEGORY_KEYWORDS).flat();

/**
 * Detect keywords using HuggingFace zero‑shot classification.
 *
 * @param {string} text           – review text
 * @param {object} opts           – {hfApiKey, modelId, scoreThreshold}
 * @returns {Promise<Record<string,string[]>>} – categories → keyword array
 */
async function classifyWithHF(text, opts) {
  const {
    hfApiKey,
    modelId = "facebook/bart-large-mnli",
    scoreThreshold = 0.4,
  } = opts ?? {};

  if (!hfApiKey) return {}; // caller can fall back to static scan

  const url = `https://api-inference.huggingface.co/models/${modelId}`;
  const body = {
    inputs: text,
    parameters: {
      candidate_labels: ALL_KEYWORDS,
      multi_label: true,
    },
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${hfApiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) throw new Error(await res.text());
    const json = await res.json();

    /* Example response shape:
       [
         {
           labels: ["wheelchair accessible", "ramp", ...],
           scores: [0.98, 0.87, ...]
         }
       ]
    */

    const [pred] = Array.isArray(json) ? json : [{}];
    const { labels = [], scores = [] } = pred;

    const matches = {};
    labels.forEach((label, i) => {
      if (scores[i] >= scoreThreshold) {
        const cat = findCategory(label);
        if (!matches[cat]) matches[cat] = [];
        matches[cat].push(label.toLowerCase());
      }
    });

    return matches;
  } catch (e) {
    console.warn("HuggingFace inference failed:", e.message);
    return {}; // caller will fall back to static scan
  }
}

/**
 * Quick heuristic scan for fallback keywords when HF call is unavailable.
 * Returns categories → keyword array (lower‑cased, deduped per review).
 */
function scanFallback(text) {
  const found = {};
  const lower = text.toLowerCase();
  for (const [cat, kws] of Object.entries(CATEGORY_KEYWORDS)) {
    for (const kw of kws) {
      if (lower.includes(kw)) {
        if (!found[cat]) found[cat] = [];
        if (!found[cat].includes(kw)) found[cat].push(kw);
      }
    }
  }
  return found;
}

/**
 * Helper → get category name from a keyword.
 */
function findCategory(keyword) {
  for (const [cat, kws] of Object.entries(CATEGORY_KEYWORDS))
    if (kws.includes(keyword)) return cat;
  return "Other";
}

/**
 * Main entry: aggregate keywords + categories across a list of reviews.
 *
 * @param {Array<{text:string}>} reviews – list of reviews (must include `.text`)
 * @param {object} options               – see classifyWithHF options + {scoreThreshold}
 * @returns {Promise<{keywords:string[], categories:Record<string,string[]>}>}
 */
async function extractAccessibilityKeywords(reviews, options = {}) {
  const allKeywords = new Set();
  const categorySets = {}; // category → Set<string>

  for (const { text = "" } of reviews) {
    if (!text) continue;

    // 1. Try open‑source zero‑shot model
    let detected = await classifyWithHF(text, options);

    // 2. Fallback / supplement with static scan
    const staticDetected = scanFallback(text);
    detected = mergeCategoryMaps(detected, staticDetected);

    // 3. Accumulate
    for (const [cat, kws] of Object.entries(detected)) {
      if (!categorySets[cat]) categorySets[cat] = new Set();
      kws.forEach((kw) => {
        const normal = kw.toLowerCase().trim();
        categorySets[cat].add(normal);
        allKeywords.add(normal);
      });
    }
  }

  // 4. Convert Sets → arrays for serialisation/UI
  const categories = {};
  Object.entries(categorySets).forEach(([cat, set]) => {
    categories[cat] = Array.from(set);
  });

  return {
    keywords: Array.from(allKeywords),
    categories,
  };
}

/* ---------------------------------------------------------------------- *
 * Utility
 * ---------------------------------------------------------------------- */
function mergeCategoryMaps(a, b) {
  const out = { ...a };
  for (const [cat, kws] of Object.entries(b)) {
    if (!out[cat]) out[cat] = [];
    kws.forEach((kw) => {
      if (!out[cat].includes(kw)) out[cat].push(kw);
    });
  }
  return out;
}

const mockReviews = [
  // Mobility
  {
    text: "The wheelchair ramp at the side entrance made it so much easier to get in.",
  },
  { text: "Great elevator service – no more hauling luggage up the stairs!" },

  // Restrooms
  {
    text: "They have an accessible bathroom with grab bars and plenty of room.",
  },
  { text: "The disabled toilet was clean and well-maintained." },

  // Parking
  { text: "Reserved parking spots right by the door were a lifesaver." },
  { text: "Handicap parking spaces are clearly marked and never full." },

  // Vision
  {
    text: "Menus in large print and braille labels on the doors were fantastic.",
  },
  { text: "High contrast signage really helped me navigate the hallways." },

  // Hearing
  {
    text: "The venue had a hearing loop installed and captions on all videos.",
  },
  { text: "Sign language interpreters were available for the keynote." },

  // Seating
  { text: "Priority seating up front with armrests was super comfortable." },
  { text: "Adjustable seats in the theater let me lean back without issues." },

  // Service
  {
    text: "Staff assistance was top-notch and they were trained in disability etiquette.",
  },
  { text: "Friendly staff helped me bring my service animal inside." },

  // Other / mixed
  {
    text: "Loved the open layout, though I wish there were more tactile floor markers.",
  },
  {
    text: "Great coffee but no audio description for the short film they played.",
  },
];

async function init() {
  const keywordsExtracted = await extractAccessibilityKeywords(mockReviews, {
    hfApiKey: HUGGINGFACE_API_TOKEN,
  });
  console.log(keywordsExtracted);
}

init().catch((err) => console.error("Error during keyword extraction:", err));
