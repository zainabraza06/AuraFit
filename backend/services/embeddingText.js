/**
 * Builds the text blob sent to HuggingFace / sentence embedding models.
 * Includes the full stored description (up to ClothingProduct schema max).
 */
export function buildClothingEmbeddingText(product) {
  const desc = (product.description || '').trim();
  const tags = Array.isArray(product.tags) ? product.tags : [];
  const occ = Array.isArray(product.occasion) ? product.occasion : [];
  const sty = Array.isArray(product.style) ? product.style : [];
  const cols = Array.isArray(product.colors) ? product.colors : [];
  const labeled = [
    occ.length ? `Occasion: ${occ.join(', ')}` : '',
    product.primaryColor ? `Primary color: ${product.primaryColor}` : '',
    cols.length ? `All colors: ${cols.join(', ')}` : '',
    sty.length ? `Style: ${sty.join(', ')}` : '',
    product.dressStyle ? `Garment / silhouette: ${product.dressStyle}` : '',
    product.gender ? `Gender: ${product.gender}` : ''
  ].filter((x) => x && String(x).trim());
  const rest = [
    product.name,
    product.brand,
    product.gender,
    product.category,
    product.subCategory,
    product.dressStyle,
    product.pattern,
    product.stitchedType,
    product.pieceType,
    product.fabric,
    product.primaryColor,
    product.colorFamily,
    ...tags,
    ...sty,
    ...occ,
    ...cols,
    ...(product.trendTags || []),
    desc
  ].filter((x) => x !== undefined && x !== null && String(x).trim() !== '');
  return [...labeled, ...rest].join('\n');
}

/** Shoe embedding text — silhouette/type + material + occasion + colour + description. */
export function buildShoeEmbeddingText(product) {
  const tags = Array.isArray(product.tags) ? product.tags : [];
  const occ = Array.isArray(product.occasion) ? product.occasion : [];
  const cols = Array.isArray(product.colors) ? product.colors : [];
  const labeled = [
    'Category: footwear (shoes)',
    product.shoeType ? `Shoe type: ${product.shoeType}` : '',
    product.subCategory ? `Style: ${product.subCategory}` : '',
    occ.length ? `Occasion: ${occ.join(', ')}` : '',
    product.primaryColor ? `Primary color: ${product.primaryColor}` : '',
    cols.length ? `All colors: ${cols.join(', ')}` : '',
    product.heelHeight ? `Heel height: ${product.heelHeight}` : '',
    product.closure ? `Closure: ${product.closure}` : '',
    product.upperMaterial ? `Material: ${product.upperMaterial}` : ''
  ].filter((x) => x && String(x).trim());
  const rest = [
    product.name, product.brand, product.gender, 'shoes',
    product.shoeType, product.subCategory, product.primaryColor, product.colorFamily,
    ...tags, ...(product.style || []), ...occ, ...cols, (product.description || '').trim()
  ].filter((x) => x !== undefined && x !== null && String(x).trim() !== '');
  return [...labeled, ...rest].join('\n');
}

/** Jewelry embedding text — type/category + metal/stone + occasion + colour + description. */
export function buildJewelryEmbeddingText(product) {
  const tags = Array.isArray(product.tags) ? product.tags : [];
  const occ = Array.isArray(product.occasion) ? product.occasion : [];
  const cols = Array.isArray(product.colors) ? product.colors : [];
  const labeled = [
    'Category: jewellery',
    product.jewelryType ? `Jewellery type: ${product.jewelryType}` : '',
    product.jewelryCategory ? `Worn on: ${product.jewelryCategory}` : '',
    occ.length ? `Occasion: ${occ.join(', ')}` : '',
    product.primaryColor ? `Primary color: ${product.primaryColor}` : '',
    cols.length ? `All colors: ${cols.join(', ')}` : '',
    product.metalFinish ? `Metal: ${product.metalFinish}` : '',
    product.stoneWork && product.stoneWork !== 'none' ? `Stone work: ${product.stoneWork}` : ''
  ].filter((x) => x && String(x).trim());
  const rest = [
    product.name, product.brand, product.gender, 'jewellery',
    product.jewelryType, product.jewelryCategory, product.primaryColor, product.colorFamily,
    ...tags, ...(product.style || []), ...occ, ...cols, (product.description || '').trim()
  ].filter((x) => x !== undefined && x !== null && String(x).trim() !== '');
  return [...labeled, ...rest].join('\n');
}
