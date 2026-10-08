// Types of dota-loadout: every Dota 2 hero in the browser with three.js.
import type * as THREE from 'three';

export const DEFAULT_ASSETS: string;

export interface ViewerOptions {
  /** true: drag anywhere turns the hero; 'hero': only a drag that starts on him; false: none. */
  controls?: boolean | 'hero';
  /** What the wheel does. */
  wheel?: 'zoom' | 'turn' | false;
  /** 'hero': the hero with what fits of the pedestal; 'full': hero and pedestal whole. */
  framing?: 'hero' | 'full';
  pixelRatio?: number;
  /** 1, or 0.5 (the default on phones and machines of 4 GB or less). */
  textureScale?: number;
  /** Bloom's strength (0.35), or false for none. */
  bloom?: number | false;
  /** Depth-feathered effects (true). */
  softParticles?: boolean;
  /** Where heroes and items are found by id: https://loadout.nyan.cafe/ by default. */
  assets?: string;
  onProgress?(loaded: number, total: number): void;
  onAnimation?(name: string): void;
}

export interface Animation { name: string; activity: string; loop: boolean; modifiers?: string[] }
export interface KineticGem { id: number; name: { en: string; ru: string }; activities: [string, string][]; changes: string[] }
export interface Loaded { name: { en: string; ru: string }; animations: Animation[]; kinetic: KineticGem[] }
/** A folder's manifest and the address of a file in it, for bundlers. */
export interface Source { manifest: object; url(path: string): string }

export class HeroViewer {
  constructor(canvas: HTMLCanvasElement, options?: ViewerOptions);
  readonly canvas: HTMLCanvasElement;
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  assets: string;
  /** Stands the hero, his effects and his materials' clock still; he still turns. */
  paused: boolean;
  /** A hero: his id ('pudge'), a hero folder's address, or a Source. Null if another load came after. */
  load(source: string | Source): Promise<Loaded | null>;
  /** An item on a slot: its id, an item folder's address or a Source, in a style; null puts the default back. */
  wear(slot: string, source: number | string | Source | null, style?: number): Promise<void>;
  /** A prismatic gem's colour ('#rrggbb') in a slot's item, or null. */
  gem(slot: string, hex: string | null): void;
  /** An unusual effect (an id of the item's unusual list) on a slot's item, or null. */
  unusual(slot: string, id: number | null): void;
  /** A kinetic gem's activities in a slot's item (Loaded.kinetic[i].activities), or null. */
  kinetic(slot: string, activities: [string, string][] | null): void;
  /** Effects worn items put in place of the hero's that he shows only when he acts (his abilities'). */
  readonly abilityEffects: { slot: string; from: string; to: string }[];
  /** Starts one of them (its from) once at the hero, as worn items have it. False if there is none. */
  cast(system: string): boolean;
  /** The hero as an effigy of gold, frost, jade or stone on its pedestal, without effects; null: himself. Pause to keep a pose. */
  statue(stuff: 'gold' | 'frost' | 'jade' | 'stone' | null): Promise<void>;
  readonly effigy: string | null;
  readonly animations: Animation[];
  /** Plays an animation by name; looping ones stay, others return to the idle. Its length in seconds. */
  play(name: string): number;
  /** Turns the hero to an angle (radians), or by one. */
  rotate(angle: number, options?: { relative?: boolean }): void;
  /** 0.6 to 3. */
  zoom(value: number): void;
  unload(): void;
  dispose(): void;
}

export type Worn = Record<string, number | [number, number?]>;
export interface ParsedLoadout { hero: string | null; worn: Record<string, [number, number]>; gems: Record<string, string>; unusual: Record<string, number>; kinetic: Record<string, number> }
/** The site's addresses: #hero/slot=item.style~gem!unusual^kinetic,… */
export function parseLoadout(address: string): ParsedLoadout;
export function formatLoadout(loadout: { hero: string; worn?: Record<string, [number, number?] | number | null>; gems?: Record<string, string>; unusual?: Record<string, number>; kinetic?: Record<string, number> }): string;

export interface CatalogItem { name: { en: string; ru: string }; slot: string; rarity: string; default?: true; set?: string; prismatic?: string; unusual?: { id: number; name: { en: string; ru: string } }[]; styles: { name: { en: string; ru: string } | null; icon: string | null; form?: string }[] }
export interface Catalog { slots: { name: string; text: { en: string; ru: string }; persona?: number; items: number[] }[]; items: Record<string, CatalogItem>; sets: { key: string; name: { en: string; ru: string } | null; items: number[] }[] }

/** A hero in an outfit, as the site shows him: forms, gems, unusual effects and kinetic gems taken care of. */
export class Loadout {
  constructor(viewer: HeroViewer, options?: { assets?: string });
  readonly viewer: HeroViewer;
  hero: string | null;
  catalog: Catalog | null;
  worn: Record<string, [number, number] | null>;
  gems: Record<string, string>;
  unusual: Record<string, number>;
  kinetic: Record<string, number>;
  /** An address ('#terrorblade/hero_base=5957~gold'), or a hero's id with what he wears and { gems, unusual, kinetic } by slot. */
  show(hero: string, worn?: Worn, extras?: { gems?: Record<string, string>; unusual?: Record<string, number>; kinetic?: Record<string, number> }): Promise<this>;
  readonly address: string;
  heroes(): Promise<{ id: string; name: { en: string; ru: string }; attribute: string; animations: Animation[] }[]>;
  catalogOf(hero: string): Promise<Catalog>;
  gemColours(): Promise<{ key: string; hex: string; name: { en: string; ru: string } }[]>;
  wear(slot: string, id: number | null, style?: number): Promise<void>;
  gem(slot: string, key: string | null): Promise<void>;
  unusual(slot: string, id: number | null): void;
  kineticGem(slot: string, id: number | null): void;
  readonly kinetics: KineticGem[];
}

/** The ability (an index of abilities, the hero's in heroes/index.json) an effect is most likely for, by its file's name; -1 if none. */
export function abilityOf(system: string, abilities: { id: string; name?: { en: string } }[]): number;

export function heroMaterial(material: object, texture: (file: string, srgb?: boolean) => THREE.Texture, time: { value: number }, light: object, cube?: (file: string) => THREE.Texture): THREE.Material;
export const SOURCE_TO_GLTF: THREE.Matrix4;
export class Library { constructor(options: object) }
export class Simulation { constructor(definition: object, library: Library) }
