/**
 * api.ts — Axios instance & typed API helpers
 */

import axios from 'axios';

export const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://aurafit-8e3u.onrender.com/api';

export const api = axios.create({
  baseURL: API_BASE,
  timeout: 45000, // AI calls can take up to 30s
});

// Attach token on every request
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('fashion_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ─── Products ─────────────────────────────────────────────────────────────────
export const productsApi = {
  list: (params?: Record<string, any>) => api.get('/products', { params }),
  featured: () => api.get('/products/featured'),
  stats: () => api.get('/products/stats'),
  getById: (id: string) => api.get(`/products/${id}`)
};

// ─── Recommendations ─────────────────────────────────────────────────────────
export const recommendationsApi = {
  forProduct: (id: string) => api.get(`/recommendations/${id}`),
  outfit: (message: string, prioritiesHint?: string) =>
    api.post('/recommendations/outfit', { message, ...(prioritiesHint ? { prioritiesHint } : {}) })
};

// ─── Search ──────────────────────────────────────────────────────────────────
export const searchApi = {
  search: (params?: Record<string, any>) => api.get('/search', { params }),
  suggestions: (q: string) => api.get('/search/suggestions', { params: { q } })
};

// ─── Auth ─────────────────────────────────────────────────────────────────────
export const authApi = {
  login: (email: string, password: string) => api.post('/auth/login', { email, password }),
  register: (name: string, email: string, password: string) => api.post('/auth/register', { name, email, password }),
  me: () => api.get('/auth/me'),
  changePassword: (currentPassword: string, newPassword: string) =>
    api.put('/auth/change-password', { currentPassword, newPassword })
};

// ─── Favorites ───────────────────────────────────────────────────────────────
export const favoritesApi = {
  list: () => api.get('/favorites'),
  toggle: (productId: string) => api.post(`/favorites/${productId}`),
  check: (productId: string) => api.get(`/favorites/check/${productId}`)
};

// ─── Admin ───────────────────────────────────────────────────────────────────
export const adminApi = {
  stats: () => api.get('/admin/stats'),
  scraperLogs: (limit = 20) => api.get('/admin/scraper/logs', { params: { limit } }),
  scraperStatus: () => api.get('/admin/scraper/status'),
  triggerScrape: () => api.post('/admin/scraper/run'),
  systemLogs: (params?: { limit?: number; source?: string }) => api.get('/admin/system-logs', { params }),
  resolveLog: (id: string, adminNote?: string) => api.post(`/admin/system-logs/${id}/resolve`, { adminNote }),
  /** Opens a Server-Sent Events stream for real-time scraper progress */
  scraperStream: (onMessage: (data: any) => void, onError?: (e: Event) => void): EventSource => {
    const es = new EventSource(`${API_BASE}/admin/scraper/stream`);
    es.onmessage = (e) => {
      try { onMessage(JSON.parse(e.data)); } catch { /* ignore malformed */ }
    };
    if (onError) es.onerror = onError;
    return es;
  }
};

// ─── Support / Escalation ─────────────────────────────────────────────────────
export const supportApi = {
  escalate: (userMessage: string, userEmail?: string) =>
    api.post('/support/escalate', { userMessage, userEmail })
};

// ─── Wardrobe & Boards ───────────────────────────────────────────────────────
export const wardrobeApi = {
  list: () => api.get('/wardrobe'),
  add: (formData: FormData) => api.post('/wardrobe', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
};

export const outfitsApi = {
  list: () => api.get('/outfits'),
  save: (data: any) => api.post('/outfits', data),
  remove: (id: string) => api.delete(`/outfits/${id}`)
};

// ─── Visual Search ───────────────────────────────────────────────────────────
export const visualSearchApi = {
  searchByImage: (formData: FormData) => api.post('/search/visual/image', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
};

// ─── Virtual Try-On ──────────────────────────────────────────────────────────
export const tryonApi = {
  generate: (formData: FormData) => api.post('/tryon', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120000 // VTON can take up to 2 minutes
  })
};

// ─── Vector / Semantic Search ──────────────────────────────────────────────────
export const vectorSearchApi = {
  /** True semantic similarity search using HuggingFace embeddings */
  semantic: (q: string, params?: Record<string, any>) =>
    api.get('/search/semantic', { params: { q, ...params } }),
  /** Batch-generate HF embeddings for products that don't have them */
  embedAll: (limit = 50) => api.post('/search/embed-all', { limit }),
};
