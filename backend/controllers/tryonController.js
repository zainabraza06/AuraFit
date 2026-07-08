function bufferToDataUrl(buffer, mimetype) {
  return `data:${mimetype};base64,${buffer.toString('base64')}`;
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

    const REPLICATE_API_TOKEN = process.env.REPLICATE_API_KEY;
    if (!REPLICATE_API_TOKEN) {
      return res.status(503).json({
        error: 'REPLICATE_API_KEY not configured.',
        hint: 'Add REPLICATE_API_KEY to your .env file. Get a free token at replicate.com'
      });
    }

    const { default: Replicate } = await import('replicate');
    const replicate = new Replicate({ auth: REPLICATE_API_TOKEN });

    // Replicate IDM-VTON accepts both data URLs and public https URLs.
    const personDataUrl   = personFile   ? bufferToDataUrl(personFile.buffer, personFile.mimetype)   : personUrl;
    const clothingDataUrl = clothingFile ? bufferToDataUrl(clothingFile.buffer, clothingFile.mimetype) : clothingUrl;

    console.log('[TryOn] Running IDM-VTON on Replicate...');

    const output = await replicate.run(
      'yisol/idm-vton:906425dbca90663ff5427624839572cc56ea7d380343d13e2a4c4b09d3f0c30f',
      {
        input: {
          human_img: personDataUrl,
          garm_img:  clothingDataUrl,
          garment_des: req.body.description || 'A fashionable clothing item',
          is_checked: true,
          is_checked_crop: false,
          denoise_steps: 30,
          seed: 42
        }
      }
    );

    const resultUrl = Array.isArray(output) ? output[0] : output;

    res.json({
      success: true,
      resultUrl,
      message: 'Virtual try-on generated successfully!'
    });
  } catch (err) {
    console.error('[TryOn] Error:', err);

    if (err.message?.includes('401') || err.message?.includes('Unauthorized')) {
      return res.status(401).json({ error: 'Invalid Replicate API key. Please check your REPLICATE_API_KEY.' });
    }
    if (err.message?.includes('402') || err.message?.includes('Insufficient credit')) {
      return res.status(402).json({
        error: 'Replicate account has no credit',
        hint: 'Add billing credit at replicate.com/account/billing, then try again in a few minutes.'
      });
    }
    if (err.message?.includes('rate limit') || err.message?.includes('429')) {
      return res.status(429).json({ error: 'Replicate rate limit reached. Please try again in a minute.' });
    }

    res.status(500).json({ error: 'Virtual try-on failed. Please try again.' });
  }
}
