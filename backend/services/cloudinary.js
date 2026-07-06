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

let _configured = null;

export function isCloudinaryConfigured() {
  if (_configured !== null) return _configured;
  const { CLOUDINARY_URL, CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;
  if (CLOUDINARY_URL && CLOUDINARY_URL.startsWith('cloudinary://')) {
    // The SDK auto-reads CLOUDINARY_URL from the environment.
    cloudinary.config({ secure: true });
    _configured = true;
  } else if (CLOUDINARY_CLOUD_NAME && CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET) {
    cloudinary.config({
      cloud_name: CLOUDINARY_CLOUD_NAME,
      api_key: CLOUDINARY_API_KEY,
      api_secret: CLOUDINARY_API_SECRET,
      secure: true
    });
    _configured = true;
  } else {
    _configured = false;
  }
  return _configured;
}

/**
 * Uploads an in-memory image buffer to Cloudinary.
 * @param {Buffer} buffer
 * @param {{ folder?: string, publicId?: string }} [opts]
 * @returns {Promise<{ url: string, publicId: string }>}
 */
export function uploadBufferToCloudinary(buffer, opts = {}) {
  if (!isCloudinaryConfigured()) {
    return Promise.reject(new Error('Cloudinary is not configured'));
  }
  const { folder = 'aurafit/avatars', publicId } = opts;
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        public_id: publicId,
        overwrite: true,
        resource_type: 'image',
        transformation: [{ width: 512, height: 512, crop: 'limit' }, { quality: 'auto', fetch_format: 'auto' }]
      },
      (err, result) => {
        if (err) return reject(err);
        resolve({ url: result.secure_url, publicId: result.public_id });
      }
    );
    stream.end(buffer);
  });
}
