// Character customization options. Shared by the browser and the server (validation).

export const SKIN = ['#FFE0C7', '#F6CFAE', '#EEB98E', '#D9A066', '#C08552', '#9C6440', '#7A4A2E', '#5A3520'];
export const HAIR_COLORS = ['#1F1A1C', '#3B2A20', '#6B4226', '#9A5B2E', '#C98A3E', '#E8C468', '#B9B2A9', '#E8E3DA', '#B33A3A', '#3E5BA9'];
export const EYE_COLORS = ['#3A2A20', '#2E5E8C', '#3F7D4A', '#7A5230', '#5B4B8A', '#222222'];
export const OUTFIT_COLORS = ['#E5484D', '#F28C28', '#F2C94C', '#3FAE5B', '#2F9E9E', '#3478F6', '#5B5BD6', '#9B51E0', '#E25FA4', '#F4F1EA', '#4A4F5C', '#8A5A3B'];

export const LOOK_OPTIONS = {
  body: ['a', 'b'],
  skin: SKIN.map((_, i) => i),
  hairStyle: ['short', 'spiky', 'bob', 'long', 'ponytail', 'curly', 'braid', 'bun', 'buzz', 'wavy'],
  hairColor: HAIR_COLORS.map((_, i) => i),
  eyes: ['round', 'happy', 'sparkle', 'calm', 'bold'],
  eyeColor: EYE_COLORS.map((_, i) => i),
  mouth: ['smile', 'grin', 'open', 'soft'],
  outfitColor: OUTFIT_COLORS.map((_, i) => i),
  accentColor: OUTFIT_COLORS.map((_, i) => i),
  bottom: ['pants', 'skirt'],
  hat: ['none', 'cap', 'veil', 'bandana', 'explorer', 'beanie', 'headband'],
  back: ['none', 'satchel', 'backpack', 'cape'],
  hand: ['none', 'lantern', 'staff', 'book', 'scroll', 'flag'],
  companion: ['none', 'lamb', 'dove', 'lion', 'owl'],
};

// Level rewards that can be shown on the character once unlocked (see LEVELS cosmetic keys).
export const COSMETICS = ['badge', 'frame', 'aura', 'title', 'crown'];

export const DEFAULT_LOOK = {
  body: 'a', skin: 2, hairStyle: 'short', hairColor: 1, eyes: 'round', eyeColor: 0, mouth: 'smile',
  outfitColor: 5, accentColor: 2, bottom: 'pants', hat: 'cap', back: 'satchel', hand: 'none', companion: 'lamb',
  want: { badge: true, frame: true, aura: true, title: true, crown: true },
};

export function randomLook() {
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const look = { ...DEFAULT_LOOK, want: { ...DEFAULT_LOOK.want } };
  for (const [k, vals] of Object.entries(LOOK_OPTIONS)) look[k] = pick(vals);
  return look;
}
