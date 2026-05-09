/**
 * recommendationEngine.js
 * AI outfit recommendation scoring system.
 *
 * Final Score Formula:
 *   finalScore = embeddingSimilarity * 0.5
 *              + colorCompatibility  * 0.2
 *              + occasionMatch       * 0.2
 *              + styleMatch          * 0.1
 *
 * For products without embeddings, falls back to metadata-only scoring.
 */

import Product from '../models/Product.js';
import { getColorArrayCompatibility } from './colorTheory.js';

// ─── Scoring weights ──────────────────────────────────────────────────────────
const WEIGHTS = {
  embedding: 0.5,
  color: 0.2,
  occasion: 0.2,
  style: 0.1
};

// ─── Cosine similarity ────────────────────────────────────────────────────────
function cosineSimilarity(a, b) {
  if (!a?.length || !b?.length || a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// ─── Set overlap score ────────────────────────────────────────────────────────
function setOverlapScore(arr1 = [], arr2 = []) {
  if (!arr1.length || !arr2.length) return 0.4; // Partial credit when unknown
  const set1 = new Set(arr1.map((s) => s.toLowerCase()));
  const matches = arr2.filter((s) => set1.has(s.toLowerCase())).length;
  return Math.min(1, matches / Math.max(arr1.length, arr2.length) + 0.2);
}

// ─── Score a single candidate against a source product ───────────────────────

/**
 * scoreProduct(source, candidate)
 * Returns 0-1 composite compatibility score.
 */
export function scoreProduct(source, candidate) {
  // Embedding similarity
  let embeddingScore = 0;
  if (source.embedding?.length && candidate.embedding?.length) {
    embeddingScore = cosineSimilarity(source.embedding, candidate.embedding);
  } else {
    // Fallback: keyword-based text similarity
    embeddingScore = keywordSimilarity(source, candidate);
  }

  // Color compatibility
  const colorScore = getColorArrayCompatibility(
    source.colors || [source.primaryColor],
    candidate.colors || [candidate.primaryColor]
  );

  // Occasion match
  const occasionScore = setOverlapScore(source.occasion, candidate.occasion);

  // Style match
  const styleScore = setOverlapScore(source.style, candidate.style);

  // Weighted composite
  const finalScore =
    embeddingScore * WEIGHTS.embedding +
    colorScore * WEIGHTS.color +
    occasionScore * WEIGHTS.occasion +
    styleScore * WEIGHTS.style;

  return {
    total: parseFloat(finalScore.toFixed(3)),
    embeddingSimilarity: parseFloat(embeddingScore.toFixed(3)),
    colorCompatibility: parseFloat(colorScore.toFixed(3)),
    occasionCompatibility: parseFloat(occasionScore.toFixed(3)),
    styleCompatibility: parseFloat(styleScore.toFixed(3))
  };
}

// ─── Fallback keyword similarity (no embeddings) ─────────────────────────────

function keywordSimilarity(p1, p2) {
  const words1 = extractKeywords(p1);
  const words2 = extractKeywords(p2);
  if (!words1.size || !words2.size) return 0.3;
  let overlap = 0;
  for (const w of words1) { if (words2.has(w)) overlap++; }
  return Math.min(0.9, overlap / Math.sqrt(words1.size * words2.size) + 0.2);
}

function extractKeywords(product) {
  const text = [
    product.name || '',
    product.description || '',
    ...(product.tags || []),
    ...(product.style || []),
    ...(product.occasion || []),
    product.brand || '',
    product.subCategory || ''
  ].join(' ').toLowerCase();

  return new Set(
    text
      .split(/[\s,.-]+/)
      .filter((w) => w.length > 3)
      .filter((w) => !STOP_WORDS.has(w))
  );
}

const STOP_WORDS = new Set([
  'with', 'that', 'this', 'from', 'your', 'have', 'will', 'been',
  'more', 'than', 'they', 'their', 'what', 'when', 'where', 'which'
]);

// ─── Main recommendation function ────────────────────────────────────────────

// ─── Sister Color Fallback Map ──────────────────────────────────────────────
const SISTER_COLORS = {
  'Red': ['Maroon', 'Pink', 'Orange', 'Rust'],
  'Blue': ['Navy', 'Cyan', 'Teal', 'Grey'],
  'Green': ['Emerald', 'Mint', 'Olive', 'Lime'],
  'Yellow': ['Gold', 'Mustard', 'Orange'],
  'Pink': ['Peach', 'Maroon', 'Red'],
  'Black': ['Grey', 'Navy', 'Charcoal'],
  'White': ['Silver', 'Gold', 'Beige', 'Ivory'],
  'Gold': ['Yellow', 'Silver', 'Beige']
};

/**
 * getRecommendations(productId, options)
 * Finds best-matching shoes and complementary clothing for a given product.
 */
export async function getRecommendations(productId, options = {}) {
  const { maxShoes = 6, maxClothing = 6, maxAccessories = 4 } = options;

  const source = await Product.findById(productId).lean();
  if (!source) throw new Error('Product not found');

  const isClothing = source.category === 'clothing';
  const isShoe = source.category === 'shoes';

  // ── Find candidates ──
  const baseQuery = {
    _id: { $ne: source._id }
  };

  const [shoePool, clothingPool] = await Promise.all([
    isClothing
      ? Product.find({ ...baseQuery, category: 'shoes' }).limit(100).lean()
      : [],
    isShoe
      ? Product.find({ ...baseQuery, category: 'clothing' }).limit(100).lean()
      : Product.find({ ...baseQuery, category: 'clothing' }).limit(50).lean()
  ]);

  // ── Score and rank ──
  const scoredShoes = shoePool
    .map((candidate) => ({ product: candidate, scores: scoreProduct(source, candidate) }))
    .sort((a, b) => b.scores.total - a.scores.total)
    .slice(0, maxShoes);

  const scoredClothing = clothingPool
    .map((candidate) => ({ product: candidate, scores: scoreProduct(source, candidate) }))
    .sort((a, b) => b.scores.total - a.scores.total)
    .slice(0, maxClothing);

  return {
    source,
    shoes: scoredShoes,
    complementaryClothing: scoredClothing,
    generatedAt: new Date()
  };
}

/**
 * getOutfitForQuery(intent, aiInstance)
 * Master Stylist Version: Uses AI to pick the best from a filtered pool.
 */
export async function getOutfitForQuery(intent, aiInstance) {
  const { color, occasion = [], style = [], maxBudget = 0 } = intent;

  // 1. Get a pool of 20 high-quality candidates
  const clothingQuery = { category: 'clothing' };
  if (color && color.toLowerCase() !== 'any') {
    clothingQuery.$or = [
      { primaryColor: { $regex: color, $options: 'i' } },
      { colors: { $regex: color, $options: 'i' } }
    ];
  }
  if (occasion.length > 0) clothingQuery.occasion = { $in: occasion };
  if (maxBudget > 0) clothingQuery.price = { $lte: maxBudget };

  let pool = await Product.aggregate([{ $match: clothingQuery }, { $sample: { size: 20 } }]);
  
  // Fallback if empty
  if (pool.length === 0) {
    pool = await Product.aggregate([{ $match: { category: 'clothing' } }, { $sample: { size: 10 } }]);
  }

  // 2. If we have AI, let it pick the best "Hero" and provide reasoning
  if (aiInstance && pool.length > 0) {
    try {
      const model = aiInstance.getGenerativeModel({ 
        model: "gemini-1.5-flash",
        generationConfig: { responseMimeType: "application/json" }
      });

      const prompt = `
        You are a Master Fashion Stylist for a premium Pakistani brand.
        User Intent: Color: ${color}, Occasion: ${occasion.join(', ')}, Style: ${style.join(', ')}.
        
        From this pool of products, select the absolute BEST single 'Hero' dress that matches the intent.
        Explain your choice professionally.
        
        Pool:
        ${pool.map((p, i) => `[ID:${i}] Name: ${p.name}, Brand: ${p.brand}, Style: ${p.style.join(', ')}, Color: ${p.primaryColor}`).join('\n')}
        
        Return JSON:
        {
          "selectedIndex": number,
          "reasoning": "1 sentence expert stylist explanation"
        }
      `;

      const result = await model.generateContent(prompt);
      const response = JSON.parse(result.response.text());
      
      const heroDress = pool[response.selectedIndex] || pool[0];
      
      // 3. Get matching shoes for the hero
      const shoePool = await Product.find({ category: 'shoes' }).limit(40).lean();
      const shoes = shoePool
        .map((s) => ({ ...s, _score: scoreProduct(heroDress, s).total }))
        .sort((a, b) => b._score - a._score)
        .slice(0, 6);

      return {
        heroDress,
        otherDresses: pool.filter((_, i) => i !== response.selectedIndex).slice(0, 6),
        shoes,
        reasoning: response.reasoning,
        intent
      };
    } catch (err) {
      console.error("Master Stylist AI failed, falling back to basic logic:", err);
    }
  }

  // Fallback to basic logic if AI is unavailable
  const heroDress = pool[0] || null;
  return {
    heroDress,
    otherDresses: pool.slice(1, 7),
    shoes: [],
    reasoning: "A coordinated selection based on your preference.",
    intent
  };
}

/**
 * generateAIStylistReasoning(hero, pair)
 * Generates a short professional fashion justification.
 */
export async function generateAIStylistReasoning(hero, pair, aiInstance) {
  if (!aiInstance) return "These pieces complement each other in style and occasion.";
  
  try {
    const model = aiInstance.getGenerativeModel({ model: "gemini-1.5-flash" });
    const prompt = `
      You are a luxury fashion stylist. Briefly explain (1 sentence) why this ${pair.category} item:
      "${pair.name}" (${pair.primaryColor}, ${pair.style.join(', ')})
      is a perfect match for this ${hero.category}:
      "${hero.name}" (${hero.primaryColor}, ${hero.style.join(', ')})
      Focus on color harmony, occasion, and aesthetics.
    `;
    const result = await model.generateContent(prompt);
    return result.response.text().trim();
  } catch (err) {
    return "A perfect match for a cohesive and elegant look.";
  }
}
