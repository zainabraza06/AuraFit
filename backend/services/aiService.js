import { GoogleGenerativeAI } from '@google/generative-ai';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

/**
 * rankProductsWithAI
 * Sends up to 20 candidate products + the user's intent to Gemini.
 * Gemini reads each description and returns a ranked list with a reason per product.
 * Falls back to original order if AI call fails.
 */
export async function rankProductsWithAI(products, intent) {
  if (!products.length) return [];

  const productList = products
    .map((p, i) =>
      `[${i + 1}] "${p.name}" by ${p.brand}
  Price: PKR ${p.price}
  Color: ${p.primaryExactColor || p.primaryColor || 'N/A'}
  Occasion: ${(p.occasion || []).join(', ') || 'N/A'}
  Dress style: ${p.dressStyle || p.subCategory || 'N/A'}
  Print/Work: ${p.print || 'N/A'}
  Stitching: ${p.stitching || 'N/A'}
  Fabric: ${p.fabric || 'N/A'}
  Description: ${(p.description || '').slice(0, 300)}`
    )
    .join('\n\n');

  const specifiedParts = [
    intent.colorExact   ? `Color: ${intent.colorExact}`        : null,
    intent.colorFamily && intent.colorFamily !== 'Any' ? `Color family: ${intent.colorFamily}` : null,
    intent.occasion?.length ? `Occasion: ${intent.occasion.join(', ')}` : null,
    intent.dressStyle   ? `Dress style: ${intent.dressStyle}`  : null,
    intent.print        ? `Print/Work: ${intent.print}`        : null,
    intent.stitching    ? `Stitching: ${intent.stitching}`     : null,
    intent.fabric       ? `Fabric: ${intent.fabric}`           : null,
    intent.maxBudget > 0 ? `Budget: PKR ${intent.maxBudget}`  : null,
  ].filter(Boolean).join('\n  ');

  const priorityNote = intent.constraintPriority?.length
    ? `\nUser priority (most → least important): ${intent.constraintPriority.join(' > ')}. Weight matches on earlier items MORE heavily in your ranking.`
    : '';

  const prompt = `You are AuraFit's AI fashion ranker for Pakistani women's fashion.

User asked for: "${intent.originalMessage || intent.intentSummary}"

What the user wants:
  ${specifiedParts || 'General browsing — rank by overall quality and appeal'}${priorityNote}

Rank the ${products.length} products below from BEST (rank 1) to WORST match. Read each description carefully — the description often contains details not in the other fields. Give a concise, specific reason for each ranking (one sentence, mention what matched or what's slightly off).

${productList}

Return ONLY valid JSON — no markdown, no explanation:
{
  "rankings": [
    { "productIndex": 0, "rank": 1, "reason": "Exact maroon embroidered lehenga, perfect for a wedding occasion and within budget" },
    { "productIndex": 2, "rank": 2, "reason": "..." }
  ]
}

productIndex is 0-based (0 = first product listed above). Include all ${products.length} products.`;

  function parseRankings(text) {
    if (text.includes('```')) text = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(extractJson(text));
    return parsed.rankings
      .sort((a, b) => a.rank - b.rank)
      .map((r) => ({ product: products[r.productIndex], rank: r.rank, reason: r.reason }))
      .filter((r) => r.product != null);
  }

  // 1. Gemini 2.5 Flash
  if (process.env.GEMINI_API_KEY) {
    for (const modelName of ['gemini-2.5-flash', 'gemini-1.5-flash']) {
      try {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({
          model: modelName,
          generationConfig: { responseMimeType: 'application/json', temperature: 0.2 }
        });
        const result = await model.generateContent(prompt);
        return parseRankings(result.response.text());
      } catch (err) {
        console.warn(`[rankProductsWithAI] ${modelName} failed:`, err.message);
      }
    }
  }

  // 3. Groq
  if (process.env.GROQ_API_KEY && process.env.GROQ_API_KEY !== 'your_groq_api_key_here') {
    try {
      const response = await axios.post(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          model: 'llama-3.1-8b-instant',
          messages: [
            { role: 'system', content: 'You are a fashion product ranker. Return ONLY valid JSON.' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.1,
          response_format: { type: 'json_object' }
        },
        { headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' } }
      );
      return parseRankings(response.data.choices[0].message.content);
    } catch (err) {
      console.warn('[rankProductsWithAI] Groq failed:', err.message);
    }
  }

  // 4. OpenRouter
  if (process.env.OPENROUTER_API_KEY && process.env.OPENROUTER_API_KEY !== 'your_openrouter_api_key_here') {
    try {
      const response = await axios.post(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          model: 'google/gemma-2-9b-it:free',
          messages: [
            { role: 'system', content: 'You are a fashion product ranker. Return ONLY valid JSON.' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.1
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://aurafit.com',
            'X-Title': 'AuraFit'
          }
        }
      );
      return parseRankings(response.data.choices[0].message.content);
    } catch (err) {
      console.warn('[rankProductsWithAI] OpenRouter failed:', err.message);
    }
  }

  console.warn('[rankProductsWithAI] All providers exhausted, returning original order');
  return products.map((p, i) => ({ product: p, rank: i + 1, reason: null }));
}

/**
 * AuraFit Unified AI Service
 * Orchestrates multi-provider fallbacks for Intent Parsing.
 * Order: Gemini 2.5 -> Gemini 1.5 -> Groq (Llama 3) -> OpenRouter
 */

export const parseIntentWithFallback = async (message, prompt) => {
  // 1. Try Gemini 2.5 Flash (Primary)
  try {
    const result = await callGemini(message, prompt, 'gemini-2.5-flash');
    console.log('🤖 Intent parsed by: Gemini 2.5 Flash');
    return result;
  } catch (err) {
    console.warn('⚠️ Gemini 2.5 failed, falling back to Groq:', err.message);
  }

  // 2. Try Groq (Fallback 1)
  if (process.env.GROQ_API_KEY && process.env.GROQ_API_KEY !== 'your_groq_api_key_here') {
    try {
      const result = await callGroq(message, prompt);
      console.log('🤖 Intent parsed by: Groq (Llama 3)');
      return result;
    } catch (err) {
      console.warn('⚠️ Groq failed, falling back to OpenRouter:', err.message);
    }
  }

  // 3. Try OpenRouter (Fallback 2)
  if (process.env.OPENROUTER_API_KEY && process.env.OPENROUTER_API_KEY !== 'your_openrouter_api_key_here') {
    try {
      const result = await callOpenRouter(message, prompt);
      console.log('🤖 Intent parsed by: OpenRouter (Mistral Free)');
      return result;
    } catch (err) {
      console.warn('⚠️ OpenRouter failed, falling back to Gemini 1.5:', err.message);
    }
  }

  // 4. Try Gemini 1.5 Flash (Final Fallback)
  try {
    const result = await callGemini(message, prompt, 'gemini-1.5-flash');
    console.log('🤖 Intent parsed by: Gemini 1.5 Flash');
    return result;
  } catch (err) {
    console.error('❌ All AI providers exhausted or failed:', err.message);
    throw new Error('All AI providers exhausted or failed.');
  }
};

/**
 * Helper: Google Gemini Call
 */
async function callGemini(message, prompt, modelName) {
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY missing');
  
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({
    model: modelName,
    generationConfig: { responseMimeType: 'application/json', temperature: 0.1 }
  });

  const result = await model.generateContent(prompt + `\n\nUser Request: "${message}"`);
  const response = await result.response;
  let text = response.text();
  if (text.includes('```')) text = text.replace(/```json/g, '').replace(/```/g, '').trim();
  return JSON.parse(text);
}

/**
 * Helper: Groq Call (Llama 3 70B)
 */
async function callGroq(message, prompt) {
  try {
    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: 'llama-3.1-8b-instant',
        messages: [
          { role: 'system', content: prompt + " Return ONLY a valid JSON object." },
          { role: 'user', content: message }
        ],
        temperature: 0.1,
        response_format: { type: 'json_object' }
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    const content = response.data.choices[0].message.content;
    return JSON.parse(extractJson(content));
  } catch (err) {
    throw new Error(`Groq API Error: ${err.response?.data?.error?.message || err.message}`);
  }
}

/**
 * Helper: OpenRouter Call
 */
async function callOpenRouter(message, prompt) {
  try {
    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: 'google/gemma-2-9b-it:free',
        messages: [
          { role: 'system', content: prompt + " Return ONLY a valid JSON object." },
          { role: 'user', content: message }
        ],
        temperature: 0.1
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://aurafit.com',
          'X-Title': 'AuraFit'
        }
      }
    );
    const content = response.data.choices[0].message.content;
    return JSON.parse(extractJson(content));
  } catch (err) {
    throw new Error(`OpenRouter API Error: ${err.response?.data?.error?.message || err.message}`);
  }
}

/**
 * Utility: Robust JSON extraction from LLM response
 */
function extractJson(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) return text;
  return text.substring(start, end + 1);
}
