/**
 * imageEmbeddings.js — pictures and short texts in ONE vector space (CLIP), run locally.
 *
 * Why a second embedding model: Qwen3 (embeddings.js) embeds TEXT. Photo search used to go
 * photo -> LLM description -> text search, which loses what words cannot say (print, silhouette,
 * embellishment). CLIP maps an image and the sentence describing it to nearby vectors, so we can
 * compare an uploaded photo directly against every product photo (and text against photos).
 *
 * Model: FashionCLIP (ff13/fashion-clip: a transformers.js build of patrickjohncyh/fashion-clip, MIT; q8 ONNX,
 * 512 dims), in-process via transformers.js: no API key, no per-call cost. ~150 ms per image on a laptop CPU,
 * one-time ~150 MB download.
 *
 * Why FashionCLIP and not the general OpenAI CLIP: measured on the same 672 live product photos
 * (npm run compare:clip, eval/clip-comparison.json) it is better on every metric, at the same size and speed:
 *                         text->photo P@10   MRR     photo->photo same type
 *   CLIP ViT-B/32 (old)        0.282        0.466         0.537
 *   FashionCLIP (this)         0.421        0.688         0.585
 *   Marqo-FashionCLIP B/16     0.432        0.757         0.571   (~4x the compute, worse on photo->photo)
 *
 * The weights come from a third-party conversion, so the revision is PINNED: a changed upstream cannot silently
 * change what we run. Bump IMAGE_EMBEDDING_MODEL_REVISION (and the id) deliberately, then re-embed.
 *
 * Vectors are stored on products as `imageEmbedding` + `imageEmbeddingModel`; only vectors from the
 * CURRENT model id are searched. Tests inject a fake with setImageEmbeddingBackend().
 */
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MODEL_REPO = process.env.IMAGE_EMBEDDING_MODEL_REPO || 'ff13/fashion-clip';
const MODEL_REVISION = process.env.IMAGE_EMBEDDING_MODEL_REVISION || '0f99955d944c39bfd9d035a02ac273c7a44a406b';
const MODEL_DTYPE = process.env.IMAGE_EMBEDDING_DTYPE || 'q8';
// The id stored with every vector. Vectors from a different id are never compared (they live in a different space).
export const IMAGE_EMBEDDING_MODEL_ID = process.env.IMAGE_EMBEDDING_MODEL_ID || `${MODEL_REPO}@${MODEL_REVISION.slice(0, 7)}:${MODEL_DTYPE}`;
export const IMAGE_EMBEDDING_DIM = 512;

const normalize = (arr) => {
  const v = Float32Array.from(arr);
  let n = 0;
  for (let i = 0; i < v.length; i++) n += v[i] * v[i];
  n = Math.sqrt(n) || 1;
  for (let i = 0; i < v.length; i++) v[i] /= n;
  return Array.from(v);
};

/**
 * A CLIP-family backend for any transformers.js-compatible repo (separate vision/text ONNX towers).
 * Exported so scripts/compareImageModels.js can evaluate alternatives with exactly the same code path.
 */
export function createClipBackend({ repo = MODEL_REPO, dtype = MODEL_DTYPE, textLength = 0, revision = repo === MODEL_REPO ? MODEL_REVISION : 'main' } = {}) {
  let modelsPromise = null;
  async function loadModels() {
    const t = await import('@huggingface/transformers');
    t.env.cacheDir = process.env.EMBEDDING_CACHE_DIR || path.resolve(__dirname, '../.model-cache');
    const [processor, vision, tokenizer, text] = await Promise.all([
      t.AutoProcessor.from_pretrained(repo, { revision }),
      t.CLIPVisionModelWithProjection.from_pretrained(repo, { dtype, revision }),
      t.AutoTokenizer.from_pretrained(repo, { revision }),
      t.CLIPTextModelWithProjection.from_pretrained(repo, { dtype, revision }),
    ]);
    return { RawImage: t.RawImage, processor, vision, tokenizer, text };
  }
  return {
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
      // Some exported text towers have a fixed input length (e.g. Marqo: 77 tokens); others accept any length.
      const tokenOptions = textLength ? { padding: 'max_length', max_length: textLength, truncation: true } : { padding: true, truncation: true };
      const { text_embeds } = await m.text(m.tokenizer([text], tokenOptions));
      return normalize(text_embeds.data);
    },
  };
}

const localBackend = createClipBackend();

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
