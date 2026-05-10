import Outfit from '../models/Outfit.js';

export async function saveOutfit(req, res) {
  try {
    const { heroProductId, accessoryIds, reasoning, name, occasion } = req.body;

    const outfit = await Outfit.create({
      user: req.user._id,
      name: name || 'New Curated Fit',
      heroProduct: heroProductId,
      accessories: accessoryIds || [],
      stylistReasoning: reasoning,
      occasion: occasion || []
    });

    const populatedOutfit = await outfit.populate(['heroProduct', 'accessories']);
    res.status(201).json(populatedOutfit);
  } catch (err) {
    console.error('Error saving outfit:', err);
    res.status(500).json({ error: 'Failed to save outfit' });
  }
}

export async function getOutfits(req, res) {
  try {
    const outfits = await Outfit.find({ user: req.user._id })
      .populate(['heroProduct', 'accessories'])
      .sort('-createdAt');
    res.json(outfits);
  } catch {
    res.status(500).json({ error: 'Failed to fetch outfits' });
  }
}

export async function deleteOutfit(req, res) {
  try {
    const outfit = await Outfit.findOne({ _id: req.params.id, user: req.user._id });
    if (!outfit) return res.status(404).json({ error: 'Outfit not found' });

    await outfit.deleteOne();
    res.json({ message: 'Outfit removed' });
  } catch {
    res.status(500).json({ error: 'Failed to delete outfit' });
  }
}
