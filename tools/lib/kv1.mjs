// Valve's KeyValues text (scripts/npc, items_game.txt, portraits, localization) to plain objects.
// Keys keep their case; a repeated key keeps the first value, except blocks, which merge — but an
// item's asset modifiers, many under the same name, each keep their own (asset_modifier#2, …).
// Conditionals ([$WIN32]) are dropped with the value they guard; #base lines are returned apart.
const TOKEN = /\s+|\/\/[^\n]*|"((?:[^"\\]|\\.)*)"|([{}])|(\[[^\]\n]*\])|(#base|#include)|([^\s{}"]+)/y;

export function parseKV(text) {
  const bases = [], root = {}, stack = [root];
  let key = null;
  TOKEN.lastIndex = 0;
  if (text.charCodeAt(0) === 0xfeff) TOKEN.lastIndex = 1;
  while (TOKEN.lastIndex < text.length) {
    const at = TOKEN.lastIndex, m = TOKEN.exec(text);
    if (!m) throw new Error(`KV: unexpected character at ${at}: ${JSON.stringify(text.slice(at, at + 30))}`);
    if (m[4]) { let b; do b = TOKEN.exec(text); while (b && b[1] === undefined && b[5] === undefined); if (b) bases.push(b[1] ?? b[5]); continue; }
    if (m[3]) continue; // conditional
    const value = m[1] !== undefined ? m[1].replace(/\\(["\\nt])/g, (_, c) => ({ n: '\n', t: '\t' })[c] ?? c) : m[5];
    const top = stack[stack.length - 1];
    if (m[2] === '{') {
      let k = key ?? ''; key = null;
      if (/^asset_modifier\d*$/.test(k) && k in top) { let n = 2; while (`${k}#${n}` in top) n++; k = `${k}#${n}`; }
      const block = top[k] && typeof top[k] === 'object' ? top[k] : (top[k] = {});
      stack.push(block);
    } else if (m[2] === '}') { if (stack.length > 1) stack.pop(); key = null; }
    else if (value !== undefined) {
      if (key === null) key = value;
      else { if (!(key in top)) top[key] = value; key = null; }
    }
  }
  return { data: root, bases };
}

// Localization tokens of a resource/localization file, keys lowercased.
export function tokens(text) {
  const { data } = parseKV(text), lang = Object.values(data)[0] || {}, t = lang.Tokens || lang.tokens || {};
  return Object.fromEntries(Object.entries(t).map(([k, v]) => [k.toLowerCase(), v]));
}
