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

// Whether an item's manifest (item.json) takes a gem: one of its own effects reads CP 15, the game's
// recolouring (older effects, Shadow Fiend's Desolation, do not: the game takes no gem in them).
// Unusual effects are left out: they are the item's other socket.
export const takesPrismatic = (manifest) => {
  const systems = manifest.systems || {}, unusual = new Set();
  const reach = (path) => { if (unusual.has(path) || !systems[path]) return; unusual.add(path); for (const c of systems[path].m_Children || []) reach(String(c.m_ChildRef || '').replace(/\.vpcf$/, '')); };
  for (const u of manifest.unusual || []) reach(u.system);
  return Object.entries(systems).some(([path, s]) => !unusual.has(path) && /"m_nCPInput":15\b/.test(JSON.stringify(s))) || null;
};
