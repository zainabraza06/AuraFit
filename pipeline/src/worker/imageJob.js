import axios from 'axios';
import sharp from 'sharp';
import { v2 as cloudinary } from 'cloudinary';

const MAX_BYTES = 10 * 1024 * 1024;

/** Download -> resize to 800px-wide WebP -> (optional) Cloudinary upload -> record URL. */
export function createImageJob({ fetchImage, transform, upload, recordResult }) {
  return async function run(job) {
    const input = await fetchImage(job.imageUrl);
    const output = await transform(input);
    const hostedUrl = upload ? await upload(output, job) : null;
    await recordResult(job.productUrl, { hostedUrl, bytes: output.length });
    return hostedUrl;
  };
}

export async function fetchImage(url) {
  const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 15000, maxContentLength: MAX_BYTES });
  return Buffer.from(res.data);
}

export const transform = (buf) => sharp(buf).resize({ width: 800, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();

/** Returns an uploader, or null when Cloudinary isn't configured (the job still resizes and records). */
export function makeCloudinaryUploader(url = process.env.CLOUDINARY_URL) {
  if (!url || !url.startsWith('cloudinary://')) return null;
  cloudinary.config({ cloudinary_url: url, secure: true });
  return (buffer, job) => new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: 'aurafit/pipeline', public_id: job.eventId, overwrite: true, resource_type: 'image' },
      (err, result) => (err ? reject(err) : resolve(result.secure_url)),
    );
    stream.end(buffer);
  });
}
