// Dock: the hero across the whole screen; his slots in a dock at the bottom, each showing what it
// wears; a slot lifts a rail of its items above the dock. The hero is chosen from a palette.
import { animName, ATTRIBUTE, h, icon, lang, RARITY, rarityName, say, start } from '../kit.js';

const $ = (s) => document.querySelector(s);
const ui = { slot: null, query: '' };
const T = lang === 'ru'
  ? { share: 'Ссылка', copied: 'Скопировано', find: 'Найти героя', findItem: 'Найти в слоте', none: 'Ничего не нашлось', items: (n) => `${n} ${n % 10 === 1 && n % 100 !== 11 ? 'предмет' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 'предмета' : 'предметов'}`, standard: 'Стандарт', close: 'Закрыть' }
  : { share: 'Link', copied: 'Copied', find: 'Find a hero', findItem: 'Find in this slot', none: 'Nothing found', items: (n) => `${n} items`, standard: 'Default', close: 'Close' };

const kit = await start($('[data-view]'), {
  viewer: { framing: 'hero' },
  onProgress: (a, b) => { $('[data-bar]').style.width = `${b ? (a / b) * 100 : 0}%`; },
  onLoading: (on) => { $('[data-loading]').hidden = !on; },
  onChange: (why) => { if (why === 'hero') { ui.slot = null; ui.query = ''; } render(); },
});

function render() { renderWho(); renderDock(); renderRail(); renderAnim(); }

function renderWho() {
  const hero = kit.hero; if (!hero) return;
  $('[data-who]').replaceChildren(h('img', { src: kit.portrait(hero.id, 'icon'), alt: '' }), h('span', { class: 'name' }, say(hero.name)), h('span', { class: 'attr' }, ATTRIBUTE[lang][hero.attribute]), h('span', { html: icon('down', 16) }));
  document.title = `${say(hero.name)} — Loadout`;
}

function renderDock() {
  $('[data-dock]').replaceChildren(...kit.slots().map((s) => {
    const id = kit.shown(s.name), it = kit.item(id), pic = id && kit.picture(id, kit.styleOf(s.name));
    const b = h('button', { type: 'button', class: 'slot', 'aria-pressed': String(ui.slot === s.name), 'aria-label': `${say(s.text)}: ${say(it?.name)}`, style: { '--r': it && !it.default ? RARITY[it.rarity] : 'transparent' } },
      pic ? h('img', { src: pic, alt: '' }) : h('span', { class: 'blank' }, say(s.text)), pic ? h('span', { class: 'tip' }, say(s.text)) : null);
    b.onclick = () => { ui.slot = ui.slot === s.name ? null : s.name; ui.query = ''; renderDock(); renderRail(true); };
    return b;
  }));
}

function renderRail(focus = false) {
  const rail = $('[data-rail]'), s = kit.slots().find((x) => x.name === ui.slot);
  rail.hidden = !s; document.body.classList.toggle('railed', !!s); if (!s) return;
  const shown = kit.shown(s.name), q = ui.query.trim().toLowerCase();
  const ids = s.items.filter((id) => !q || say(kit.item(id).name).toLowerCase().includes(q));
  const input = h('input', { type: 'search', placeholder: T.findItem, value: ui.query, 'aria-label': T.findItem });
  input.oninput = () => { ui.query = input.value; const pos = input.selectionStart; renderRail(); const i = $('[data-rail] input'); i.focus(); i.setSelectionRange(pos, pos); };
  const list = h('div', { class: 'strip', role: 'listbox', 'aria-label': say(s.text) }, ...ids.map((id) => {
    const it = kit.item(id), on = id === shown;
    const b = h('button', { type: 'button', class: 'item', role: 'option', 'aria-selected': String(on), style: { '--r': it.default ? 'rgba(255,255,255,.18)' : RARITY[it.rarity] } },
      h('span', { class: 'pic' }, h('img', { src: kit.picture(id), alt: '', loading: 'lazy' }), on ? h('span', { class: 'on', html: icon('check', 14) }) : null),
      h('span', { class: 'iname' }, it.default ? T.standard : say(it.name)), h('span', { class: 'rar' }, it.default ? say(s.text) : rarityName(it.rarity)));
    b.onclick = async () => { await kit.wear(s.name, id, 0); };
    return b;
  }));
  const item = kit.item(shown), styles = item && item.styles.length > 1 && !item.default
    ? h('div', { class: 'styles' }, ...item.styles.map((st, i) => { const b = h('button', { type: 'button', 'aria-pressed': String(kit.styleOf(s.name) === i) }, say(st.name) || String(i + 1)); b.onclick = () => kit.wear(s.name, shown, i); return b; }))
    : null;
  const close = h('button', { type: 'button', class: 'x', 'aria-label': T.close, html: icon('close', 18) }); close.onclick = () => { ui.slot = null; renderDock(); renderRail(); };
  rail.replaceChildren(h('header', {}, h('h2', {}, say(s.text)), h('span', { class: 'count' }, T.items(s.items.length)), h('label', { class: 'find', html: icon('search', 16) }, input), close),
    ids.length ? list : h('p', { class: 'none' }, T.none), styles);
  const cur = rail.querySelector('[aria-selected="true"]'); if (cur && focus) cur.scrollIntoView({ inline: 'center', block: 'nearest' });
}

// Animations: what he can do, in a short menu.
function renderAnim() {
  const box = $('[data-anim]'), list = kit.viewer.animations; if (!list.length) return box.replaceChildren();
  const sel = h('select', { 'aria-label': lang === 'ru' ? 'Анимация' : 'Animation' }, ...list.map((a) => h('option', { value: a.name }, animName(kit.hero, a))));
  sel.value = list.find((a) => a.activity === 'ACT_DOTA_LOADOUT')?.name || list[0].name;
  sel.onchange = () => kit.viewer.play(sel.value);
  box.replaceChildren(sel, h('span', { html: icon('down', 14) }));
}

// The share button says what it did.
const share = $('[data-share]');
const shareLabel = (done) => share.replaceChildren(h('span', { html: icon(done ? 'check' : 'link', 18) }), done ? T.copied : T.share);
shareLabel(false);
share.onclick = async () => { try { await navigator.clipboard.writeText(kit.link); } catch { /* no clipboard */ } shareLabel(true); setTimeout(() => shareLabel(false), 1600); };

// The palette: type a name, arrows and Enter.
const palette = $('[data-palette]');
function openPalette() {
  const input = h('input', { type: 'search', placeholder: T.find, 'aria-label': T.find });
  const list = h('ul', { role: 'listbox' }); let active = 0, found = [];
  const draw = () => {
    const q = input.value.trim().toLowerCase();
    found = kit.heroes.filter((x) => !q || [x.name.en, x.name.ru, x.id].some((n) => n?.toLowerCase().includes(q)));
    active = Math.min(active, Math.max(found.length - 1, 0));
    list.replaceChildren(...found.map((x, i) => { const li = h('li', { role: 'option', 'aria-selected': String(i === active) }, h('img', { src: kit.portrait(x.id, 'icon'), alt: '' }), h('span', {}, say(x.name)), h('small', {}, ATTRIBUTE[lang][x.attribute])); li.onclick = () => pick(x); return li; }));
    list.children[active]?.scrollIntoView({ block: 'nearest' });
  };
  const pick = (x) => { palette.close(); if (x.id !== kit.hero?.id) kit.open(x.id); };
  input.oninput = () => { active = 0; draw(); };
  input.onkeydown = (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); active = (active + (e.key === 'ArrowDown' ? 1 : -1) + found.length) % found.length; draw(); }
    if (e.key === 'Enter' && found[active]) pick(found[active]);
  };
  palette.replaceChildren(h('label', { class: 'find', html: icon('search', 18) }, input), list);
  draw(); palette.showModal(); input.focus();
}
$('[data-who]').onclick = openPalette;
palette.addEventListener('click', (e) => { if (e.target === palette) palette.close(); });
addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); }
  if (e.key === 'Escape' && ui.slot && !palette.open) { ui.slot = null; renderDock(); renderRail(); }
});
render();
