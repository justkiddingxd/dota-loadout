// Inspect: as a shooter's inventory. The hero alone on a plain gradient, as an item being inspected;
// his slots as the categories across the top; the chosen slot's item named large at the bottom left;
// its items as cards in a strip at the bottom (hover tries one on, a click equips it). The whole
// inventory opens over everything, sorted by rarity.
import { ATTRIBUTE, h, icon, lang, RARITY, rarityName, say, start } from '../kit.js';
import { shareButton } from '../parts.js';

const $ = (s) => document.querySelector(s);
const ru = lang === 'ru';
const T = ru
  ? { standard: 'Стандарт', empty: 'Пусто', all: 'Весь инвентарь', style: 'Стиль', trying: 'Примерка', equipped: 'Надето', close: 'Закрыть', find: 'Поиск', findHero: 'Найти героя', none: 'Ничего не нашлось', heroes: 'Герои', count: (n) => `${n} ${n % 10 === 1 && n % 100 !== 11 ? 'предмет' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 'предмета' : 'предметов'}` }
  : { standard: 'Default', empty: 'Empty', all: 'Full inventory', style: 'Style', trying: 'Trying on', equipped: 'Equipped', close: 'Close', find: 'Search', findHero: 'Find a hero', none: 'Nothing found', heroes: 'Heroes', count: (n) => `${n} items` };
const RANK = ['common', 'uncommon', 'rare', 'mythical', 'legendary', 'immortal', 'arcana', 'ancient', 'seasonal'];
const ui = { slot: null, trying: null };

const kit = await start($('[data-view]'), {
  viewer: { framing: 'hero' },
  onProgress: (a, b) => { $('[data-bar]').style.width = `${b ? (a / b) * 100 : 0}%`; },
  onLoading: (on) => { $('[data-loading]').hidden = !on; },
  onChange: (why) => { if (why === 'hero') ui.slot = null; ui.trying = null; render(); },
});

function render() {
  const hero = kit.hero; if (!hero) return;
  ui.slot ||= kit.slots()[0]?.name || null;
  document.title = `${say(hero.name)} — Loadout`;
  $('[data-pick]').replaceChildren(h('img', { src: kit.portrait(hero.id, 'icon'), alt: '' }), h('span', {}, say(hero.name)), h('span', { html: icon('down', 14) }));
  $('[data-cats]').replaceChildren(...kit.slots().map((s) => { const b = h('button', { type: 'button', 'aria-selected': String(ui.slot === s.name) }, say(s.text)); b.onclick = () => { ui.slot = s.name; render(); }; return b; }));
  $('[data-cats] [aria-selected="true"]')?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  renderInspect(); renderStrip();
}

// ---- bottom left: the slot's item, named large
function renderInspect() {
  const s = kit.slots().find((x) => x.name === ui.slot); if (!s) return $('[data-inspect]').replaceChildren();
  const id = ui.trying ? ui.trying.id : kit.shown(s.name), it = kit.item(id), style = ui.trying ? 0 : kit.styleOf(s.name);
  const styles = !ui.trying && it && !it.default && it.styles.length > 1
    ? h('div', { class: 'styles' }, ...it.styles.map((st, i) => { const b = h('button', { type: 'button', 'aria-pressed': String(style === i) }, say(st.name) || String(i + 1)); b.onclick = () => kit.wear(s.name, id, i); return b; }))
    : null;
  const all = h('button', { type: 'button', class: 'btn' }, h('span', { html: icon('search', 16) }), T.all); all.onclick = openInventory;
  $('[data-inspect]').replaceChildren(...[
    h('p', { class: 'kind', style: { '--r': it && !it.default ? RARITY[it.rarity] : '#b0c3d9' } }, ui.trying ? T.trying : it && !it.default ? `${rarityName(it.rarity)}, ${say(s.text).toLowerCase()}` : say(s.text)),
    h('h1', {}, !it ? T.empty : it.default ? T.standard : say(it.name)), styles, h('div', { class: 'acts' }, all)].filter(Boolean));
}

// ---- bottom: the slot's items as cards
function card(s, id, { wide = false } = {}) {
  const it = kit.item(id), worn = id === kit.shown(s.name);
  const b = h('button', { type: 'button', class: `cell${wide ? ' wide' : ''}`, 'aria-pressed': String(worn), style: { '--r': it.default ? '#b0c3d9' : RARITY[it.rarity] } },
    h('span', { class: 'pic' }, h('img', { src: kit.picture(id), alt: '', loading: 'lazy' })),
    h('span', { class: 'cname' }, it.default ? T.standard : say(it.name)), worn ? h('span', { class: 'eq' }, T.equipped) : null);
  let timer = null;
  b.onmouseenter = () => { if (!worn) timer = setTimeout(() => tryOn(s, id), 260); };
  b.onmouseleave = () => { clearTimeout(timer); if (ui.trying?.id === id) untry(); };
  b.onclick = () => { clearTimeout(timer); ui.trying = null; $('[data-inventory]').hidden = true; kit.wear(s.name, id, 0); };
  return b;
}
function renderStrip() {
  const s = kit.slots().find((x) => x.name === ui.slot); if (!s) return $('[data-strip]').replaceChildren();
  const ids = [...s.items].sort((a, b) => RANK.indexOf(kit.item(b).rarity) - RANK.indexOf(kit.item(a).rarity) || (kit.item(b).default - kit.item(a).default));
  $('[data-strip]').replaceChildren(...ids.map((id) => card(s, id)));
  $('[data-strip] [aria-pressed="true"]')?.scrollIntoView({ inline: 'center', block: 'nearest' });
}
async function tryOn(s, id) { ui.trying = { slot: s.name, id }; renderInspect(); await kit.tryOn(s.name, id); }
async function untry() { const t = ui.trying; ui.trying = null; renderInspect(); if (t) await kit.untry(t.slot); }

// ---- the whole inventory, over everything
const inv = $('[data-inventory]');
function openInventory() {
  const input = h('input', { type: 'search', placeholder: T.find, 'aria-label': T.find });
  const body = h('div', { class: 'inv-body' });
  const fill = () => {
    const q = input.value.trim().toLowerCase();
    body.replaceChildren(...kit.slots().map((s) => {
      const ids = s.items.filter((id) => !q || say(kit.item(id).name).toLowerCase().includes(q)).sort((a, b) => RANK.indexOf(kit.item(b).rarity) - RANK.indexOf(kit.item(a).rarity));
      return ids.length ? h('section', {}, h('h3', {}, say(s.text), h('small', {}, T.count(ids.length))), h('div', { class: 'inv-grid' }, ...ids.map((id) => card(s, id, { wide: true })))) : null;
    }).filter(Boolean));
    if (!body.children.length) body.append(h('p', { class: 'none' }, T.none));
  };
  input.oninput = fill; fill();
  const close = h('button', { type: 'button', class: 'btn', 'aria-label': T.close, html: icon('close', 18) }); close.onclick = () => { inv.hidden = true; };
  inv.replaceChildren(h('header', {}, h('h2', {}, T.all), h('label', { class: 'find', html: icon('search', 16) }, input), close), body);
  inv.hidden = false; input.focus();
}

// ---- pointing at him
const canvas = $('[data-view]'), tip = $('[data-tip]');
let down = null, last = 0;
canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
canvas.addEventListener('pointermove', (e) => {
  if (e.buttons) { tip.hidden = true; return; }
  const now = performance.now(); if (now - last < 50) return; last = now;
  const slot = kit.pick(e.clientX, e.clientY); canvas.style.cursor = slot ? 'pointer' : '';
  const s = slot && kit.slots().find((x) => x.name === slot); if (!s) { tip.hidden = true; return; }
  tip.textContent = say(s.text); tip.style.transform = `translate(${e.clientX + 14}px, ${e.clientY + 12}px)`; tip.hidden = false;
});
canvas.addEventListener('pointerleave', () => { tip.hidden = true; });
canvas.addEventListener('click', (e) => { if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return; const slot = kit.pick(e.clientX, e.clientY); if (slot) { tip.hidden = true; ui.slot = slot; render(); } });

// ---- heroes
const roster = $('[data-roster]');
$('[data-pick]').onclick = () => {
  const input = h('input', { type: 'search', placeholder: T.findHero, 'aria-label': T.findHero });
  const body = h('div', { class: 'faces' });
  const fill = () => { const q = input.value.trim().toLowerCase(); body.replaceChildren(...kit.heroes.filter((x) => !q || [x.name.en, x.name.ru, x.id].some((n) => n?.toLowerCase().includes(q))).map((x) => { const b = h('button', { type: 'button', 'aria-current': String(x.id === kit.hero?.id) }, h('img', { src: kit.portrait(x.id), alt: '', loading: 'lazy' }), h('span', {}, say(x.name)), h('small', {}, ATTRIBUTE[lang][x.attribute])); b.onclick = () => { roster.hidden = true; if (x.id !== kit.hero?.id) kit.open(x.id); }; return b; })); };
  input.oninput = fill; input.onkeydown = (e) => { if (e.key === 'Enter') body.querySelector('button')?.click(); }; fill();
  const close = h('button', { type: 'button', class: 'btn', 'aria-label': T.close, html: icon('close', 18) }); close.onclick = () => { roster.hidden = true; };
  roster.replaceChildren(h('header', {}, h('h2', {}, T.heroes), h('label', { class: 'find', html: icon('search', 16) }, input), close), body);
  roster.hidden = false; input.focus();
};
shareButton($('[data-share]'), kit);
addEventListener('keydown', (e) => { if (e.key === 'Escape') { inv.hidden = true; roster.hidden = true; } });
render();
