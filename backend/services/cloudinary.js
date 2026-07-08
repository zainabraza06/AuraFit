/**
 * cloudinary.js — optional image hosting.
 *
 * Configured via EITHER:
 *   CLOUDINARY_URL=cloudinary://<api_key>:<api_secret>@<cloud_name>
 * OR the three discrete vars:
 *   CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET
 *
 * If none are set, isCloudinaryConfigured() returns false and callers should
 * degrade gracefully (the app must not crash when Cloudinary is absent).
 */
import { v2 as cloudinary } from 'cloudinary';
import axios from 'axios';

let _configured = null;

/** Rejects obvious placeholder text left in .env (e.g. "<your_api_key>") as unset. */
function isPlaceholder(v) {
  return !v || /[<>]|your_api_key|your_api_secret|your_cloud_name/i.test(v);
}

/** cloudinary://API_KEY:API_SECRET@CLOUD_NAME → { cloud_name, api_key, api_secret } or null. */
function parseCloudinaryUrl(url) {
  const m = /^cloudinary:\/\/([^:]+):([^@]+)@(.+)$/.exec(String(url || '').trim());
  if (!m) return null;
  const [, api_key, api_secret, cloud_name] = m;
  return { cloud_name, api_key, api_secret };
}

export function isCloudinaryConfigured() {
  if (_configured !== null) return _configured;
  const { CLOUDINARY_URL, CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;

  // Parse + pass credentials EXPLICITLY rather than relying on the cloudinary
  // package's own implicit CLOUDINARY_URL env read — that read happens once at
  // module-import time, which in this app's ES-module import graph can run
  // before dotenv.config() has populated process.env, silently leaving the SDK
  // unconfigured even though the env var is set correctly by request time.
  let creds = null;
  if (!isPlaceholder(CLOUDINARY_URL)) {
    creds = parseCloudinaryUrl(CLOUDINARY_URL);
  }
  if (!creds && !isPlaceholder(CLOUDINARY_CLOUD_NAME) && !isPlaceholder(CLOUDINARY_API_KEY) && !isPlaceholder(CLOUDINARY_API_SECRET)) {
    creds = { cloud_name: CLOUDINARY_CLOUD_NAME, api_key: CLOUDINARY_API_KEY, api_secret: CLOUDINARY_API_SECRET };
  }

  if (creds) {
    cloudinary.config({ ...creds, secure: true });
    _configured = true;
  } else {
    _configured = false;
  }
  return _configured;
}

/**
 * Uploads an in-memory image buffer to Cloudinary.
 * @param {Buffer} buffer
 * @param {{ folder?: string, publicId?: string, transformation?: object[] }} [opts]
 * @returns {Promise<{ url: string, publicId: string }>}
 */
export function uploadBufferToCloudinary(buffer, opts = {}) {
  if (!isCloudinaryConfigured()) {
    return Promise.reject(new Error('Cloudinary is not configured'));
  }
  const {
    folder = 'aurafit/avatars',
    publicId,
    transformation = [{ width: 512, height: 512, crop: 'limit' }, { quality: 'auto', fetch_format: 'auto' }]
  } = opts;
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        public_id: publicId,
        overwrite: true,
        resource_type: 'image',
        transformation
      },
      (err, result) => {
        if (err) return reject(err);
        resolve({ url: result.secure_url, publicId: result.public_id });
      }
    );
    stream.end(buffer);
  });
}

/**
 * Downloads an image from a (possibly ephemeral/session-scoped) URL and
 * re-hosts it on Cloudinary, returning a permanent, universally-loadable URL.
 * Used for AI-generated try-on results — provider URLs (Replicate, free HF
 * Spaces) can be short-lived, session-bound, or reject hotlinking from a
 * browser <img> tag loaded well after the request that generated them.
 * @param {string} sourceUrl
 * @param {{ folder?: string, publicId?: string }} [opts]
 * @returns {Promise<{ url: string, publicId: string }>}
 */
export async function rehostUrlOnCloudinary(sourceUrl, opts = {}) {
  const { data } = await axios.get(sourceUrl, { responseType: 'arraybuffer', timeout: 30000 });
  return uploadBufferToCloudinary(Buffer.from(data), {
    folder: 'aurafit/tryon',
    transformation: [{ width: 1024, height: 1024, crop: 'limit' }, { quality: 'auto', fetch_format: 'auto' }],
    ...opts
  });
}
