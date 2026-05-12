/** Allowed values — must match Mongoose enums on ShoeProduct / JewelryProduct / WatchProduct. */

export const ALLOWED_SHOE_TYPES = [
  'khussa', 'kohati', 'kolhapuri', 'peshawari',
  'heel', 'pump', 'stiletto', 'block-heel', 'wedge', 'platform',
  'flat', 'ballet-flat', 'loafer', 'moccasin', 'oxford', 'monk-strap',
  'sandal', 'chappal', 'slide', 'flip-flop', 'slipper', 'mule',
  'sneaker', 'trainer', 'jogger', 'running', 'basketball',
  'boot', 'ankle-boot', 'chelsea-boot', 'long-boot', 'combat',
  'court-shoe', 'formal-dress', 'bridal-footwear',
  'school-shoe', 'comfort', 'espadrille', 'boat-shoe', 'clogs', 'other'
];

export const ALLOWED_JEWELRY_TYPES = [
  'earring', 'stud', 'hoop', 'jhumka', 'chandbali',
  'necklace', 'choker', 'mala', 'pendant-chain', 'long-necklace',
  'bracelet', 'kada', 'bangle', 'bangle-set',
  'ring', 'nose-pin', 'nath', 'maang-tikka', 'jhoomar', 'passa',
  'bridal-set', 'necklace-earring-set', 'full-jewelry-set',
  'anklet', 'payal', 'brooch', 'sherwani-button-set', 'cufflinks',
  'hair-accessory', 'other'
];

export const ALLOWED_WATCH_TYPES = [
  'analog', 'digital', 'smartwatch', 'hybrid', 'chronograph',
  'dress', 'minimalist', 'sports', 'diver-style', 'pilot',
  'couple-set', 'kids', 'pocket-style', 'other'
];

/** LLM hints → outfitCompletion behaviour */
export const COMPLETION_FOCUS_VALUES = [
  'dupatta_eastern',
  'bottom_eastern',
  'bottom_western',
  'minimal_jewelry',
  'statement_jewelry',
  'none'
];
