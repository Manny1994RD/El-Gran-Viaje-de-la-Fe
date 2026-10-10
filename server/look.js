import { LOOK_OPTIONS, COSMETICS, DEFAULT_LOOK } from '../public/js/options.js';
import { LEVELS } from './catalog.js';
import { AppError } from './engine.js';

// Keep only known options. `want` stores which level rewards the member wants shown;
// they actually appear (see withRewards) once that level is reached.
export function validateLook(input) {
  if (!input || typeof input !== 'object') throw new AppError(400, 'bad_look');
  const look = {};
  for (const [k, vals] of Object.entries(LOOK_OPTIONS)) {
    const v = input[k] ?? DEFAULT_LOOK[k];
    if (!vals.includes(v)) throw new AppError(400, 'bad_look', { field: k });
    look[k] = v;
  }
  look.want = {};
  for (const c of COSMETICS) look.want[c] = input.want?.[c] !== false;
  return look;
}

export function withRewards(look, xp) {
  const unlocked = LEVELS.filter((l) => xp >= l.min_xp).map((l) => l.cosmetic);
  const show = {};
  for (const c of COSMETICS) show[c] = (look.want?.[c] !== false) && unlocked.includes(c);
  const level = LEVELS.reduce((acc, l) => (xp >= l.min_xp ? l : acc), LEVELS[0]);
  return { ...look, show, title_es: level.title_es, title_en: level.title_en };
}
