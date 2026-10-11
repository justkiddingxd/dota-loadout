# Five directions for loadout.nyan.cafe

Brief: a fitting room for Dota 2 cosmetics. The hero is live in 3D; people put items on him, turn him,
take a picture, share the link. Audience: players (mostly Russian-speaking) who know the game's items by
sight. Job: try items on fast, see them, share. All five run the same `site/main.js`; only markup and CSS
differ. The current site (near-black panels, monospace caps labels, A · B meta, the same rounded card
everywhere) is the template look these move away from.

## 1. Arsenal — the outfit is the navigation
- Colour: slate #161b20, deep #0c1014, bronze #b08d57, parchment #e6dcc8, lichen #8a8f86. Items keep the
  game's rarity colours.
- Type: Barlow Semi Condensed only (500/600/700): tall, compact, reads like the game's own UI.
- Layout: the stage fills the window; a column of slot sockets down the left, each showing the item worn
  in it; the items of the chosen socket in a drawer on the right.
  ```
  [sock] |                stage                 | drawer: modes, search,
  [sock] |   Hero name                          |         item tiles
  [sock] |               (hero)                 |
  ```
- Principle: the loadout itself is the menu. Bronze marks what is chosen, nothing else is gold.

## 2. Studio — a photo studio and a ledger
- Colour: cyclorama #e3e6e9, paper #f6f7f8, ink #14171b, graphite #5b636c, rule #cdd2d7. Selection is ink
  (an inverted row), no accent hue; rarity colours darkened for light paper.
- Type: Schibsted Grotesk only.
- Layout: a light seamless backdrop behind the hero, as in a product shoot; items as a dense list
  (icon, name, rarity) instead of tiles, slot headers sticking as you scroll.
- Principle: light, quiet, fast to scan; the hero is the only object with colour.

## 3. Attribute — the name is the set
- Colour per attribute, deep ground and its tone: strength #2b0f0c / #c4402f, agility #0c2414 / #43a15b,
  intelligence #0b1a33 / #3f86d6, universal #1f1030 / #a868d8. Text #f1ede6.
- Type: Big Shoulders Display 900 for the hero's name only; Public Sans for everything else.
- Layout: the hero's name, enormous and cropped by the edges, stands behind him; items below in
  horizontal shelves, one per slot, scrolled sideways.
- Principle: one loud thing (the name); the tray is plain.

## 4. Draft — the pick phase of a broadcast
- Colour: night #0d1626, panel #15233a, white #eef2f7, steel #8696ad, Radiant #9ccc3f, Dire #d6492f.
- Type: Saira, condensed widths, italic for the hero's name.
- Layout: every hero always in a strip of portraits across the top, as in a draft; the stage cut on a
  slant against the items.
- Principle: Radiant green means chosen, Dire red means stop (recording, reset). Slants only where
  things meet.

## 5. Exhibit — a hero on a museum wall
- Colour: oxblood wall #3d1b1d, shadow #241012, spot #6b3134, label paper #ece5d8, ink #221a18, brass #c2a46a.
- Type: Instrument Serif for names, Instrument Sans for the rest.
- Layout: the hero lit by a spotlight on a dark red wall, a printed wall label in the corner naming him
  and what he wears; the items as a catalogue list beside.
- Principle: a still, curated mood; the label is the memorable thing.
