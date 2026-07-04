import dotenv from 'dotenv'; import path from 'path';
dotenv.config({ path: path.resolve('.env') });
import connectDB from './config/db.js';
import Clothing from './models/ClothingProduct.js';
import Shoe from './models/ShoeProduct.js';
import { SHADE_ENTRIES } from './constants/colorVocabulary.js';
await connectDB();

const NUM = { one: 1, two: 2, three: 3, four: 4, '1': 1, '2': 2, '3': 3, '4': 4 };
const shadeInText = (txt) => {
  for (const { shade, family, regex } of SHADE_ENTRIES) if (regex.test(txt)) return { shade, family };
  return null;
};
const FABRICS = ['lawn','chiffon','georgette','cotton','silk','velvet','khaddar','karandi','linen','organza','net','crepe','satin','jacquard','raw silk','tissue','banarsi','zari','muslin','voile','cambric','viscose','polyester'];

const clothing = await Clothing.find({}).lean();
const shoes = await Shoe.find({}).lean();

// ─── CLOTHING contradiction checks ──────────────────────────────────────────
const flags = { pieceVsTitle: [], stitchVsTitle: [], colorHallucinated: [], colorMissed: [], fabricNotInText: [], fabricMissed: [], dupattaInSmall: [] };
for (const p of clothing) {
  const title = (p.name || '').toLowerCase();
  const blob = [p.name, p.description, ...(p.tags || [])].join(' ').toLowerCase();

  // pieceType vs explicit count in TITLE
  const m = title.match(/\b(one|two|three|four|[1-4])[\s-]?piece\b/);
  if (m) {
    const n = NUM[m[1]];
    if (p.pieceType && p.pieceType !== `${n}-piece`)
      flags.pieceVsTitle.push(`${p.brand}: "${p.name}" title=${n}pc field=${p.pieceType}`);
  }
  // stitching vs TITLE
  if (title.includes('unstitched') && p.stitchedType !== 'unstitched')
    flags.stitchVsTitle.push(`${p.brand}: "${p.name}" -> ${p.stitchedType}`);
  if (/\bpret\b|ready to wear|\bstitched\b/.test(title) && !title.includes('unstitched') && p.stitchedType === 'unstitched')
    flags.stitchVsTitle.push(`${p.brand}: "${p.name}" -> unstitched (title says stitched/pret)`);

  // color: stored exact shade must actually appear in the text
  if (p.primaryColor && p.primaryColor !== 'Multicolor') {
    const ex = (p.primaryExactColor || '').toLowerCase();
    if (ex && !blob.includes(ex))
      flags.colorHallucinated.push(`${p.brand}: "${p.name}" color=${p.primaryColor}/${ex} not in text`);
  } else {
    // Multicolor but a real shade word sits in the TITLE → missed color
    const hit = shadeInText(title);
    if (hit) flags.colorMissed.push(`${p.brand}: "${p.name}" -> Multicolor but title has "${hit.shade}"`);
  }

  // fabric present must appear in text; fabric word in text but field empty
  if (p.fabric && !blob.includes(p.fabric.toLowerCase()))
    flags.fabricNotInText.push(`${p.brand}: "${p.name}" fabric=${p.fabric} not in text`);
  if (!p.fabric) {
    const f = FABRICS.find((x) => blob.includes(x));
    if (f) flags.fabricMissed.push(`${p.brand}: "${p.name}" -> fabric empty (text has "${f}")`);
  }

  // dupatta listed on a <=2 piece
  if ((p.pieceDetails?.includes || []).some((x) => x.includes('dupatta')) && p.pieceDetails?.totalCount <= 2)
    flags.dupattaInSmall.push(`${p.brand}: "${p.name}" total=${p.pieceDetails.totalCount} inc=[${p.pieceDetails.includes.join(',')}]`);
}

const show = (k, arr, lim = 6) => {
  console.log(`\n${k}: ${arr.length}`);
  arr.slice(0, lim).forEach((s) => console.log('   - ' + s));
};
console.log('═'.repeat(72) + `\nCLOTHING text-vs-field contradictions (n=${clothing.length})\n` + '═'.repeat(72));
show('pieceType contradicts title', flags.pieceVsTitle);
show('stitchedType contradicts title', flags.stitchVsTitle);
show('color shade not present in text (hallucinated)', flags.colorHallucinated);
show('Multicolor but title has a real color (missed)', flags.colorMissed);
show('fabric value not in text', flags.fabricNotInText);
show('fabric in text but field empty (missed)', flags.fabricMissed);
show('dupatta on <=2 piece', flags.dupattaInSmall);

// ─── SHOE contradiction checks ──────────────────────────────────────────────
const sflags = { colorHalluc: [], colorMissed: [], typeVsTitle: [] };
const TYPE_WORDS = { heel: 'heel', pump: 'pump', wedge: 'wedge', sandal: 'sandal', khussa: 'khussa', sneaker: 'sneaker', loafer: 'loafer', boot: 'boot', mule: 'mule', slipper: 'slipper', slide: 'slide' };
for (const p of shoes) {
  const title = (p.name || '').toLowerCase();
  const blob = [p.name, p.description, ...(p.tags || [])].join(' ').toLowerCase();
  if (p.primaryColor && p.primaryColor !== 'Multicolor') {
    const ex = (p.primaryExactColor || '').toLowerCase();
    if (ex && !blob.includes(ex)) sflags.colorHalluc.push(`${p.brand}: "${p.name}" color=${ex} not in text`);
  } else {
    const hit = shadeInText(title);
    if (hit) sflags.colorMissed.push(`${p.brand}: "${p.name}" -> Multicolor but title has "${hit.shade}"`);
  }
  // if a clear silhouette word is in the title, shoeType should relate
  for (const [w, t] of Object.entries(TYPE_WORDS)) {
    if (title.includes(w)) {
      const ok = p.shoeType === t || (t === 'heel' && ['heel','block-heel','stiletto','pump','wedge','platform'].includes(p.shoeType))
        || (t === 'sandal' && ['sandal','slide','flip-flop'].includes(p.shoeType));
      if (!ok) sflags.typeVsTitle.push(`${p.brand}: "${p.name}" title~${w} field=${p.shoeType}`);
      break;
    }
  }
}
console.log('\n' + '═'.repeat(72) + `\nSHOE text-vs-field contradictions (n=${shoes.length})\n` + '═'.repeat(72));
show('color shade not in text (hallucinated)', sflags.colorHalluc);
show('Multicolor but title has a real color (missed)', sflags.colorMissed);
show('shoeType contradicts title silhouette', sflags.typeVsTitle);

// ─── Full dumps for manual eyeballing ───────────────────────────────────────
console.log('\n' + '═'.repeat(72) + '\nFULL DUMPS — 1 per clothing brand (title + desc + fields)\n' + '═'.repeat(72));
const brands = [...new Set(clothing.map((p) => p.brand))];
for (const b of brands) {
  const p = clothing.find((x) => x.brand === b);
  if (!p) continue;
  console.log(`\n[${b}] ${p.name}`);
  console.log(`  desc: ${(p.description || '').slice(0, 150).replace(/\s+/g, ' ')}`);
  console.log(`  sub=${p.subCategory} piece=${p.pieceType} stitch=${p.stitchedType} inc=[${(p.pieceDetails?.includes||[]).join('+')}] dress=${p.dressStyle} pattern=${p.pattern} fabric=${p.fabric} color=${p.primaryColor}/${p.primaryExactColor} season=${(p.season||[]).join(',')} occ=${(p.occasion||[]).join(',')}`);
}
process.exit(0);
