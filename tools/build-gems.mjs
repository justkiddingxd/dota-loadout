// Prismatic gems for the site: <out>/gems.json (the colours), and each hero's items.json marking the
// items that take one (prismatic: the key of the gem it comes with). Runs after build-items.mjs; build-items marks them itself.
//   node tools/build-gems.mjs --game <…/dota> [--out assets]
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { prismaticColors, SOCKETS } from './lib/gems.mjs';

const args = process.argv.slice(2), opt = (name, fallback) => { const i = args.indexOf(`--${name}`); return i < 0 ? fallback : args[i + 1]; };
const game = resolve(opt('game', '.cache/game/dota')), out = resolve(opt('out', 'assets'));
const colors = prismaticColors(game);
writeFileSync(join(out, 'gems.json'), JSON.stringify({ version: 1, prismatic: colors }));
let marked = 0, total = 0;
for (const hero of readdirSync(join(out, 'heroes'))) {
  const file = join(out, 'heroes', hero, 'items.json'); if (!existsSync(file)) continue;
  const catalog = JSON.parse(readFileSync(file, 'utf8'));
  for (const [id, item] of Object.entries(catalog.items)) {
    const m = join(out, 'items', id, 'item.json'); if (!existsSync(m)) continue; total++;
    const gem = item.default ? null : SOCKETS[id] || null;
    if (gem) { item.prismatic = gem; marked++; } else delete item.prismatic;
  }
  writeFileSync(file, JSON.stringify(catalog));
}
console.log(`${colors.length} prismatic colours; ${marked} of ${total} items take a gem`);
