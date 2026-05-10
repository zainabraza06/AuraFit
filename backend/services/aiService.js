import { GoogleGenerativeAI } from '@google/generative-ai';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

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
