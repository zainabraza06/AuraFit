import axios from 'axios';
import { isCloudinaryConfigured, rehostUrlOnCloudinary } from '../services/cloudinary.js';
import { analyzeImageWithProviderFallback } from '../services/llmClient.js';

function bufferToDataUrl(buffer, mimetype) {
  return `data:${mimetype};base64,${buffer.toString('base64')}`;
}

/** Resolves a personInput/clothingInput ({buffer,mimetype} or {url}) to base64 + mimeType. */
async function resolveImageBytes(input) {
  if (Buffer.isBuffer(input.buffer)) {
    return { imageBase64: input.buffer.toString('base64'), mimeType: input.mimetype || 'image/jpeg' };
  }
  const { data, headers } = await axios.get(input.url, { responseType: 'arraybuffer', timeout: 20000 });
  return { imageBase64: Buffer.from(data).toString('base64'), mimeType: headers['content-type'] || 'image/jpeg' };
}

/**
 * Checks the person photo BEFORE spending a generation attempt on it — a
 * half-body photo or one where the face is covered/cropped out produces a
 * visibly broken result (the model stretches/shortens the outfit to fit
 * whatever body region is in frame). Better to tell the user upfront than
 * show them a bad generation. Reuses the same vision fallback chain (Mistral
 * Pixtral → Gemini) as visual search — no new provider/dependency.
 *
 * `missingPortion` distinguishes a MINOR crop (just feet/ankles missing —
 * worth auto-extending) from a SIGNIFICANT one (only bust/waist-up — no
 * amount of outpainting can credibly invent an entire missing lower body).
 */
async function validatePersonPhoto(personInput) {
  try {
    const { imageBase64, mimeType } = await resolveImageBytes(personInput);
    const prompt = `
      Look at this photo, which will be used for an AI virtual clothing try-on.
      Return ONLY a JSON object:
      {
        "hasPerson": boolean,   // is there a clearly visible person in the photo?
        "faceVisible": boolean, // is the person's face visible and not covered, turned away, or cropped out of frame?
        "framing": "full-body" | "half-body" | "close-up" | "unclear",
        // full-body = head down to at least the knees is visible
        // half-body = roughly waist-up or less is visible
        // close-up = just the face/shoulders fill the frame
        "missingPortion": "none" | "feet-ankles" | "significant"
        // none = full body already visible (framing is full-body)
        // feet-ankles = ONLY feet/ankles are cut off, everything else (legs, knees) is visible — a minor crop
        // significant = more than that is missing (e.g. waist-up or less)
      }
    `;
    const { data } = await analyzeImageWithProviderFallback({ prompt, imageBase64, mimeType });
    const hasPerson = data?.hasPerson !== false;
    const faceVisible = data?.faceVisible !== false;
    const framing = String(data?.framing || 'unclear').toLowerCase();
    const missingPortion = String(data?.missingPortion || 'significant').toLowerCase();

    if (!hasPerson) {
      return { ok: false, message: "We couldn't find a person in this photo. Please upload a clear photo of yourself." };
    }
    if (!faceVisible) {
      return { ok: false, message: 'Your face needs to be visible for try-on — please upload a photo where your face is clearly shown, not covered or turned away.' };
    }
    if (framing === 'full-body') {
      return { ok: true };
    }
    if ((framing === 'half-body' || framing === 'unclear') && missingPortion === 'feet-ankles') {
      // Just short of full-body — worth extending rather than rejecting outright.
      return { ok: true, needsExtension: true };
    }
    return { ok: false, message: `This photo looks like a ${framing.replace('-', ' ')} shot. For an accurate try-on, please upload a full-length photo (head to at least your knees) with your face visible.` };
  } catch (e) {
    // Validation itself failing (provider down, bad image fetch, etc.) should
    // never block a try-on attempt that might otherwise succeed — fail open.
    console.warn('[TryOn] Person photo validation skipped (check failed):', e.message);
    return { ok: true };
  }
}

/**
 * Free path — extends an "almost full body" photo downward (adds legs/feet)
 * so IDM-VTON has somewhere to place the rest of the garment, instead of
 * rejecting a photo that's only slightly short. Uses the same free ZeroGPU
 * pool as the free try-on Space, so it shares that quota — a best-effort
 * feature, not a guarantee. Generator endpoint: must use submit()+iterate,
 * not predict(), to reliably get the final generated frame.
 */
async function extendPersonPhoto(personInput) {
  const { Client, handle_file } = await import('@gradio/client');
  const app = await Client.connect('fffiloni/diffusers-image-outpaint', {
    hf_token: process.env.HUGGING_FACE_API_KEY || undefined
  });
  const imageArg = Buffer.isBuffer(personInput.buffer) ? handle_file(personInput.buffer) : handle_file(personInput.url);

  console.log('[TryOn] Extending an almost-full-body photo (free outpainting Space, shared quota)...');
  const submission = app.submit('/infer', {
    image: imageArg,
    width: 832,
    height: 1280,
    overlap_percentage: 10,
    num_inference_steps: 8,
    resize_option: 'Full',
    custom_resize_percentage: 50,
    prompt_input: 'full length photo, matching legs and feet standing on the floor, same lighting, same background, seamless continuation',
    alignment: 'Top',
    overlap_left: true,
    overlap_right: true,
    overlap_top: true,
    overlap_bottom: true
  });

  let lastData = null;
  for await (const msg of submission) {
    if (msg.type === 'data') lastData = msg.data;
  }
  if (!lastData) throw new Error('Outpainting returned no image');

  // The Imageslider output is a [before, after]-style tuple — take the last
  // non-null entry (the final generated frame).
  const flat = (Array.isArray(lastData) ? lastData : [lastData]).flat().filter(Boolean);
  const last = flat[flat.length - 1];
  const url = last?.url || (typeof last === 'string' ? last : null);
  if (!url) throw new Error('Outpainting returned no usable image URL');
  return url;
}

/**
 * Both providers return a URL to the generated image. Replicate's URLs expire
 * after a period; the free Hugging Face Space's URLs are tied to its own
 * ephemeral `/tmp/gradio/...` file server and can reject or 404 by the time a
 * browser <img> tag loads them well after the API call returned. Re-hosting on
 * Cloudinary immediately gives the frontend a permanent, always-loadable URL.
 * Falls back to the raw provider URL if Cloudinary isn't configured or the
 * re-host itself fails — never throw away a successful generation over this.
 */
async function finalizeResultUrl(resultUrl) {
  if (!isCloudinaryConfigured()) return resultUrl;
  try {
    const { url } = await rehostUrlOnCloudinary(resultUrl);
    return url;
  } catch (e) {
    console.warn('[TryOn] Cloudinary re-host failed, returning provider URL directly:', e.message);
    return resultUrl;
  }
}

/**
 * Returns true when the description clearly describes a long/full-length eastern garment
 * (kameez, shalwar, shalwar kameez, maxi, frock, gown, lehenga, saree, abaya, anarkali…).
 *
 * WHY THIS MATTERS — IDM-VTON's `is_checked_crop` flag:
 *   true  → model crops to the EXISTING garment region on the person photo (shirt/torso)
 *            and maps the new garment only onto that cropped area. Great for short western
 *            garments on partial photos; WRONG for long eastern wear — it squishes a
 *            full-length kameez into the shirt-region, making it look like a shirt.
 *   false → model maps the garment onto the whole body frame. Correct for kameez / lehenga
 *            / maxi; may slightly over-stretch on half-body photos, but far better than
 *            the crop artefact for long garments.
 */
function isLongEasternGarment(description = '') {
  const desc = description.toLowerCase();
  return /\b(kameez|shalwar|kurta|maxi|frock|gown|lehenga|saree|abaya|anarkali|sharara|gharara|palazzo)\b/.test(desc);
}

/**
 * Uses the vision fallback chain to inspect the clothing image and determine if it's
 * a full-length / long eastern garment (kameez, maxi, lehenga, saree, gown, frock)
 * vs a short western garment (shirt, t-shirt, top, pants).
 */
async function detectGarmentType(clothingInput) {
  try {
    const { imageBase64, mimeType } = await resolveImageBytes(clothingInput);
    const prompt = `
      Look at this clothing item image.
      Return ONLY a JSON object:
      {
        "isLongOrFullBody": boolean, // true if it is a full-length or long garment (like a kameez, kurti, shalwar kameez, maxi dress, lehenga, saree, gown, frock), false if it is a short top (shirt, t-shirt, crop top, jacket) or pants.
        "garmentType": "top" | "bottom" | "full-body" | "unknown"
      }
    `;
    const { data } = await analyzeImageWithProviderFallback({ prompt, imageBase64, mimeType });
    console.log('[TryOn] Vision LLM garment detection raw data:', data);
    return {
      isLongOrFullBody: data?.isLongOrFullBody === true || data?.garmentType === 'full-body',
      garmentType: data?.garmentType || 'unknown'
    };
  } catch (e) {
    console.warn('[TryOn] Clothing type detection skipped/failed:', e.message);
    return { isLongOrFullBody: false, garmentType: 'unknown' };
  }
}


async function tryReplicate({ personInput, clothingInput, description, cropMode }) {
  // .trim() guards against a stray trailing newline/space from copy-pasting the
  // key into a hosting dashboard's env var UI — Replicate rejects the whole
  // token as invalid (401) if it's not byte-for-byte exact, and a trailing
  // whitespace character is invisible when eyeballing the value.
  const REPLICATE_API_TOKEN = process.env.REPLICATE_API_KEY?.trim();
  if (!REPLICATE_API_TOKEN) {
    const e = new Error('REPLICATE_API_KEY not configured');
    e.notConfigured = true;
    throw e;
  }

  const { default: Replicate } = await import('replicate');
  const replicate = new Replicate({ auth: REPLICATE_API_TOKEN });

  // Replicate IDM-VTON accepts both data URLs and public https URLs.
  const toReplicateInput = (x) => Buffer.isBuffer(x.buffer) ? bufferToDataUrl(x.buffer, x.mimetype) : x.url;
  const humanImg = toReplicateInput(personInput);
  const garmImg = toReplicateInput(clothingInput);

  // cropMode controls is_checked_crop:
  //   'full-body' → false: map garment across the whole body frame. Required for long
  //                  eastern garments (kameez, lehenga, maxi) — without this, the model
  //                  crops to the existing shirt region and squishes the kameez to shirt-length.
  //   'auto'      → true:  crop to the detected garment/torso region — prevents the outfit
  //                  from over-stretching on partial/half-body photos (correct for western wear).
  const is_checked_crop = (cropMode === 'full-body') ? false : true;
  console.log(`[TryOn] Trying Replicate (paid, fast) — is_checked_crop=${is_checked_crop}...`);
  const output = await replicate.run(
    'yisol/idm-vton:906425dbca90663ff5427624839572cc56ea7d380343d13e2a4c4b09d3f0c30f',
    {
      input: {
        human_img: humanImg,
        garm_img: garmImg,
        garment_des: description || 'A fashionable clothing item',
        is_checked: true,
        is_checked_crop,
        denoise_steps: 30,
        seed: 42
      }
    }
  );
  const resultUrl = Array.isArray(output) ? output[0] : output;
  return { resultUrl, provider: 'replicate' };
}

/**
 * Free path — the same IDM-VTON model, hosted as a public Hugging Face Space on
 * shared "ZeroGPU" hardware (huggingface.co/spaces/yisol/IDM-VTON). No billing
 * required; a HUGGING_FACE_API_KEY (already used for embeddings) avoids the
 * strictest anonymous rate limits but isn't required. Slower and less reliable
 * than Replicate (community-shared queue) — used automatically when Replicate
 * isn't configured or fails (e.g. no credit).
 */
async function tryFreeHfSpace({ personInput, clothingInput, description, cropMode }) {
  const { Client, handle_file } = await import('@gradio/client');

  const toGradioInput = (x) => handle_file(Buffer.isBuffer(x.buffer) ? x.buffer : x.url);

  // cropMode controls is_checked_crop (see tryReplicate comment for full explanation).
  const is_checked_crop = (cropMode === 'full-body') ? false : true;
  console.log(`[TryOn] Trying free Hugging Face Space (yisol/IDM-VTON, shared hardware — may queue) — is_checked_crop=${is_checked_crop}...`);
  const app = await Client.connect('yisol/IDM-VTON', {
    hf_token: process.env.HUGGING_FACE_API_KEY || undefined
  });

  const result = await app.predict('/tryon', {
    dict: { background: toGradioInput(personInput), layers: [], composite: null },
    garm_img: toGradioInput(clothingInput),
    garment_des: description || 'a fashionable clothing item',
    is_checked: true,
    is_checked_crop,
    denoise_steps: 20,
    seed: 42
  });

  // result.data[0] is the generated try-on image (FileData: { url, path, ... }).
  const first = Array.isArray(result?.data) ? result.data[0] : null;
  const resultUrl = first?.url || (typeof first === 'string' ? first : null);
  if (!resultUrl) throw new Error('Free try-on provider returned no image');
  return { resultUrl, provider: 'huggingface-free' };
}

/**
 * OOTDiffusion — specifically handles full-body / dress / eastern outfit try-on via
 * the "Overall" garment category. Unlike IDM-VTON (which body-parses to find the
 * shirt/trouser region on the person), OOTDiffusion "Overall" mode replaces the
 * entire body silhouette, making it the correct model for shalwar kameez / maxi /
 * lehenga / gown on a person wearing a shirt+pants profile picture.
 *
 * Space: levihsu/OOTDiffusion (free, ZeroGPU, shared queue — same class as IDM-VTON free).
 * Category arg: 'Upper-body' | 'Lower-body' | 'Overall'
 */
async function tryOOTDiffusion({ personInput, clothingInput, category = 'Overall' }) {
  const { Client, handle_file } = await import('@gradio/client');
  const toInput = (x) => handle_file(Buffer.isBuffer(x.buffer) ? x.buffer : x.url);

  // Helper: extract a URL from any known OOTDiffusion output shape
  const extractUrl = (data) => {
    const flat = (Array.isArray(data) ? data : [data]).flat(3).filter(Boolean);
    for (const item of flat) {
      if (typeof item === 'string' && /^https?:\/\//.test(item)) return item;
      if (item?.url) return item.url;
      if (item?.path) return item.path;
    }
    return null;
  };

  // Positional args that work across OOTDiffusion Space versions
  const args = [
    toInput(personInput),   // vton_img
    toInput(clothingInput), // garm_img
    category,               // 'Upper-body' | 'Lower-body' | 'Overall'
    1,                      // n_samples
    20,                     // n_steps
    2,                      // image_scale (guidance scale)
    -1                      // seed
  ];

  // Try primary Space first, then a known mirror
  const spaces = ['levihsu/OOTDiffusion', 'Zheng-Chong/OOTDiffusion'];
  // Try multiple known endpoint names for the same Space
  const endpoints = ['/process_dc_hd', '/process_hd', '/run/predict'];

  for (const spaceName of spaces) {
    let app;
    try {
      console.log(`[TryOn] Connecting to OOTDiffusion space: ${spaceName}...`);
      app = await Client.connect(spaceName, {
        hf_token: process.env.HUGGING_FACE_API_KEY || undefined
      });
    } catch (connErr) {
      console.warn(`[TryOn] OOTDiffusion ${spaceName} connect failed:`, connErr.message);
      continue;
    }

    for (const endpoint of endpoints) {
      try {
        console.log(`[TryOn] OOTDiffusion ${spaceName} → trying endpoint ${endpoint} (category=${category})...`);
        const result = await app.predict(endpoint, args);
        const resultUrl = extractUrl(result?.data);
        if (resultUrl) {
          console.log(`[TryOn] OOTDiffusion succeeded via ${spaceName}${endpoint}`);
          return { resultUrl, provider: 'ootdiffusion' };
        }
        console.warn(`[TryOn] OOTDiffusion ${endpoint} returned data but no URL, trying next endpoint`);
      } catch (endpointErr) {
        console.warn(`[TryOn] OOTDiffusion ${spaceName}${endpoint} failed:`, endpointErr.message);
      }
    }
  }

  throw new Error('OOTDiffusion: all spaces and endpoints failed');
}


/**
 * Runs a single try-on pass through the provider waterfall.
 * Returns { resultUrl, provider } — resultUrl is already finalized (Cloudinary or raw).
 *
 * For LONG EASTERN GARMENTS (kameez, shalwar, kurta, maxi, lehenga…):
 *   1. OOTDiffusion "Overall" category — replaces the whole body silhouette,
 *      NOT just the shirt region. This is the correct model for shalwar kameez.
 *   2. IDM-VTON (free HF) with is_checked_crop=false — fallback.
 *   3. Replicate IDM-VTON — last-resort paid fallback.
 *
 * For SHORT / WESTERN GARMENTS (shirt, top, jacket…):
 *   1. IDM-VTON (free HF) with is_checked_crop=true — standard crop mode.
 *   2. Replicate IDM-VTON — fallback.
 */
async function runSingleTryon({ personInput, clothingInput, description, cropMode }) {
  let isLong = isLongEasternGarment(description);
  let resolvedCropMode = cropMode || (isLong ? 'full-body' : 'auto');

  // If text classification returned false and cropMode wasn't explicitly set,
  // run the clothing image through Vision LLM as a fallback to see if it is a kameez/frock/maxi.
  if (!isLong && !cropMode) {
    console.log('[TryOn] Text description check returned false. Invoking Vision LLM to inspect clothing image...');
    const detection = await detectGarmentType(clothingInput);
    if (detection.isLongOrFullBody) {
      console.log(`[TryOn] Vision LLM detected full-body/long eastern garment: ${detection.garmentType}`);
      isLong = true;
      resolvedCropMode = 'full-body';
    } else {
      console.log(`[TryOn] Vision LLM confirmed garment type: ${detection.garmentType}`);
    }
  }

  console.log(`[TryOn] Garment type: ${isLong ? 'long-eastern' : 'western'}, crop mode: ${resolvedCropMode}, description: "${(description || '').slice(0, 60)}"`);

  // ── Long eastern garments: try OOTDiffusion "Overall" first ─────────────────
  if (isLong || resolvedCropMode === 'full-body') {
    try {
      const { resultUrl, provider } = await tryOOTDiffusion({
        personInput, clothingInput, category: 'Overall'
      });
      const finalUrl = await finalizeResultUrl(resultUrl);
      console.log('[TryOn] OOTDiffusion succeeded.');
      return { resultUrl: finalUrl, provider };
    } catch (ootdErr) {
      console.warn('[TryOn] OOTDiffusion failed, falling back to IDM-VTON full-body:', ootdErr.message);
    }
  }

  // ── IDM-VTON free (primary for western, fallback for eastern) ────────────
  let freeError = null;
  try {
    const { resultUrl, provider } = await tryFreeHfSpace({
      personInput, clothingInput, description, cropMode: resolvedCropMode
    });
    const finalUrl = await finalizeResultUrl(resultUrl);
    return { resultUrl: finalUrl, provider };
  } catch (err) {
    freeError = err;
    console.warn('[TryOn] IDM-VTON free failed, trying Replicate fallback:', err.message);
  }

  // ── Replicate IDM-VTON (paid fallback) ─────────────────────────────
  const { resultUrl, provider } = await tryReplicate({
    personInput, clothingInput, description, cropMode: resolvedCropMode
  });
  const finalUrl = await finalizeResultUrl(resultUrl);
  return { resultUrl: finalUrl, provider };
}

/**
 * Shared input-parsing + photo-validation logic used by both single and multi endpoints.
 * Returns { personInput, clothingInput, description } or throws/responds on error.
 */
async function parseAndValidateInputs(req, res, { requireClothing = true } = {}) {
  const personFile   = req.files?.['person']?.[0];
  const clothingFile = req.files?.['clothing']?.[0];

  const httpUrl = (u) => typeof u === 'string' && /^https?:\/\//i.test(u);
  const personUrl   = personFile   ? null : (req.body.personUrl   || null);
  const clothingUrl = clothingFile ? null : (req.body.clothingUrl || null);

  const hasPerson   = !!personFile   || httpUrl(personUrl);
  const hasClothing = !!clothingFile || httpUrl(clothingUrl);
  if (!hasPerson || (requireClothing && !hasClothing)) {
    res.status(400).json({ error: 'A person image (or profile picture) and a clothing image are required.' });
    return null;
  }

  let personInput    = personFile   ? { buffer: personFile.buffer,   mimetype: personFile.mimetype   } : { url: personUrl };
  const clothingInput = clothingFile ? { buffer: clothingFile.buffer, mimetype: clothingFile.mimetype } : { url: clothingUrl };
  const description   = req.body.description || '';

  const photoCheck = await validatePersonPhoto(personInput);
  if (!photoCheck.ok) {
    res.status(422).json({ error: photoCheck.message, reason: 'bad_person_photo' });
    return null;
  }
  if (photoCheck.needsExtension) {
    try {
      const extendedUrl = await extendPersonPhoto(personInput);
      personInput = { url: extendedUrl };
    } catch (e) {
      console.warn('[TryOn] Photo extension failed:', e.message);
      res.status(422).json({
        error: 'This photo is almost full-length, but we couldn\'t extend it right now (our free extension tool is busy). Please try again shortly, or upload a full-length photo.',
        reason: 'bad_person_photo'
      });
      return null;
    }
  }

  return { personInput, clothingInput, description };
}

export async function virtualTryon(req, res) {
  try {
    const inputs = await parseAndValidateInputs(req, res);
    if (!inputs) return; // response already sent

    const { personInput, clothingInput, description } = inputs;

    // runSingleTryon handles the provider waterfall (HF free → Replicate) AND
    // automatically sets is_checked_crop correctly: false for long eastern garments
    // (kameez, shalwar, maxi, lehenga…) so the outfit covers the full body instead
    // of being squished into the shirt/torso crop region.
    try {
      const { resultUrl, provider } = await runSingleTryon({ personInput, clothingInput, description });
      return res.json({ success: true, resultUrl, provider, message: 'Virtual try-on generated successfully!' });
    } catch (err) {
      console.error('[TryOn] All providers failed:', err.message);
      return res.status(503).json({
        error: 'Virtual try-on is temporarily unavailable. Please try again shortly.',
        hint: err.message
      });
    }
  } catch (err) {
    console.error('[TryOn] Unexpected error:', err);
    res.status(500).json({ error: 'Virtual try-on failed. Please try again.' });
  }
}

/**
 * 2-Pass sequential try-on for multi-piece outfits (e.g. shirt + trouser).
 *
 * Pass 1: person photo  + top garment  → intermediate result image
 * Pass 2: intermediate  + bottom garment → final full-outfit result
 *
 * Accepts:
 *   Body (JSON):  { personUrl, clothingTopUrl, clothingBottomUrl, descriptionTop?, descriptionBottom? }
 *   Multipart:    person file + clothingTop file + optional clothingBottom file
 *
 * If clothingBottomUrl / clothingBottom file is absent the request falls through
 * to a normal single-pass try-on.
 */
export async function virtualTryonMulti(req, res) {
  try {
    const personFile      = req.files?.['person']?.[0];
    const clothingTopFile = req.files?.['clothingTop']?.[0];
    const clothingBotFile = req.files?.['clothingBottom']?.[0];

    const httpUrl = (u) => typeof u === 'string' && /^https?:\/\//i.test(u);

    const personUrl      = personFile      ? null : (req.body.personUrl        || null);
    const clothingTopUrl = clothingTopFile ? null : (req.body.clothingTopUrl   || null);
    const clothingBotUrl = clothingBotFile ? null : (req.body.clothingBottomUrl || null);

    const hasPerson   = !!personFile      || httpUrl(personUrl);
    const hasTop      = !!clothingTopFile || httpUrl(clothingTopUrl);
    const hasBottom   = !!clothingBotFile || httpUrl(clothingBotUrl);

    if (!hasPerson || !hasTop) {
      return res.status(400).json({ error: 'A person image and at least a top garment image are required.' });
    }

    let personInput       = personFile      ? { buffer: personFile.buffer,      mimetype: personFile.mimetype      } : { url: personUrl };
    const clothingTopInput = clothingTopFile ? { buffer: clothingTopFile.buffer, mimetype: clothingTopFile.mimetype } : { url: clothingTopUrl };
    const clothingBotInput = hasBottom
      ? (clothingBotFile ? { buffer: clothingBotFile.buffer, mimetype: clothingBotFile.mimetype } : { url: clothingBotUrl })
      : null;

    const descTop = req.body.descriptionTop    || req.body.description || 'a fashionable top garment';
    const descBot = req.body.descriptionBottom || req.body.description || 'a fashionable bottom garment';

    // Validate person photo once upfront
    const photoCheck = await validatePersonPhoto(personInput);
    if (!photoCheck.ok) {
      return res.status(422).json({ error: photoCheck.message, reason: 'bad_person_photo' });
    }
    if (photoCheck.needsExtension) {
      try {
        const extendedUrl = await extendPersonPhoto(personInput);
        personInput = { url: extendedUrl };
      } catch (e) {
        console.warn('[TryOn/Multi] Photo extension failed:', e.message);
        return res.status(422).json({
          error: 'This photo is almost full-length, but we couldn\'t extend it right now. Please try again shortly, or upload a full-length photo.',
          reason: 'bad_person_photo'
        });
      }
    }

    // ── Pass 1: apply top garment (kameez / shirt) ───────────────────────────
    // Always use 'full-body' for the top piece of a 2-piece outfit — the kameez
    // reaches the knee and must cover the full body frame, not just the shirt region.
    console.log('[TryOn/Multi] Pass 1 — applying top garment (full-body crop mode)...');
    let pass1Url, pass1Provider;
    try {
      ({ resultUrl: pass1Url, provider: pass1Provider } = await runSingleTryon({
        personInput,
        clothingInput: clothingTopInput,
        description: descTop,
        cropMode: 'full-body'
      }));
    } catch (err) {
      console.error('[TryOn/Multi] Pass 1 failed:', err.message);
      return res.status(503).json({
        error: 'Virtual try-on is temporarily unavailable (pass 1 failed). Please try again shortly.',
        hint: err.message
      });
    }

    // If no bottom garment, return pass 1 result directly
    if (!clothingBotInput) {
      return res.json({
        success: true,
        resultUrl: pass1Url,
        provider: pass1Provider,
        passes: 1,
        message: 'Virtual try-on generated successfully!'
      });
    }

    // ── Pass 2: use pass-1 result as the new person, apply bottom garment ────
    // Also full-body mode — the trouser/shalwar covers the lower body and the
    // intermediate image (person already wearing the kameez) is now the reference.
    console.log('[TryOn/Multi] Pass 2 — applying bottom garment (full-body crop mode)...');
    const intermediatePersonInput = { url: pass1Url };
    let pass2Url, pass2Provider;
    try {
      ({ resultUrl: pass2Url, provider: pass2Provider } = await runSingleTryon({
        personInput: intermediatePersonInput,
        clothingInput: clothingBotInput,
        description: descBot,
        cropMode: 'full-body'
      }));
    } catch (err) {
      // Pass 2 failed — still return the pass-1 result so the user sees *something*
      console.warn('[TryOn/Multi] Pass 2 failed, returning pass-1 result:', err.message);
      return res.json({
        success: true,
        resultUrl: pass1Url,
        provider: pass1Provider,
        passes: 1,
        partialFailure: true,
        message: 'Top garment applied. Bottom garment try-on failed — showing top only.',
        hint: err.message
      });
    }

    return res.json({
      success: true,
      resultUrl: pass2Url,
      provider: pass2Provider,
      passes: 2,
      message: 'Full outfit try-on generated successfully!'
    });

  } catch (err) {
    console.error('[TryOn/Multi] Unexpected error:', err);
    res.status(500).json({ error: 'Virtual try-on failed. Please try again.' });
  }
}
