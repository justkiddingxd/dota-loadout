// Valve's KeyValues text: src/kv.js's parser, and localization files read with it.
import { parseKV } from '../../src/kv.js';

export { parseKV };

// Localization tokens of a resource/localization file, keys lowercased.
export function tokens(text) {
  const { data } = parseKV(text), lang = Object.values(data)[0] || {}, t = lang.Tokens || lang.tokens || {};
  return Object.fromEntries(Object.entries(t).map(([k, v]) => [k.toLowerCase(), v]));
}
