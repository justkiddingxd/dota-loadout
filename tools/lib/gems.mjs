// Prismatic gems: the colours the game has for them (items_game.txt's colors, unusual_*, named in
// the localization), and which items take one — those whose effects read a gem's colour (control
// point 15, turned on by CP 16).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseKV, tokens } from './kv1.mjs';

export function prismaticColors(game) {
  const colors = parseKV(readFileSync(join(game, 'scripts/items/items_game.txt'), 'utf8')).data.items_game.colors || {};
  const loc = (lang) => { const f = join(game, `resource/localization/dota_${lang}.txt`); return existsSync(f) ? tokens(readFileSync(f, 'utf8')) : {}; };
  const en = loc('english'), ru = loc('russian');
  return Object.entries(colors).filter(([key, c]) => /^unusual_/.test(key) && /^#[0-9a-f]{6}$/i.test(c.hex_color || ''))
    .map(([key, c]) => { const k = (c.color_name || '').toLowerCase(); return { key: key.replace(/^unusual_/, ''), hex: c.hex_color.toLowerCase(), name: { en: en[k] || key, ru: ru[k] || en[k] || key } }; });
}

// What gem an item's manifest (item.json) takes: true when one of its systems reads CP 15 (the
// game's own recolouring), 'tint' when it has effects that do not (older items: the viewer tints
// them), null without effects.
export const takesPrismatic = (manifest) => {
  if (/"m_nCPInput":15\b/.test(JSON.stringify(manifest.systems || {}))) return true;
  return manifest.styles?.some((s) => s.effects?.length || Object.keys(s.particles || {}).length) ? 'tint' : null;
};
