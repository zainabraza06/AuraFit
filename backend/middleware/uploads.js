/**
 * uploads.js — image upload validation.
 *
 * multer only trusts the client-declared mimetype. Here we (1) restrict declared types up front,
 * (2) cap file count/size, and (3) after buffering, verify the real file signature (magic bytes)
 * and rewrite the mimetype from it, so a script or HTML file renamed to .jpg is rejected and
 * downstream code never sees a spoofed content type.
 */
import multer from 'multer';

const ALLOWED_DECLARED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

/** Detect an image type from its first bytes. Returns a mimetype or null. */
export function sniffImageType(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  const g = buf.subarray(0, 6).toString('latin1');
  if (g === 'GIF87a' || g === 'GIF89a') return 'image/gif';
  return null;
}

export class UploadError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UploadError';
    this.status = 400;
  }
}

/** multer instance: memory storage, size cap, declared-type allow-list, bounded field count. */
export function imageUpload({ maxBytes = 5 * 1024 * 1024, maxFiles = 3 } = {}) {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxBytes, files: maxFiles, fields: 20, fieldSize: 100 * 1024 },
    fileFilter(req, file, cb) {
      if (!ALLOWED_DECLARED.has(file.mimetype)) return cb(new UploadError('Only JPEG, PNG, WebP or GIF images are accepted'));
      cb(null, true);
    },
  });
}

function filesOf(req) {
  if (req.file) return [req.file];
  if (Array.isArray(req.files)) return req.files;
  if (req.files && typeof req.files === 'object') return Object.values(req.files).flat();
  return [];
}

/** Run AFTER multer: checks real file signatures and fixes the mimetype. */
export function verifyImages(req, res, next) {
  for (const f of filesOf(req)) {
    const real = sniffImageType(f.buffer);
    if (!real) return next(new UploadError(`"${f.originalname || f.fieldname}" is not a valid image file`));
    f.mimetype = real;
  }
  next();
}

/** Express error middleware for upload problems (multer limit errors included). */
// eslint-disable-next-line no-unused-vars
export function uploadErrorHandler(err, req, res, next) {
  if (err instanceof UploadError) return res.status(400).json({ error: err.message });
  if (err instanceof multer.MulterError) {
    const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    return res.status(status).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'Image is too large' : err.message });
  }
  next(err);
}
