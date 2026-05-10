import express from 'express';
import { protect } from '../middleware/auth.js';
import { saveOutfit, getOutfits, deleteOutfit } from '../controllers/outfitsController.js';

const router = express.Router();

router.post('/', protect, saveOutfit);
router.get('/', protect, getOutfits);
router.delete('/:id', protect, deleteOutfit);

export default router;
