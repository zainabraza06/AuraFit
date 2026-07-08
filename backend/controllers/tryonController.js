function bufferToDataUrl(buffer, mimetype) {
  return `data:${mimetype};base64,${buffer.toString('base64')}`;
}

/** Paid path — Replicate-hosted IDM-VTON. Fast (~30-90s), needs REPLICATE_API_KEY + account credit. */
async function tryReplicate({ personInput, clothingInput, description }) {
  const REPLICATE_API_TOKEN = process.env.REPLICATE_API_KEY;
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

  console.log('[TryOn] Trying Replicate (paid, fast)...');
  const output = await replicate.run(
    'yisol/idm-vton:906425dbca90663ff5427624839572cc56ea7d380343d13e2a4c4b09d3f0c30f',
    {
      input: {
        human_img: humanImg,
        garm_img: garmImg,
        garment_des: description || 'A fashionable clothing item',
        is_checked: true,
        is_checked_crop: false,
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
async function tryFreeHfSpace({ personInput, clothingInput, description }) {
  const { Client, handle_file } = await import('@gradio/client');

  const toGradioInput = (x) => handle_file(Buffer.isBuffer(x.buffer) ? x.buffer : x.url);

  console.log('[TryOn] Trying free Hugging Face Space (yisol/IDM-VTON, shared hardware — may queue)...');
  const app = await Client.connect('yisol/IDM-VTON', {
    hf_token: process.env.HUGGING_FACE_API_KEY || undefined
  });

  const result = await app.predict('/tryon', {
    dict: { background: toGradioInput(personInput), layers: [], composite: null },
    garm_img: toGradioInput(clothingInput),
    garment_des: description || 'a fashionable clothing item',
    is_checked: true,
    is_checked_crop: false,
    denoise_steps: 20,
    seed: 42
  });

  // result.data[0] is the generated try-on image (FileData: { url, path, ... }).
  const first = Array.isArray(result?.data) ? result.data[0] : null;
  const resultUrl = first?.url || (typeof first === 'string' ? first : null);
  if (!resultUrl) throw new Error('Free try-on provider returned no image');
  return { resultUrl, provider: 'huggingface-free' };
}

export async function virtualTryon(req, res) {
  try {
    const personFile  = req.files?.['person']?.[0];
    const clothingFile = req.files?.['clothing']?.[0];

    // Two ways to supply images:
    //  1. multipart file uploads (person / clothing) — used by the /try-on page
    //  2. direct URLs in the JSON body (personUrl / clothingUrl) — used by the
    //     "Try On Yourself" button on product cards (profile pic + product image).
    const httpUrl = (u) => typeof u === 'string' && /^https?:\/\//i.test(u);
    const personUrl   = personFile   ? null : (req.body.personUrl || null);
    const clothingUrl = clothingFile ? null : (req.body.clothingUrl || null);

    const hasPerson   = !!personFile   || httpUrl(personUrl);
    const hasClothing = !!clothingFile || httpUrl(clothingUrl);
    if (!hasPerson || !hasClothing) {
      return res.status(400).json({
        error: 'A person image (or profile picture) and a clothing image are required.'
      });
    }

    const personInput   = personFile   ? { buffer: personFile.buffer, mimetype: personFile.mimetype }   : { url: personUrl };
    const clothingInput = clothingFile ? { buffer: clothingFile.buffer, mimetype: clothingFile.mimetype } : { url: clothingUrl };
    const description = req.body.description;

    let replicateError = null;
    try {
      const { resultUrl, provider } = await tryReplicate({ personInput, clothingInput, description });
      return res.json({ success: true, resultUrl, provider, message: 'Virtual try-on generated successfully!' });
    } catch (err) {
      replicateError = err;
      if (!err.notConfigured) console.warn('[TryOn] Replicate failed, falling back to free provider:', err.message);
    }

    // Replicate unavailable/failed (no key, no credit, rate limited, etc.) — fall
    // back to the free Hugging Face Space automatically.
    try {
      const { resultUrl, provider } = await tryFreeHfSpace({ personInput, clothingInput, description });
      return res.json({
        success: true,
        resultUrl,
        provider,
        message: 'Virtual try-on generated using our free AI provider (may be slower than usual).'
      });
    } catch (freeErr) {
      console.error('[TryOn] Free provider also failed:', freeErr.message);
      return res.status(503).json({
        error: 'Virtual try-on is temporarily unavailable',
        hint: replicateError?.notConfigured
          ? 'The free provider (huggingface.co/spaces/yisol/IDM-VTON) is busy or down — please try again shortly.'
          : `Replicate: ${replicateError?.message || 'failed'}. Free fallback also failed — please try again shortly.`
      });
    }
  } catch (err) {
    console.error('[TryOn] Unexpected error:', err);
    res.status(500).json({ error: 'Virtual try-on failed. Please try again.' });
  }
}
