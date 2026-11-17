/**
 * imageEmbeddings.js — pictures and short texts in ONE vector space (CLIP), run locally.
 *
 * Why a second embedding model: Qwen3 (embeddings.js) embeds TEXT. Photo search used to go
 * photo -> LLM description -> text search, which loses what words cannot say (print, silhouette,
 * embellishment). CLIP maps an image and the sentence describing it to nearby vectors, so we can
 * compare an uploaded photo directly against every product photo (and text against photos).
 *
 * Model: Xenova/clip-vit-base-patch32 (q8 ONNX, 512 dims), in-process via transformers.js: no API key,
 * no per-call cost. ~150 ms per image on a laptop CPU (measured), one-time ~90 MB download.
 *
 * Vectors are stored on products as `imageEmbedding` + `imageEmbeddingModel`; only vectors from the
 * CURRENT model id are searched. Tests inject a fake with setImageEmbeddingBackend().
 */
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const IMAGE_EMBEDDING_MODEL_ID = process.env.IMAGE_EMBEDDING_MODEL_ID || 'Xenova/clip-vit-base-patch32:q8';
export const IMAGE_EMBEDDING_DIM = 512;
const MODEL_REPO = process.env.IMAGE_EMBEDDING_MODEL_REPO || 'Xenova/clip-vit-base-patch32';
const MODEL_DTYPE = process.env.IMAGE_EMBEDDING_DTYPE || 'q8';

const normalize = (arr) => {
  const v = Float32Array.from(arr);
  let n = 0;
  for (let i = 0; i < v.length; i++) n += v[i] * v[i];
  n = Math.sqrt(n) || 1;
  for (let i = 0; i < v.length; i++) v[i] /= n;
  return Array.from(v);
};

let modelsPromise = null;
async function loadModels() {
  const t = await import('@huggingface/transformers');
  t.env.cacheDir = process.env.EMBEDDING_CACHE_DIR || path.resolve(__dirname, '../.model-cache');
  const [processor, vision, tokenizer, text] = await Promise.all([
    t.AutoProcessor.from_pretrained(MODEL_REPO),
    t.CLIPVisionModelWithProjection.from_pretrained(MODEL_REPO, { dtype: MODEL_DTYPE }),
    t.AutoTokenizer.from_pretrained(MODEL_REPO),
    t.CLIPTextModelWithProjection.from_pretrained(MODEL_REPO, { dtype: MODEL_DTYPE }),
  ]);
  return { RawImage: t.RawImage, processor, vision, tokenizer, text };
}

const localBackend = {
  async embedImage(buffer) {
    modelsPromise ||= loadModels();
    const m = await modelsPromise;
    const image = await m.RawImage.fromBlob(new Blob([buffer]));
    const { image_embeds } = await m.vision(await m.processor(image));
    return normalize(image_embeds.data);
  },
  async embedText(text) {
    modelsPromise ||= loadModels();
    const m = await modelsPromise;
    const { text_embeds } = await m.text(m.tokenizer([text], { padding: true, truncation: true }));
    return normalize(text_embeds.data);
  },
};

let backend = localBackend;

/** @param {{ embedImage(buf: Buffer): Promise<number[]>, embedText(text: string): Promise<number[]> } | null} replacement */
export function setImageEmbeddingBackend(replacement) {
  backend = replacement || localBackend;
}

// The ONNX sessions are not safe to run concurrently: one queue for both modalities.
let chain = Promise.resolve();
const serialised = (fn) => {
  const run = chain.then(fn, fn);
  chain = run.catch(() => {});
  return run;
};

export const embedImage = (buffer) => serialised(() => backend.embedImage(buffer));
export const embedTextForImages = (text) => serialised(() => backend.embedText(String(text).slice(0, 300)));

/** Same rule as text embeddings: tests never load a model by accident. */
export function isImageEmbeddingConfigured() {
  return backend !== localBackend || process.env.NODE_ENV !== 'test';
}
