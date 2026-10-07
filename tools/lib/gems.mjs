// Prismatic gems: the colours the game has for them (items_game.txt's colors, unusual_*, named in
// the localization), and which items take one.
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

// The items with a prismatic socket: next to none (Valve's list). The key is the gem it comes with,
// which the game always draws it in (the schema does not say: it was put in each one sold); true, an
// empty socket. Other items whose effects read a gem's colour (control point 15) take their hero's:
// Terrorblade's skins, his arcana's. Witch Doctor's Padda'pon of Ribbi'tar has one too, for Death
// Ward's effect, which the site does not show.
export const SOCKETS = { 5957: 'terrorblade_abysm', 6879: 'techies_swine' };
