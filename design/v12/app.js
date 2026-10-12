// Collection: as a shooter's collection screen. The hero's name huge behind him; his slots as a list on
// the left; the chosen slot's skins on the right. A click on a skin puts it on him, a click on the one
// he wears takes it off. A thing on him can be clicked to open its slot.
import { ATTRIBUTE, h, icon, lang, RARITY, rarityName, say, start } from '../kit.js';
import { shareButton } from '../parts.js';

const $ = (s) => document.querySelector(s);
const ru = lang === 'ru';
const T = ru
  ? { heroes: 'Герои', standard: 'Стандарт', empty: 'Пусто', off: 'нажмите ещё раз, чтобы снять', variants: 'Варианты', find: 'Поиск', none: 'Ничего не нашлось', findHero: 'Найти героя', close: 'Закрыть', skins: (n) => `${n} ${n % 10 === 1 && n % 100 !== 11 ? 'облик' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 'облика' : 'обликов'}` }
  : { heroes: 'Heroes', standard: 'Default', empty: 'Empty', off: 'click again to take it off', variants: 'Variants', find: 'Search', none: 'Nothing found', findHero: 'Find a hero', close: 'Close', skins: (n) => `${n} skins` };
const ACCENT = { str: '#e5533d', agi: '#4ec46b', int: '#3fa7e8', all: '#c58cf0' };
const ui = { slot: null, query: '', line: null };

const kit = await start($('[data-view]'), {
  viewer: { framing: 'hero' },
  onProgress: (a, b) => { $('[data-bar]').style.width = `${b ? (a / b) * 100 : 0}%`; },
  onLoading: (on) => { $('[data-loading]').hidden = !on; },
  onChange: (why) => { if (why === 'hero') { ui.slot = null; ui.query = ''; } render(); },
});

function render() {
  const hero = kit.hero; if (!hero) return;
  ui.slot ||= kit.slots()[0]?.name || null;
  document.documentElement.style.setProperty('--accent', ACCENT[hero.attribute]);
  document.title = `${say(hero.name)} — Loadout`;
  renderSlots(); renderTitle(); renderSkins();
}

// ---- left: the slots, a line each
function renderSlots() {
  const body = new Set(kit.bodySlots().map((s) => s.name));
  const pick = h('button', { type: 'button', class: 'pick', 'data-pick': '' }, h('span', { html: icon('back', 16) }), T.heroes); pick.onclick = openRoster;
  const share = h('button', { type: 'button', class: 'pick share' }); shareButton(share, kit);
  $('[data-slots]').replaceChildren(h('div', { class: 'head' }, pick, share), ...kit.slots().map((s) => {
    const id = kit.shown(s.name), it = kit.item(id), pic = id && kit.picture(id, kit.styleOf(s.name));
    const b = h('button', { type: 'button', class: 'slot', 'data-slot': s.name, 'aria-pressed': String(ui.slot === s.name), style: { '--r': it && !it.default ? RARITY[it.rarity] : 'transparent' } },
      h('span', { class: 'name' }, say(s.text)), h('span', { class: 'pic' }, pic ? h('img', { src: pic, alt: '' }) : null));
    b.onclick = () => choose(s.name);
    if (body.has(s.name)) { b.onmouseenter = () => { ui.line = s.name; }; b.onmouseleave = () => { ui.line = null; }; }
    return b;
  }));
}
function choose(slot) { ui.slot = slot; ui.query = ''; render(); }

// ---- over him: his name, and what the slot shows
function renderTitle() {
  const hero = kit.hero, s = kit.slots().find((x) => x.name === ui.slot);
  const id = s && kit.shown(s.name), it = kit.item(id);
  $('[data-title]').replaceChildren(
    h('p', { class: 'attr' }, h('img', { src: `/attributes/${hero.attribute}.webp`, alt: '' }), ATTRIBUTE[lang][hero.attribute]),
    h('h1', {}, say(hero.name)));
  $('[data-now]').replaceChildren(...(s ? [h('span', { class: 'state' }, say(s.text)), h('b', {}, !it ? T.empty : it.default ? T.standard : say(it.name)), it && !it.default ? h('span', { class: 'rar', style: { '--r': RARITY[it.rarity] } }, rarityName(it.rarity)) : null].filter(Boolean) : []));
}

// ---- right: the skins of the slot, its variants, Equip
function renderSkins() {
  const box = $('[data-skins]'), s = kit.slots().find((x) => x.name === ui.slot); if (!s) return box.replaceChildren();
  const worn = kit.shown(s.name), cur = kit.item(worn), style = kit.styleOf(s.name);
  const input = h('input', { type: 'search', placeholder: T.find, value: ui.query, 'aria-label': T.find });
  const grid = h('div', { class: 'grid', 'data-grid': '' });
  const fill = () => {
    const q = ui.query.trim().toLowerCase(), ids = s.items.filter((id) => !q || say(kit.item(id).name).toLowerCase().includes(q));
    grid.replaceChildren(...(ids.length ? ids.map((id) => {
      const it = kit.item(id);
      const b = h('button', { type: 'button', class: 'item', 'aria-pressed': String(id === worn), title: it.default ? T.standard : id === worn ? `${say(it.name)}: ${T.off}` : say(it.name), style: { '--r': it.default ? 'transparent' : RARITY[it.rarity] } },
        h('img', { src: kit.picture(id), alt: '', loading: 'lazy' }), id === worn ? h('span', { class: 'mark', html: icon('check', 12) }) : null);
      b.onclick = () => toggle(s, id); return b;
    }) : [h('p', { class: 'none' }, T.none)]));
  };
  input.oninput = () => { ui.query = input.value; fill(); }; fill();
  const variants = cur && !cur.default && cur.styles.length > 1
    ? h('div', { class: 'variants' }, h('h3', {}, T.variants), h('div', {}, ...cur.styles.map((st, i) => { const b = h('button', { type: 'button', 'aria-pressed': String(style === i), title: say(st.name) || String(i + 1) }, h('img', { src: kit.picture(worn, i), alt: say(st.name) || String(i + 1) })); b.onclick = () => kit.wear(s.name, worn, i); return b; })))
    : null;
  box.replaceChildren(...[h('header', {}, h('h2', {}, say(s.text)), h('span', {}, T.skins(s.items.length))), h('label', { class: 'find', html: icon('search', 16) }, input), grid, variants].filter(Boolean));
}

// A click puts a skin on; on the one he wears (not his own default) it takes it off again.
function toggle(s, id) { const it = kit.item(id), on = kit.look.worn[s.name]?.[0] === id; return kit.wear(s.name, on || it.default ? null : id, 0); }

// ---- pointing at him
const canvas = $('[data-view]'), tip = $('[data-tip]');
let down = null, last = 0, hover = null;
canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
canvas.addEventListener('pointermove', (e) => {
  if (e.buttons) { tip.hidden = true; return; }
  const now = performance.now(); if (now - last < 50) return; last = now;
  hover = kit.pick(e.clientX, e.clientY); canvas.style.cursor = hover ? 'pointer' : '';
  const s = hover && kit.slots().find((x) => x.name === hover); if (!s) { tip.hidden = true; return; }
  tip.textContent = say(s.text); tip.style.transform = `translate(${e.clientX + 14}px, ${e.clientY + 12}px)`; tip.hidden = false;
});
canvas.addEventListener('pointerleave', () => { tip.hidden = true; hover = null; });
canvas.addEventListener('click', (e) => { if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return; const slot = kit.pick(e.clientX, e.clientY); if (slot) { tip.hidden = true; choose(slot); } });
function lines() {
  requestAnimationFrame(lines);
  const svg = $('[data-leaders]'), slot = ui.line || hover;
  const row = slot && document.querySelector(`[data-slots] [data-slot="${slot}"]`), a = row && kit.anchor(slot, 'left');
  if (!a) { svg.innerHTML = ''; return; }
  const r = row.getBoundingClientRect(), y = r.top + r.height / 2;
  svg.innerHTML = `<path d="M${r.right + 8} ${y} H${r.right + 32} L${a.x} ${a.y}"/><path class="tick" d="M${a.x - 6} ${a.y} H${a.x + 6} M${a.x} ${a.y - 6} V${a.y + 6}"/>`;
}
requestAnimationFrame(lines);

// ---- the roster
const roster = $('[data-roster]');
function openRoster() {
  const input = h('input', { type: 'search', placeholder: T.findHero, 'aria-label': T.findHero });
  const list = h('div', { class: 'faces' });
  const fill = () => {
    const q = input.value.trim().toLowerCase();
    list.replaceChildren(...kit.heroes.filter((x) => !q || [x.name.en, x.name.ru, x.id].some((n) => n?.toLowerCase().includes(q))).map((x) => {
      const b = h('button', { type: 'button', 'aria-current': String(x.id === kit.hero?.id), style: { '--a': ACCENT[x.attribute] } }, h('img', { src: kit.portrait(x.id), alt: '', loading: 'lazy' }), h('span', {}, say(x.name)));
      b.onclick = () => { roster.hidden = true; if (x.id !== kit.hero?.id) kit.open(x.id); }; return b;
    }));
  };
  input.oninput = fill; input.onkeydown = (e) => { if (e.key === 'Enter') list.querySelector('button')?.click(); };
  fill();
  const close = h('button', { type: 'button', class: 'x', 'aria-label': T.close, html: icon('close', 20) }); close.onclick = () => { roster.hidden = true; };
  roster.replaceChildren(h('header', {}, h('h2', {}, T.heroes), h('label', { class: 'find', html: icon('search', 16) }, input), close), list);
  roster.hidden = false; input.focus();
}
addEventListener('keydown', (e) => { if (e.key === 'Escape') roster.hidden = true; });
render();
