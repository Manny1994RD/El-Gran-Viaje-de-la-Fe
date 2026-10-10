// Overworld board: six worlds along a road, drawn as SVG (viewBox 400 x 760).
import { avatarSVG } from './avatar.js';
import { tr } from './i18n.js';

const INK = '#2A2238';
const O = `stroke="${INK}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"`;
const O2 = `stroke="${INK}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"`;

export const NODES = {
  W01: { x: 112, y: 650 },
  W02: { x: 290, y: 548 },
  W03: { x: 108, y: 432 },
  W04: { x: 292, y: 316 },
  W05: { x: 110, y: 198 },
  W06: { x: 270, y: 84 },
};
const ORDER = ['W01', 'W02', 'W03', 'W04', 'W05', 'W06'];

const tree = (x, y, s = 1, c = '#3FA34D') => `<g transform="translate(${x} ${y}) scale(${s})">`
  + `<rect x="-4" y="6" width="8" height="14" rx="3" fill="#8A5A3B" ${O2}/>`
  + `<circle cx="0" cy="-2" r="15" fill="${c}" ${O2}/><circle cx="-5" cy="-8" r="5" fill="#fff" opacity=".22"/></g>`;
const pine = (x, y, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})">`
  + `<rect x="-3" y="10" width="6" height="10" fill="#8A5A3B" ${O2}/>`
  + `<path d="M0,-22 L16,12 L-16,12 Z" fill="#2F8F55" ${O2}/><path d="M0,-30 L12,-2 L-12,-2 Z" fill="#37A262" ${O2}/></g>`;
const flower = (x, y, c) => `<g transform="translate(${x} ${y})"><circle r="4.5" fill="${c}" ${O2}/><circle r="1.8" fill="#FFE27A"/></g>`;
const rock = (x, y, s = 1) => `<ellipse cx="${x}" cy="${y}" rx="${10 * s}" ry="${6 * s}" fill="#B8B3A8" ${O2}/>`;
const crystal = (x, y, s, lit) => `<g transform="translate(${x} ${y}) scale(${s})"><path d="M0,-16 L8,-4 L0,14 L-8,-4 Z" fill="${lit ? '#9FF3FF' : '#B9C7CC'}" ${O2}/>`
  + `<path d="M0,-16 L0,14" stroke="#fff" stroke-width="2" opacity=".6"/></g>`;

function scenery(worlds, prog) {
  const st = (id) => worlds.find((w) => w.id === id)?.status || 'locked';
  const ratio = (id) => {
    const p = prog[id];
    if (!p) return 0;
    if (p.world.status === 'unlocked') return 1;
    return p.world.tag_target ? Math.min(1, p.tag_count / p.world.tag_target) : 0;
  };
  let s = '';
  // Forest of Awakening
  s += pine(36, 610, 1.1) + tree(60, 700, 1.2) + pine(170, 700, 1) + tree(26, 680, 0.9, '#2F8F55') + pine(186, 620, 0.9) + tree(150, 600, 0.8);
  if (st('W01') !== 'unlocked') {
    const f = 1 - ratio('W01');
    s += `<g opacity="${(0.25 + 0.6 * f).toFixed(2)}" class="fog">`
      + `<ellipse cx="80" cy="640" rx="70" ry="22" fill="#fff"/><ellipse cx="150" cy="670" rx="60" ry="18" fill="#fff"/><ellipse cx="60" cy="690" rx="50" ry="16" fill="#fff"/></g>`;
  }
  // Lake of Wisdom
  s += `<ellipse cx="312" cy="560" rx="74" ry="38" fill="#4FB3F6" ${O}/><ellipse cx="300" cy="552" rx="52" ry="22" fill="#7FD0FF"/>`
    + `<path d="M270,548 q8,-5 16,0 M310,566 q8,-5 16,0" stroke="#fff" stroke-width="2.5" fill="none" stroke-linecap="round"/>`;
  const lit = Math.round(ratio('W02') * 4);
  s += crystal(250, 530, 1, lit > 0) + crystal(372, 540, 0.9, lit > 1) + crystal(356, 594, 0.8, lit > 2) + crystal(262, 590, 0.8, lit > 3);
  // River + Bridge of Unity
  s += `<path d="M-10,470 C80,440 140,450 200,420 C260,392 330,404 410,380 L410,420 C330,444 270,432 210,460 C150,488 80,478 -10,510 Z" fill="#4FB3F6" ${O}/>`
    + `<path d="M20,482 q10,-6 20,0 M250,418 q10,-6 20,0 M340,410 q10,-6 20,0" stroke="#fff" stroke-width="2.5" fill="none" stroke-linecap="round"/>`;
  const bridgeFixed = st('W03') === 'unlocked';
  const planks = Math.round(ratio('W03') * 6);
  s += `<g transform="translate(108 452) rotate(-14)">`;
  s += `<rect x="-36" y="-16" width="72" height="5" rx="2" fill="#7B5230" ${O2}/><rect x="-36" y="12" width="72" height="5" rx="2" fill="#7B5230" ${O2}/>`;
  for (let i = 0; i < 6; i++) {
    if (bridgeFixed || i < planks || i === 0 || i === 5) s += `<rect x="${-34 + i * 11.6}" y="-12" width="10" height="26" rx="2" fill="#B07A45" ${O2}/>`;
  }
  s += `</g>`;
  // Mountain of Perseverance
  s += `<path d="M230,330 L292,236 L354,330 Z" fill="#9AA3B5" ${O}/><path d="M276,260 L292,236 L308,260 L300,256 L292,266 L284,256 Z" fill="#fff" ${O2}/>`
    + `<path d="M310,330 L356,262 L404,330 Z" fill="#848DA1" ${O}/><path d="M346,276 L356,262 L366,276 L356,282 Z" fill="#fff" ${O2}/>`
    + `<path d="M190,334 L232,280 L272,334 Z" fill="#A9B1C1" ${O}/>`;
  if (st('W04') !== 'unlocked') {
    const w = 1 - ratio('W04');
    s += `<g opacity="${(0.3 + 0.7 * w).toFixed(2)}" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round">`
      + `<path d="M200,262 q20,-10 40,0 q14,8 4,16"/><path d="M330,232 q20,-10 40,0 q14,8 4,16"/><path d="M250,214 q16,-8 32,0"/></g>`;
  } else {
    s += `<path d="M292,236 L292,206" stroke="${INK}" stroke-width="3"/><path d="M292,206 L316,214 L292,222 Z" fill="#E5484D" ${O2}/>`;
  }
  // Garden of Fruits
  const bloom = st('W05') === 'unlocked' ? 1 : ratio('W05');
  const fc = ['#E5484D', '#F2C94C', '#E25FA4', '#9B51E0', '#F28C28'];
  s += `<rect x="18" y="150" width="58" height="26" rx="13" fill="#4E9F3D" ${O2}/><rect x="146" y="236" width="70" height="24" rx="12" fill="#4E9F3D" ${O2}/>`;
  const spots = [[30, 222], [48, 238], [66, 226], [160, 158], [178, 172], [196, 154], [36, 252], [186, 210], [26, 196], [170, 142]];
  spots.forEach(([x, y], i) => { s += flower(x, y, i / spots.length < bloom ? fc[i % fc.length] : '#C9C3B6'); });
  if (st('W05') !== 'unlocked') s += `<text x="60" y="140" font-family="Fredoka, sans-serif" font-size="16" fill="#fff" stroke="${INK}" stroke-width="1" opacity=".85">z z z</text>`;
  // City of Promises
  const gold = st('W06') === 'unlocked';
  s += `<rect x="206" y="40" width="130" height="58" rx="6" fill="${gold ? '#FFE07A' : '#E8DCC0'}" ${O}/>`;
  for (const x of [206, 238, 270, 302]) s += `<rect x="${x}" y="32" width="12" height="10" fill="${gold ? '#FFE07A' : '#E8DCC0'}" ${O2}/>`;
  s += `<rect x="196" y="18" width="30" height="80" rx="4" fill="${gold ? '#FFD84D' : '#DDD0B2'}" ${O}/><path d="M192,20 L211,-4 L230,20 Z" fill="#E5484D" ${O2}/>`
    + `<rect x="318" y="18" width="30" height="80" rx="4" fill="${gold ? '#FFD84D' : '#DDD0B2'}" ${O}/><path d="M314,20 L333,-4 L352,20 Z" fill="#3478F6" ${O2}/>`
    + `<path d="M256,98 L256,72 Q271,56 286,72 L286,98 Z" fill="${gold ? '#FFF6C2' : '#8A5A3B'}" ${O}/>`;
  if (gold) s += `<circle cx="271" cy="60" r="60" fill="#FFF3B0" opacity=".25"/>`;
  // Scattered decoration
  s += tree(372, 690, 0.9) + tree(352, 730, 0.8, '#2F8F55') + rock(238, 700) + rock(380, 470, 0.8) + tree(28, 330, 0.9) + pine(60, 360, 0.8)
    + tree(372, 180, 0.8) + rock(196, 560, 0.9) + pine(24, 50, 0.9) + tree(60, 90, 0.8) + flower(240, 640, '#F2C94C') + flower(352, 640, '#E25FA4')
    + flower(200, 380, '#fff') + flower(40, 560, '#F2C94C');
  return s;
}

function road(worlds) {
  const pts = [{ x: 200, y: 760 }, ...ORDER.map((id) => NODES[id])];
  let d = `M${pts[0].x},${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const my = (a.y + b.y) / 2;
    d += ` C${a.x},${my} ${b.x},${my} ${b.x},${b.y}`;
  }
  const done = worlds.filter((w) => w.status === 'unlocked').length;
  let doneD = `M${pts[0].x},${pts[0].y}`;
  for (let i = 1; i <= Math.min(done + 1, pts.length - 1); i++) {
    const a = pts[i - 1], b = pts[i];
    const my = (a.y + b.y) / 2;
    doneD += ` C${a.x},${my} ${b.x},${my} ${b.x},${b.y}`;
  }
  return `<path d="${d}" fill="none" stroke="${INK}" stroke-width="26" stroke-linecap="round"/>`
    + `<path d="${d}" fill="none" stroke="#E9D3A1" stroke-width="20" stroke-linecap="round"/>`
    + `<path d="${d}" fill="none" stroke="#D2B47A" stroke-width="3" stroke-dasharray="2 14" stroke-linecap="round"/>`
    + `<path d="${doneD}" fill="none" stroke="#FFE07A" stroke-width="8" stroke-linecap="round" opacity=".9"/>`;
}

const lockIcon = `<rect x="-8" y="-3" width="16" height="13" rx="3" fill="#fff" ${O2}/><path d="M-5,-3 v-4 a5,5 0 0 1 10,0 v4" fill="none" stroke="${INK}" stroke-width="2.4"/>`;
const keyIcon = `<circle cx="-5" cy="0" r="6" fill="#FFD84D" ${O2}/><circle cx="-5" cy="0" r="2" fill="${INK}"/><path d="M1,0 L12,0 M8,0 L8,5 M11,0 L11,4" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`;

function node(w, i, lang) {
  const { x, y } = NODES[w.id];
  const fill = w.status === 'unlocked' ? '#FFD84D' : w.status === 'active' ? '#E5484D' : '#A7A2B5';
  const name = tr(w, 'name');
  const labelW = Math.max(110, name.length * 7.4 + 24);
  let s = `<g class="map-node ${w.status}" data-world="${w.id}" tabindex="0" role="button" aria-label="${name}">`;
  if (w.status === 'active') s += `<circle cx="${x}" cy="${y}" r="34" fill="none" stroke="#fff" stroke-width="4" class="pulse"/>`;
  s += `<circle cx="${x}" cy="${y}" r="26" fill="#fff" ${O}/><circle cx="${x}" cy="${y}" r="19" fill="${fill}" ${O2}/>`;
  s += `<g transform="translate(${x} ${y})">`;
  if (w.status === 'locked') s += lockIcon;
  else if (w.status === 'unlocked') s += keyIcon;
  else s += `<text y="7" text-anchor="middle" font-family="Fredoka, sans-serif" font-weight="700" font-size="20" fill="#fff" stroke="${INK}" stroke-width="1">${i + 1}</text>`;
  s += `</g>`;
  const ly = y + 36;
  const lx = Math.max(labelW / 2 + 6, Math.min(400 - labelW / 2 - 6, x));
  s += `<rect x="${lx - labelW / 2}" y="${ly}" width="${labelW}" height="24" rx="12" fill="${w.status === 'locked' ? '#EDEAF3' : '#FFFDF6'}" ${O2}/>`;
  s += `<text x="${lx}" y="${ly + 17}" text-anchor="middle" font-family="Fredoka, sans-serif" font-weight="600" font-size="13" fill="${INK}">${name}</text>`;
  return s + '</g>';
}

/**
 * worlds: list from /api/worlds (items have .world, .tag_count ...)
 * party: [{look, class_id}] shown standing at the active world (first one = me)
 */
export function mapSVG(progressList, party = [], lang = 'es') {
  const worlds = progressList.map((p) => p.world);
  const prog = Object.fromEntries(progressList.map((p) => [p.world.id, p]));
  const active = worlds.find((w) => w.status === 'active') || worlds.filter((w) => w.status === 'unlocked').pop();
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 760" class="map-svg" role="img">`;
  s += `<defs><pattern id="grass" width="40" height="40" patternUnits="userSpaceOnUse"><rect width="40" height="40" fill="#8FD16A"/>`
    + `<rect width="20" height="20" fill="#89CB64"/><rect x="20" y="20" width="20" height="20" fill="#89CB64"/>`
    + `<path d="M8,30 l2,-5 l2,5 M28,12 l2,-5 l2,5" stroke="#6FB24D" stroke-width="1.6" fill="none"/></pattern>`
    + `<filter id="locked"><feColorMatrix type="saturate" values=".35"/></filter></defs>`;
  s += `<rect width="400" height="760" fill="url(#grass)"/>`;
  s += road(worlds);
  s += `<g>${scenery(worlds, prog)}</g>`;
  // Locked worlds are covered by a soft cloud
  for (const w of worlds) {
    if (w.status !== 'locked') continue;
    const { x, y } = NODES[w.id];
    s += `<g opacity=".55" pointer-events="none"><ellipse cx="${x}" cy="${y - 6}" rx="78" ry="44" fill="#F4F1FA"/><ellipse cx="${x + 40}" cy="${y + 10}" rx="40" ry="24" fill="#F4F1FA"/></g>`;
  }
  worlds.forEach((w, i) => { s += node(w, i, lang); });
  if (active && party.length) {
    const { x, y } = NODES[active.id];
    const shown = party.slice(0, 7);
    shown.forEach((p, i) => {
      if (i === 0) return;
      const side = i % 2 ? -1 : 1;
      const step = Math.ceil(i / 2);
      const px = x + side * (24 + step * 26) - 22;
      const py = y - 74 + step * 4;
      s += avatarSVG({ ...p.look, show: {} }, { classId: p.class_id, size: 44, frame: false, companion: false }).replace('<svg ', `<svg x="${px}" y="${py}" class="map-buddy" `);
    });
    const me = shown[0];
    s += avatarSVG({ ...me.look, show: { ...me.look.show, frame: false, aura: false } }, { classId: me.class_id, size: 64, frame: false })
      .replace('<svg ', `<svg x="${x - 32}" y="${y - 104}" class="map-me" `);
  }
  return s + '</svg>';
}
