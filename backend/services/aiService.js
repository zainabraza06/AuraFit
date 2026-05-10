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
    return await callGemini(message, prompt, 'gemini-2.5-flash');
  } catch (err) {
    console.warn('⚠️ Gemini 2.5 failed, falling back to 1.5:', err.message);
  }

  // 2. Try Gemini 1.5 Flash (Fallback 1)
  try {
    return await callGemini(message, prompt, 'gemini-1.5-flash');
  } catch (err) {
    console.warn('⚠️ Gemini 1.5 failed, falling back to Groq:', err.message);
  }

  // 3. Try Groq (Fallback 2)
  if (process.env.GROQ_API_KEY) {
    try {
      return await callGroq(message, prompt);
    } catch (err) {
      console.warn('⚠️ Groq failed, falling back to OpenRouter:', err.message);
    }
  }

  // 4. Try OpenRouter (Fallback 3)
  if (process.env.OPENROUTER_API_KEY) {
    try {
      return await callOpenRouter(message, prompt);
    } catch (err) {
      console.error('❌ OpenRouter failed:', err.message);
    }
  }

  throw new Error('All AI providers exhausted or failed.');
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
  const response = await axios.post(
    'https://api.groq.com/openai/v1/chat/completions',
    {
      model: 'llama3-70b-8192',
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: message }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      }
    }
  );
  return JSON.parse(response.data.choices[0].message.content);
}

/**
 * Helper: OpenRouter Call (Mistral / Llama 3)
 */
async function callOpenRouter(message, prompt) {
  const response = await axios.post(
    'https://openrouter.ai/api/v1/chat/completions',
    {
      model: 'mistralai/mistral-7b-instruct:free',
      messages: [
        { role: 'system', content: prompt },
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
  return JSON.parse(response.data.choices[0].message.content);
}
