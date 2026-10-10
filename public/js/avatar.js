// Draws a chibi trainer-style character as SVG from a `look` object and class id.
// Original art: bold outlines, cel shading, big head. Canvas is 200 x 240.
import { SKIN, HAIR_COLORS, EYE_COLORS, OUTFIT_COLORS, DEFAULT_LOOK } from './options.js';

const INK = '#2A2238';
const O = `stroke="${INK}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"`;
const O2 = `stroke="${INK}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"`;
let uid = 0;

export function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c) => Math.max(0, Math.min(255, Math.round(amt < 0 ? c * (1 + amt) : c + (255 - c) * amt)));
  const r = f(n >> 16), g = f((n >> 8) & 255), b = f(n & 255);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}

const star = (cx, cy, r, fill, extra = '') => {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    pts.push((cx + rr * Math.cos(a)).toFixed(1) + ',' + (cy + rr * Math.sin(a)).toFixed(1));
  }
  return `<polygon points="${pts.join(' ')}" fill="${fill}" ${extra}/>`;
};

// ---------- hair ----------
const HAIR_BACK = {
  bob: 'M50,90 C46,50 74,32 100,32 C126,32 154,50 150,90 L152,120 Q140,128 128,120 L72,120 Q60,128 48,120 Z',
  long: 'M50,90 C46,50 74,32 100,32 C126,32 154,50 150,90 L156,160 Q128,170 100,164 Q72,170 44,160 Z',
  ponytail: 'M132,48 C172,46 182,104 160,134 C156,110 150,86 128,70 Z',
  wavy: 'M50,90 C46,50 74,32 100,32 C126,32 154,50 150,90 C160,110 146,122 156,142 Q132,152 118,140 L82,140 Q68,152 44,142 C54,122 40,110 50,90 Z',
  bun: 'M100,12 a17,17 0 1 1 -0.1,0 Z',
  curly: 'M44,104 a13,13 0 0 1 8,-24 a13,13 0 0 1 96,0 a13,13 0 0 1 8,24 a12,12 0 0 1 -6,22 L50,126 a12,12 0 0 1 -6,-22 Z',
};
const FRONT_SWEPT = 'M52,92 C46,50 76,32 104,34 C132,36 154,56 148,92 C146,80 140,70 132,64 C120,72 100,70 84,60 C78,70 64,80 52,92 Z';
const FRONT_PART = 'M54,94 C50,52 76,36 100,36 C124,36 150,52 146,94 C140,76 124,62 100,58 C76,62 60,76 54,94 Z';
const HAIR_FRONT = {
  short: FRONT_SWEPT,
  spiky: 'M50,90 L44,66 L58,62 L56,44 L74,46 L80,30 L96,40 L108,26 L118,42 L134,34 L136,52 L154,54 L146,70 L152,90 C144,76 134,68 124,64 L116,74 L106,64 L94,76 L86,64 L72,74 C64,78 56,84 50,90 Z',
  bob: 'M54,94 C50,52 76,36 100,36 C124,36 150,52 146,94 C144,84 140,74 136,70 L64,70 C60,74 56,84 54,94 Z',
  long: FRONT_PART,
  ponytail: FRONT_SWEPT,
  curly: 'M52,92 a10,10 0 0 1 2,-20 a12,12 0 0 1 10,-18 a12,12 0 0 1 16,-12 a12,12 0 0 1 20,-4 a12,12 0 0 1 20,4 a12,12 0 0 1 16,12 a12,12 0 0 1 10,18 a10,10 0 0 1 2,20 C140,80 120,72 100,72 C80,72 60,80 52,92 Z',
  braid: FRONT_PART,
  bun: FRONT_PART,
  buzz: 'M58,80 C58,52 78,40 100,40 C122,40 142,52 142,80 C130,66 116,60 100,60 C84,60 70,66 58,80 Z',
  wavy: FRONT_SWEPT,
};

function hairBack(style, c) {
  const d = HAIR_BACK[style];
  return d ? `<path d="${d}" fill="${c}" ${O}/>` : '';
}

function hairFront(style, c) {
  const hi = shade(c, 0.35);
  let s = `<path d="${HAIR_FRONT[style]}" fill="${c}" ${O}/>`;
  if (style === 'bob') {
    s += `<path d="M54,88 L52,122 Q60,127 67,120 L65,80 Z" fill="${c}" ${O}/><path d="M146,88 L148,122 Q140,127 133,120 L135,80 Z" fill="${c}" ${O}/>`;
  }
  if (style === 'braid') {
    for (let i = 0; i < 4; i++) s += `<ellipse cx="${55 + i}" cy="${108 + i * 14}" rx="8" ry="9" fill="${c}" ${O2}/>`;
    s += `<circle cx="59" cy="164" r="4" fill="${hi}" ${O2}/>`;
  }
  if (style === 'ponytail') s += `<circle cx="134" cy="52" r="5" fill="${hi}" ${O2}/>`;
  if (style !== 'buzz') s += `<path d="M78,48 Q92,40 108,42" fill="none" stroke="${hi}" stroke-width="4" stroke-linecap="round" opacity=".8"/>`;
  return s;
}

// ---------- face ----------
function eyes(style, ec) {
  const L = 82, R = 118, Y = 92;
  const open = (x, big = false) => {
    const ry = big ? 10 : 8.5;
    return `<ellipse cx="${x}" cy="${Y}" rx="${big ? 7 : 6}" ry="${ry}" fill="${INK}"/>`
      + `<ellipse cx="${x}" cy="${Y + 2}" rx="${big ? 5 : 4.2}" ry="${ry - 3.5}" fill="${ec}"/>`
      + `<circle cx="${x - 2}" cy="${Y - 3.5}" r="${big ? 3 : 2.5}" fill="#fff"/>`
      + (big ? `<circle cx="${x + 2.5}" cy="${Y + 4}" r="1.6" fill="#fff"/>` : '');
  };
  switch (style) {
    case 'happy':
      return [L, R].map((x) => `<path d="M${x - 7},${Y + 3} Q${x},${Y - 8} ${x + 7},${Y + 3}" fill="none" stroke="${INK}" stroke-width="3.5" stroke-linecap="round"/>`).join('');
    case 'sparkle':
      return open(L, true) + open(R, true) + star(L + 3, Y - 4, 3, '#fff') + star(R + 3, Y - 4, 3, '#fff');
    case 'calm':
      return [L, R].map((x) => open(x) + `<path d="M${x - 8},${Y - 3} Q${x},${Y - 9} ${x + 8},${Y - 3} L${x + 8},${Y - 10} L${x - 8},${Y - 10} Z" fill="var(--skin)"/>`
        + `<path d="M${x - 8},${Y - 3} Q${x},${Y - 8} ${x + 8},${Y - 3}" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`).join('');
    case 'bold':
      return open(L) + open(R)
        + `<path d="M${L - 9},${Y - 14} L${L + 6},${Y - 11}" stroke="${INK}" stroke-width="3.5" stroke-linecap="round"/>`
        + `<path d="M${R + 9},${Y - 14} L${R - 6},${Y - 11}" stroke="${INK}" stroke-width="3.5" stroke-linecap="round"/>`;
    default:
      return open(L) + open(R);
  }
}

function mouth(style) {
  const Y = 108;
  switch (style) {
    case 'grin':
      return `<path d="M91,${Y - 2} Q100,${Y - 1} 109,${Y - 2} Q107,${Y + 9} 100,${Y + 9} Q93,${Y + 9} 91,${Y - 2} Z" fill="#8E2F3C" ${O2}/>`
        + `<path d="M95,${Y + 6} Q100,${Y + 3} 105,${Y + 6}" fill="#F38BA0" stroke="none"/>`;
    case 'open':
      return `<ellipse cx="100" cy="${Y + 2}" rx="4.5" ry="5.5" fill="#8E2F3C" ${O2}/>`;
    case 'soft':
      return `<path d="M95,${Y + 1} Q100,${Y + 4} 105,${Y + 1}" fill="none" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/>`;
    default:
      return `<path d="M92,${Y - 1} Q100,${Y + 7} 108,${Y - 1}" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`;
  }
}

// ---------- hats ----------
function hat(kind, oc, ac) {
  switch (kind) {
    case 'cap':
      return `<path d="M54,74 C54,44 76,32 100,32 C124,32 146,44 146,74 Z" fill="${oc}" ${O}/>`
        + `<path d="M82,72 C82,50 90,36 100,35 C110,36 118,50 118,72 Z" fill="#FBF7EE" ${O2}/>`
        + star(100, 56, 8, ac, O2)
        + `<path d="M50,74 Q100,64 152,74 Q160,82 148,85 Q100,76 54,85 Q42,82 50,74 Z" fill="${shade(oc, -0.25)}" ${O}/>`;
    case 'veil':
      return `<path d="M50,96 C42,46 72,28 100,28 C128,28 158,46 150,96 L158,152 Q132,142 126,120 C138,96 132,68 100,64 C68,68 62,96 74,120 Q68,142 42,152 Z" fill="#F7F3EA" ${O}/>`
        + `<path d="M74,118 C62,96 70,70 100,67 C130,70 138,96 126,118" fill="none" stroke="#D9CFBF" stroke-width="3" stroke-dasharray="2 5" stroke-linecap="round"/>`;
    case 'bandana':
      return `<path d="M54,72 C58,46 80,34 100,34 C120,34 142,46 146,72 Q100,58 54,72 Z" fill="${ac}" ${O}/>`
        + `<circle cx="78" cy="56" r="2.5" fill="#fff"/><circle cx="100" cy="46" r="2.5" fill="#fff"/><circle cx="122" cy="56" r="2.5" fill="#fff"/>`
        + `<path d="M144,68 L164,62 L156,76 Z" fill="${ac}" ${O2}/><path d="M144,70 L160,86 L148,84 Z" fill="${shade(ac, -0.2)}" ${O2}/>`;
    case 'explorer':
      return `<ellipse cx="100" cy="66" rx="58" ry="11" fill="${shade('#C9A46A', -0.1)}" ${O}/>`
        + `<path d="M68,64 C66,36 82,26 100,26 C118,26 134,36 132,64 Z" fill="#C9A46A" ${O}/>`
        + `<path d="M68,56 Q100,62 132,56 L132,64 Q100,70 68,64 Z" fill="${ac}" ${O2}/>`;
    case 'beanie':
      return `<path d="M56,78 C52,44 76,28 100,28 C124,28 148,44 144,78 Z" fill="${ac}" ${O}/>`
        + `<path d="M52,70 Q100,58 148,70 L148,82 Q100,70 52,82 Z" fill="${shade(ac, -0.2)}" ${O}/>`
        + `<circle cx="100" cy="24" r="9" fill="${shade(ac, 0.4)}" ${O}/>`;
    case 'headband':
      return `<path d="M56,74 Q100,50 144,74 L144,82 Q100,58 56,82 Z" fill="${ac}" ${O2}/>` + star(132, 70, 6, '#FFD84D', O2);
    default:
      return '';
  }
}

// ---------- gear ----------
function backBehind(kind, ac) {
  if (kind === 'cape') return `<path d="M72,130 L128,130 L152,208 Q100,218 48,208 Z" fill="${shade(ac, -0.15)}" ${O}/>`;
  if (kind === 'backpack') return `<rect x="60" y="124" width="80" height="50" rx="14" fill="#9A6A3F" ${O}/>`;
  return '';
}
function backFront(kind, ac) {
  if (kind === 'satchel') {
    return `<path d="M122,128 L72,170" stroke="${INK}" stroke-width="9" stroke-linecap="round"/>`
      + `<path d="M122,128 L72,170" stroke="#8A5A3B" stroke-width="5" stroke-linecap="round"/>`
      + `<rect x="56" y="160" width="28" height="24" rx="6" fill="#A86E43" ${O}/>`
      + `<path d="M56,166 Q70,176 84,166 L84,164 Q84,160 78,160 L62,160 Q56,160 56,164 Z" fill="#8A5A3B" ${O2}/>`
      + `<circle cx="70" cy="172" r="2.5" fill="#FFD84D" ${O2}/>`;
  }
  if (kind === 'backpack') {
    return `<path d="M82,128 L84,168" stroke="#7B5230" stroke-width="7" stroke-linecap="round"/><path d="M118,128 L116,168" stroke="#7B5230" stroke-width="7" stroke-linecap="round"/>`;
  }
  if (kind === 'cape') return `<circle cx="100" cy="130" r="5" fill="#FFD84D" ${O2}/>`;
  return '';
}

function handItem(kind, ac) {
  const x = 140, y = 170;
  switch (kind) {
    case 'lantern':
      return `<circle cx="${x}" cy="${y + 14}" r="22" fill="#FFE27A" opacity=".35"/>`
        + `<path d="M${x - 7},${y - 2} Q${x},${y - 14} ${x + 7},${y - 2}" fill="none" ${O2}/>`
        + `<rect x="${x - 9}" y="${y}" width="18" height="24" rx="4" fill="#FFE9A3" ${O2}/>`
        + `<rect x="${x - 11}" y="${y - 1}" width="22" height="5" rx="2" fill="#C99A2E" ${O2}/><rect x="${x - 11}" y="${y + 21}" width="22" height="5" rx="2" fill="#C99A2E" ${O2}/>`
        + `<ellipse cx="${x}" cy="${y + 12}" rx="3.5" ry="6" fill="#FF9F1C"/>`;
    case 'staff':
      return `<path d="M${x + 2},${y + 48} L${x + 2},${y - 50}" stroke="${INK}" stroke-width="9" stroke-linecap="round"/>`
        + `<path d="M${x + 2},${y + 48} L${x + 2},${y - 50}" stroke="#A8743F" stroke-width="5" stroke-linecap="round"/>`
        + `<path d="M${x + 2},${y - 50} C${x + 2},${y - 66} ${x + 22},${y - 66} ${x + 20},${y - 50} C${x + 18},${y - 42} ${x + 10},${y - 44} ${x + 12},${y - 50}" fill="none" stroke="${INK}" stroke-width="9" stroke-linecap="round"/>`
        + `<path d="M${x + 2},${y - 50} C${x + 2},${y - 66} ${x + 22},${y - 66} ${x + 20},${y - 50} C${x + 18},${y - 42} ${x + 10},${y - 44} ${x + 12},${y - 50}" fill="none" stroke="#A8743F" stroke-width="5" stroke-linecap="round"/>`;
    case 'book':
      return `<g transform="rotate(-12 ${x} ${y})"><rect x="${x - 12}" y="${y - 16}" width="26" height="32" rx="3" fill="${ac}" ${O2}/>`
        + `<rect x="${x + 10}" y="${y - 14}" width="4" height="28" fill="#FBF7EE"/>`
        + star(x + 1, y - 2, 6, '#FFD84D', O2) + `</g>`;
    case 'scroll':
      return `<rect x="${x - 8}" y="${y - 18}" width="18" height="36" rx="3" fill="#F3E3B5" ${O2}/>`
        + `<rect x="${x - 12}" y="${y - 22}" width="26" height="7" rx="3.5" fill="#D9B56C" ${O2}/><rect x="${x - 12}" y="${y + 15}" width="26" height="7" rx="3.5" fill="#D9B56C" ${O2}/>`
        + `<path d="M${x - 3},${y - 8} L${x + 5},${y - 8} M${x - 3},${y - 2} L${x + 5},${y - 2} M${x - 3},${y + 4} L${x + 3},${y + 4}" stroke="#B08A4A" stroke-width="2" stroke-linecap="round"/>`;
    case 'flag':
      return `<path d="M${x + 2},${y + 40} L${x + 2},${y - 60}" stroke="${INK}" stroke-width="7" stroke-linecap="round"/>`
        + `<path d="M${x + 2},${y + 40} L${x + 2},${y - 60}" stroke="#C99A2E" stroke-width="3.5" stroke-linecap="round"/>`
        + `<path d="M${x + 4},${y - 58} L${x + 44},${y - 48} L${x + 4},${y - 30} Z" fill="${ac}" ${O2}/>` + star(x + 18, y - 45, 6, '#fff');
    default:
      return '';
  }
}

// ---------- body ----------
function legs(look, oc, ac, classId) {
  const pantsColor = classId === 'CLS05' ? oc : '#3D4466';
  const shoe = '#5A3A2A';
  const shoes = `<ellipse cx="87" cy="215" rx="13" ry="7.5" fill="${shoe}" ${O}/><ellipse cx="113" cy="215" rx="13" ry="7.5" fill="${shoe}" ${O}/>`
    + `<path d="M79,213 Q86,210 93,213 M107,213 Q114,210 121,213" stroke="${shade(shoe, 0.35)}" stroke-width="2.5" fill="none" stroke-linecap="round"/>`;
  if (look.bottom === 'skirt') {
    return `<path d="M74,168 L126,168 L136,208 Q100,215 64,208 Z" fill="${shade(oc, -0.3)}" ${O}/>`
      + `<path d="M84,176 L80,206 M100,176 L100,210 M116,176 L120,206" stroke="${shade(oc, -0.45)}" stroke-width="2" stroke-linecap="round"/>` + shoes;
  }
  return `<rect x="79" y="168" width="18" height="44" rx="7" fill="${pantsColor}" ${O}/><rect x="103" y="168" width="18" height="44" rx="7" fill="${pantsColor}" ${O}/>` + shoes;
}

function torso(look, oc, ac, classId) {
  const w = look.body === 'b' ? 3 : 0;
  const L = 68 + w, R = 132 - w;
  const dark = shade(oc, -0.22);
  const base = `M${L},140 Q${L},128 ${L + 12},127 L${R - 12},127 Q${R},128 ${R},140 L${R + 2},174 Q100,181 ${L - 2},174 Z`;
  let s = '';
  switch (classId) {
    case 'CLS01': // Sage: long robe with sash
      s += `<path d="M${L},140 Q${L},128 ${L + 12},127 L${R - 12},127 Q${R},128 ${R},140 L${R + 8},206 Q100,214 ${L - 8},206 Z" fill="${oc}" ${O}/>`;
      s += `<path d="M${R - 4},150 L${R + 6},204 Q${R - 4},207 ${R - 8},206 Z" fill="${dark}" opacity=".7"/>`;
      s += `<path d="M90,127 L100,146 L110,127" fill="#FBF7EE" ${O2}/>`;
      s += `<path d="M${L + 1},160 Q100,170 ${R - 1},160 L${R},170 Q100,180 ${L},170 Z" fill="${ac}" ${O2}/>`;
      s += `<path d="M112,170 L118,192 L108,190 Z" fill="${ac}" ${O2}/>`;
      return s;
    case 'CLS02': // Messenger: trainer jacket
      s += `<path d="${base}" fill="${oc}" ${O}/>`;
      s += `<path d="M88,127 L100,160 L112,127 Z" fill="#FBF7EE" ${O2}/>`;
      s += `<path d="M100,160 L100,178" stroke="${INK}" stroke-width="2.4"/>`;
      s += `<path d="M86,124 L80,138 L92,132 Z M114,124 L120,138 L108,132 Z" fill="${ac}" ${O2}/>`;
      s += `<path d="M${L + 2},150 L${L + 14},150 M${R - 2},150 L${R - 14},150" stroke="${ac}" stroke-width="4" stroke-linecap="round"/>`;
      s += `<path d="M${R - 6},140 L${R - 2},172 Q${R - 8},176 ${R - 12},175 Z" fill="${dark}" opacity=".6"/>`;
      return s;
    case 'CLS03': // Guardian: tunic, shoulder guards, belt
      s += `<path d="${base}" fill="${oc}" ${O}/>`;
      s += `<path d="M${R - 6},140 L${R - 2},172 Q${R - 8},176 ${R - 12},175 Z" fill="${dark}" opacity=".6"/>`;
      s += `<path d="M100,138 L112,142 L111,154 Q100,162 89,154 L88,142 Z" fill="#FFD84D" ${O2}/>`;
      s += `<rect x="${L}" y="162" width="${R - L}" height="9" rx="3" fill="${ac}" ${O2}/><rect x="94" y="160" width="12" height="13" rx="3" fill="#FFD84D" ${O2}/>`;
      s += `<ellipse cx="${L + 2}" cy="133" rx="12" ry="9" fill="${ac}" ${O}/><ellipse cx="${R - 2}" cy="133" rx="12" ry="9" fill="${ac}" ${O}/>`;
      return s;
    case 'CLS04': // Encourager: hoodie with scarf
      s += `<path d="${base}" fill="${oc}" ${O}/>`;
      s += `<path d="M84,156 L116,156 L120,172 Q100,176 80,172 Z" fill="${dark}" ${O2}/>`;
      s += `<path d="M${R - 6},140 L${R - 2},172 Q${R - 8},176 ${R - 12},175 Z" fill="${dark}" opacity=".6"/>`;
      s += `<path d="M80,124 Q100,140 120,124 L122,132 Q100,148 78,132 Z" fill="${ac}" ${O}/>`;
      s += `<path d="M112,134 L118,162 L108,160 L106,138 Z" fill="${ac}" ${O2}/><path d="M110,150 L117,150" stroke="${shade(ac, -0.3)}" stroke-width="2"/>`;
      return s;
    case 'CLS05': // Builder: shirt + overalls
      s += `<path d="${base}" fill="${ac}" ${O}/>`;
      s += `<path d="M84,142 L116,142 L118,176 Q100,180 82,176 Z" fill="${oc}" ${O2}/>`;
      s += `<path d="M84,144 L80,128 M116,144 L120,128" stroke="${oc}" stroke-width="6" stroke-linecap="round"/><path d="M84,144 L80,128 M116,144 L120,128" stroke="${INK}" stroke-width="1.2" opacity=".5"/>`;
      s += `<circle cx="88" cy="148" r="2.5" fill="#FFD84D" ${O2}/><circle cx="112" cy="148" r="2.5" fill="#FFD84D" ${O2}/>`;
      s += `<rect x="92" y="153" width="16" height="12" rx="2" fill="${dark}" ${O2}/>`;
      return s;
    default:
      return `<path d="${base}" fill="${oc}" ${O}/>`;
  }
}

function arms(look, oc, ac, skin, classId) {
  const w = look.body === 'b' ? 3 : 0;
  const sleeve = classId === 'CLS05' ? ac : oc;
  return `<path d="M${71 + w},131 Q${54 + w},146 ${56 + w},166 L${68 + w},168 Q${70 + w},152 ${79 + w},141 Z" fill="${sleeve}" ${O}/>`
    + `<circle cx="${62 + w}" cy="170" r="7.5" fill="${skin}" ${O}/>`
    + `<path d="M${129 - w},131 Q${146 - w},146 ${144 - w},166 L${132 - w},168 Q${130 - w},152 ${121 - w},141 Z" fill="${sleeve}" ${O}/>`
    + `<circle cx="${138 - w}" cy="170" r="7.5" fill="${skin}" ${O}/>`;
}

// ---------- companions (drawn around 0,0, ~46px) ----------
function companion(kind) {
  const eye = (x, y) => `<ellipse cx="${x}" cy="${y}" rx="2.6" ry="3.4" fill="${INK}"/><circle cx="${x - 0.8}" cy="${y - 1.2}" r="1" fill="#fff"/>`;
  switch (kind) {
    case 'lamb':
      return `<path d="M-20,6 a8,8 0 0 1 4,-14 a9,9 0 0 1 14,-6 a9,9 0 0 1 14,0 a9,9 0 0 1 12,8 a8,8 0 0 1 -2,14 a8,8 0 0 1 -12,6 L-10,14 a8,8 0 0 1 -10,-8 Z" fill="#FBF8F1" ${O2}/>`
        + `<rect x="-12" y="12" width="6" height="10" rx="3" fill="#5A4A48" ${O2}/><rect x="6" y="12" width="6" height="10" rx="3" fill="#5A4A48" ${O2}/>`
        + `<ellipse cx="-18" cy="-2" rx="10" ry="9" fill="#6B5754" ${O2}/><ellipse cx="-27" cy="-4" rx="5" ry="3" fill="#6B5754" ${O2}/>`
        + `<circle cx="-16" cy="-10" r="5" fill="#FBF8F1" ${O2}/>` + `<circle cx="-15" cy="-3" r="2.2" fill="#fff"/><circle cx="-15" cy="-3" r="1.2" fill="${INK}"/>`
        + `<ellipse cx="-12" cy="2" rx="2.4" ry="1.4" fill="#F59BB0"/>`;
    case 'dove':
      return `<path d="M-22,4 Q-20,-14 0,-12 Q14,-12 20,-2 Q24,10 6,14 Q-14,16 -22,4 Z" fill="#FBFBFF" ${O2}/>`
        + `<path d="M-4,-4 Q8,-18 24,-16 Q18,-2 4,4 Z" fill="#E7EEF8" ${O2}/>`
        + `<circle cx="-16" cy="-6" r="8" fill="#FBFBFF" ${O2}/>` + eye(-18, -7)
        + `<path d="M-24,-5 L-30,-3 L-24,-1 Z" fill="#F2A33A" ${O2}/>`
        + `<path d="M-30,-2 Q-38,6 -36,14" stroke="#5E8C3A" stroke-width="2.4" fill="none" stroke-linecap="round"/>`
        + `<ellipse cx="-36" cy="6" rx="3" ry="1.8" fill="#7DB04B" transform="rotate(-40 -36 6)"/><ellipse cx="-33" cy="11" rx="3" ry="1.8" fill="#7DB04B" transform="rotate(30 -33 11)"/>`;
    case 'lion':
      return `<ellipse cx="6" cy="8" rx="16" ry="11" fill="#F2A541" ${O2}/>`
        + `<path d="M20,4 Q30,0 28,-8" stroke="${INK}" stroke-width="2.2" fill="none"/><circle cx="28" cy="-9" r="3.5" fill="#B5652A" ${O2}/>`
        + `<rect x="-4" y="14" width="6" height="8" rx="3" fill="#F2A541" ${O2}/><rect x="10" y="14" width="6" height="8" rx="3" fill="#F2A541" ${O2}/>`
        + `<path d="M-14,-24 l5,6 l6,-6 l3,7 l7,-3 l-1,8 l7,1 l-4,7 l6,4 l-7,4 l3,7 l-8,0 l-1,7 l-6,-4 l-5,6 l-3,-7 l-7,3 l1,-8 l-7,-2 l5,-6 l-5,-6 l7,-2 l-2,-8 l7,2 Z" fill="#B5652A" ${O2}/>`
        + `<circle cx="-12" cy="-6" r="11" fill="#F7B955" ${O2}/>` + eye(-16, -8) + eye(-7, -8)
        + `<ellipse cx="-11" cy="-2" rx="3" ry="2" fill="#7A3E1E"/>`;
    case 'owl':
      return `<path d="M-16,-14 L-12,-26 L-6,-16 Z M16,-14 L12,-26 L6,-16 Z" fill="#8A6142" ${O2}/>`
        + `<ellipse cx="0" cy="0" rx="18" ry="21" fill="#A97B54" ${O2}/>`
        + `<ellipse cx="0" cy="8" rx="11" ry="11" fill="#E9D4B4"/>`
        + `<circle cx="-7" cy="-6" r="7.5" fill="#fff" ${O2}/><circle cx="7" cy="-6" r="7.5" fill="#fff" ${O2}/>`
        + `<circle cx="-6" cy="-6" r="3.5" fill="${INK}"/><circle cx="6" cy="-6" r="3.5" fill="${INK}"/><circle cx="-7" cy="-7.5" r="1.2" fill="#fff"/><circle cx="5" cy="-7.5" r="1.2" fill="#fff"/>`
        + `<path d="M-2,1 L2,1 L0,5 Z" fill="#F2A33A" ${O2}/>`
        + `<path d="M-6,20 L-6,24 M6,20 L6,24" stroke="#F2A33A" stroke-width="3" stroke-linecap="round"/>`;
    default:
      return '';
  }
}

// ---------- level rewards ----------
function crown() {
  return `<path d="M78,22 L82,4 L92,14 L100,0 L108,14 L118,4 L122,22 Z" fill="#FFD84D" ${O}/>`
    + `<rect x="78" y="20" width="44" height="7" rx="3" fill="#F2B824" ${O2}/>`
    + `<circle cx="100" cy="23.5" r="2.6" fill="#E5484D"/><circle cx="88" cy="23.5" r="2.2" fill="#3478F6"/><circle cx="112" cy="23.5" r="2.2" fill="#3FAE5B"/>`;
}

/**
 * Render a character.
 * opts: { classId, size, frame (bool, default true), companion (bool, default true), crop: 'full' | 'head' }
 */
export function avatarSVG(lookIn, opts = {}) {
  const look = { ...DEFAULT_LOOK, ...(lookIn || {}) };
  const show = look.show || {};
  const classId = opts.classId || 'CLS02';
  const skin = SKIN[look.skin] ?? SKIN[2];
  const hc = HAIR_COLORS[look.hairColor] ?? HAIR_COLORS[1];
  const ec = EYE_COLORS[look.eyeColor] ?? EYE_COLORS[0];
  const oc = OUTFIT_COLORS[look.outfitColor] ?? OUTFIT_COLORS[5];
  const ac = OUTFIT_COLORS[look.accentColor] ?? OUTFIT_COLORS[2];
  const id = 'av' + (++uid);
  const hatCovers = ['cap', 'beanie', 'explorer', 'veil'].includes(look.hat);
  const vb = opts.crop === 'head' ? '40 4 120 130' : '0 -8 200 248';

  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" class="avatar-svg" role="img" style="--skin:${skin}"`
    + (opts.size ? ` width="${opts.size}" height="${Math.round(opts.size * (opts.crop === 'head' ? 130 / 120 : 1.24))}"` : '') + '>';
  s += `<defs><radialGradient id="${id}a"><stop offset="0" stop-color="#FFF6C2" stop-opacity=".95"/><stop offset=".6" stop-color="#FFD84D" stop-opacity=".35"/><stop offset="1" stop-color="#FFD84D" stop-opacity="0"/></radialGradient></defs>`;

  if (show.aura) {
    s += `<circle cx="100" cy="122" r="104" fill="url(#${id}a)"/>`;
    s += star(30, 60, 6, '#FFE27A') + star(172, 90, 5, '#FFE27A') + star(160, 30, 4, '#fff') + star(40, 150, 4, '#fff');
  }
  if (show.frame && opts.frame !== false && opts.crop !== 'head') {
    s += `<rect x="4" y="-4" width="192" height="240" rx="26" fill="none" stroke="#FFD84D" stroke-width="5" opacity=".9"/>`
      + `<rect x="9" y="1" width="182" height="230" rx="22" fill="none" stroke="#FFF3B0" stroke-width="2" stroke-dasharray="1 7" stroke-linecap="round"/>`;
  }
  if (opts.crop !== 'head') s += `<ellipse cx="100" cy="224" rx="50" ry="8" fill="${INK}" opacity=".15"/>`;

  s += backBehind(look.back, ac);
  if (look.hat !== 'veil') s += hairBack(look.hairStyle, hc);
  else s += `<path d="M50,96 L42,152 Q70,146 76,120 Z M150,96 L158,152 Q130,146 124,120 Z" fill="#F7F3EA" ${O}/>`;
  if (look.hairStyle === 'bun' && hatCovers) { /* bun hidden under hat */ }

  s += legs(look, oc, ac, classId);
  s += torso(look, oc, ac, classId);
  s += backFront(look.back, ac);
  if (show.badge) s += `<g transform="translate(${look.back === 'backpack' ? 100 : 116} 146)"><circle r="7" fill="#FFD84D" ${O2}/>${star(0, 0, 4.5, '#fff')}</g>`;
  s += arms(look, oc, ac, skin, classId);

  // head
  s += `<rect x="91" y="114" width="18" height="16" rx="6" fill="${shade(skin, -0.12)}" ${O2}/>`;
  s += `<circle cx="56" cy="92" r="8" fill="${skin}" ${O}/><circle cx="144" cy="92" r="8" fill="${skin}" ${O}/>`;
  s += `<path d="M56,84 C56,56 76,43 100,43 C124,43 144,56 144,84 C144,108 126,124 100,124 C74,124 56,108 56,84 Z" fill="${skin}" ${O}/>`;
  s += eyes(look.eyes, ec);
  s += `<ellipse cx="72" cy="104" rx="6" ry="3.5" fill="#F59BB0" opacity=".6"/><ellipse cx="128" cy="104" rx="6" ry="3.5" fill="#F59BB0" opacity=".6"/>`;
  s += mouth(look.mouth);

  if (look.hat === 'veil') {
    s += hairFront(look.hairStyle === 'buzz' ? 'buzz' : 'long', hc);
  } else {
    s += hairFront(look.hairStyle, hc);
  }
  s += hat(look.hat, oc, ac);
  if (show.crown) s += crown();
  s += handItem(look.hand, ac);

  if (look.companion !== 'none' && opts.companion !== false && opts.crop !== 'head') {
    s += `<g transform="translate(38 200) scale(.95)">${companion(look.companion)}</g>`;
  }
  return s + '</svg>';
}

export function companionSVG(kind, size = 48) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-40 -30 80 60" width="${size}" height="${size * 0.75}">${companion(kind)}</svg>`;
}
