// Catalog: browsing first, as in a clothes shop. Every item for the hero in a large grid, filters at
// the side, and a fitting room that stays in view: the hero in what was picked, and the list of it.
import { ATTRIBUTE, h, icon, lang, RARITY, rarityName, say, start } from '../kit.js';

const $ = (s) => document.querySelector(s);
const ru = lang === 'ru';
const T = ru
  ? { all: 'Все вещи', slots: 'Слот', rarity: 'Редкость', find: 'Искать вещи героя', findHero: 'Найти героя', share: 'Ссылка', copied: 'Скопировано', worn: 'Надето', wearing: 'На герое', nothing: 'Пока всё стандартное. Выберите вещь в каталоге.', off: 'Снять', none: 'Ничего не нашлось', items: (n) => `${n} ${n % 10 === 1 && n % 100 !== 11 ? 'вещь' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 'вещи' : 'вещей'}`, reset: 'Сбросить фильтры' }
  : { all: 'All items', slots: 'Slot', rarity: 'Rarity', find: "Search this hero's items", findHero: 'Find a hero', share: 'Link', copied: 'Copied', worn: 'Worn', wearing: 'On the hero', nothing: 'All default so far. Pick an item in the catalog.', off: 'Take off', none: 'Nothing found', items: (n) => `${n} items`, reset: 'Clear filters' };
const RANK = ['common', 'uncommon', 'rare', 'mythical', 'legendary', 'immortal', 'arcana', 'ancient', 'seasonal'];
const ui = { slot: null, rarity: new Set(), q: '' };

const kit = await start($('[data-view]'), {
  viewer: { framing: 'hero' },
  onProgress: (a, b) => { $('[data-bar]').style.width = `${b ? (a / b) * 100 : 0}%`; },
  onLoading: (on) => { $('[data-loading]').hidden = !on; },
  onChange: (why) => { if (why === 'hero') { ui.slot = null; ui.rarity.clear(); ui.q = ''; $('[data-q]').value = ''; } render(); },
});

// Everything the hero can wear that is not his own default.
const goods = () => kit.slots().flatMap((s) => s.items.filter((id) => !kit.item(id).default).map((id) => ({ id, slot: s, it: kit.item(id) })));
function render() { renderWho(); renderFilters(); renderCatalog(); renderWorn(); }

function renderWho() {
  const hero = kit.hero; if (!hero) return;
  $('[data-who]').replaceChildren(h('img', { src: kit.portrait(hero.id, 'icon'), alt: '' }), h('span', {}, say(hero.name)), h('span', { html: icon('down', 16) }));
  $('[data-q]').placeholder = T.find; document.title = `${say(hero.name)} — Loadout`;
}

function renderFilters() {
  const all = goods();
  const slotBtn = (s, label, n) => { const b = h('button', { type: 'button', 'data-slot': s?.name || '', 'aria-pressed': String(ui.slot === (s?.name || null)) }, h('span', {}, label), h('small', {}, String(n))); b.onclick = () => { ui.slot = s?.name || null; render(); }; return b; };
  const rarities = RANK.filter((r) => all.some((g) => g.it.rarity === r));
  $('[data-filters]').replaceChildren(
    h('h3', {}, T.slots), h('div', { class: 'list' }, slotBtn(null, T.all, all.length), ...kit.slots().map((s) => [s, all.filter((g) => g.slot === s).length]).filter(([, n]) => n).map(([s, n]) => slotBtn(s, say(s.text), n))),
    h('h3', {}, T.rarity), h('div', { class: 'checks' }, ...rarities.map((r) => {
      const input = h('input', { type: 'checkbox', checked: ui.rarity.has(r) }); input.onchange = () => { if (input.checked) ui.rarity.add(r); else ui.rarity.delete(r); renderCatalog(); };
      return h('label', {}, input, h('i', { style: { '--r': RARITY[r] } }), rarityName(r));
    })));
}

function renderCatalog() {
  const q = ui.q.trim().toLowerCase();
  const list = goods().filter((g) => (!ui.slot || g.slot.name === ui.slot) && (!ui.rarity.size || ui.rarity.has(g.it.rarity)) && (!q || say(g.it.name).toLowerCase().includes(q)));
  const title = ui.slot ? say(kit.slots().find((s) => s.name === ui.slot)?.text) : T.all;
  const grid = h('div', { class: 'grid' }, ...list.map(({ id, slot, it }) => {
    const on = kit.look.worn[slot.name]?.[0] === id;
    const b = h('button', { type: 'button', class: 'product', 'aria-pressed': String(on) },
      h('span', { class: 'pic' }, h('img', { src: kit.picture(id), alt: '', loading: 'lazy' }), on ? h('span', { class: 'tag' }, h('span', { html: icon('check', 14) }), T.worn) : null),
      h('span', { class: 'pname' }, say(it.name)),
      h('span', { class: 'meta' }, h('span', { class: 'r', style: { '--r': RARITY[it.rarity] } }, rarityName(it.rarity)), ui.slot ? null : h('span', {}, say(slot.text)), it.styles.length > 1 ? h('span', {}, ru ? `${it.styles.length} ${it.styles.length < 5 ? 'стиля' : 'стилей'}` : `${it.styles.length} styles`) : null));
    b.onclick = () => kit.wear(slot.name, on ? null : id, 0);
    return b;
  }));
  const clear = h('button', { type: 'button', class: 'link' }, T.reset); clear.onclick = () => { ui.slot = null; ui.rarity.clear(); ui.q = ''; $('[data-q]').value = ''; render(); };
  $('[data-catalog]').replaceChildren(h('header', {}, h('h1', {}, title), h('span', {}, T.items(list.length))), list.length ? grid : h('p', { class: 'none' }, T.none, ' ', clear));
}

// The fitting room's list: what is on him, each slot's item, and a way to take it off.
function renderWorn() {
  const on = kit.slots().map((s) => [s, kit.look.worn[s.name]]).filter(([, w]) => w);
  $('[data-worn]').replaceChildren(h('h2', {}, T.wearing), on.length ? h('ul', {}, ...on.map(([s, [id, style]]) => {
    const it = kit.item(id), off = h('button', { type: 'button', class: 'off', 'aria-label': `${T.off}: ${say(it.name)}`, html: icon('close', 16) }); off.onclick = () => kit.wear(s.name, null);
    const styles = it.styles.length > 1 ? h('div', { class: 'styles' }, ...it.styles.map((st, i) => { const b = h('button', { type: 'button', 'aria-pressed': String(style === i) }, say(st.name) || String(i + 1)); b.onclick = () => kit.wear(s.name, id, i); return b; })) : null;
    return h('li', {}, h('img', { src: kit.picture(id, style), alt: '' }), h('div', {}, h('small', {}, say(s.text)), h('b', {}, say(it.name)), styles), off);
  })) : h('p', {}, T.nothing));
}

$('[data-q]').oninput = (e) => { ui.q = e.target.value; renderCatalog(); };
const share = $('[data-share]');
const shareLabel = (done) => share.replaceChildren(h('span', { html: icon(done ? 'check' : 'link', 18) }), done ? T.copied : T.share);
shareLabel(false);
share.onclick = async () => { try { await navigator.clipboard.writeText(kit.link); } catch { /* no clipboard */ } shareLabel(true); setTimeout(() => shareLabel(false), 1600); };

// Heroes: a panel that drops from the header, like a shop's menu.
const panel = $('[data-heroes]'), who = $('[data-who]');
const closeHeroes = () => { panel.hidden = true; who.setAttribute('aria-expanded', 'false'); };
who.onclick = () => {
  if (!panel.hidden) return closeHeroes();
  const input = h('input', { type: 'search', placeholder: T.findHero, 'aria-label': T.findHero });
  const cols = h('div', { class: 'cols' });
  const fill = () => {
    const q = input.value.trim().toLowerCase();
    cols.replaceChildren(...['str', 'agi', 'int', 'all'].map((a) => h('div', {}, h('h3', {}, ATTRIBUTE[lang][a]), h('ul', {}, ...kit.heroes.filter((x) => x.attribute === a && (!q || [x.name.en, x.name.ru, x.id].some((n) => n?.toLowerCase().includes(q)))).map((x) => {
      const b = h('button', { type: 'button', 'aria-current': String(x.id === kit.hero?.id) }, h('img', { src: kit.portrait(x.id, 'icon'), alt: '', loading: 'lazy' }), say(x.name)); b.onclick = () => { closeHeroes(); if (x.id !== kit.hero?.id) kit.open(x.id); }; return h('li', {}, b);
    })))));
  };
  input.oninput = fill; fill();
  panel.replaceChildren(h('label', { class: 'find', html: icon('search', 18) }, input), cols);
  panel.hidden = false; who.setAttribute('aria-expanded', 'true'); input.focus();
};
addEventListener('keydown', (e) => { if (e.key === 'Escape') closeHeroes(); });
addEventListener('click', (e) => { if (!panel.hidden && !panel.contains(e.target) && !who.contains(e.target)) closeHeroes(); });
render();
