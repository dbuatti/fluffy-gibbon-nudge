/**
 * Art Direction Engine — turns song metadata into a controllable visual brief.
 *
 * Two jobs:
 *  1. Suggest moods, palettes, styles, textures, lighting and composition from
 *     whatever clues the song has (title, genre, tags, notes, description,
 *     Insight Timer themes, key, tempo). The UI lets the user pick, so the app
 *     proposes instead of asking the user to invent a visual language.
 *  2. Compose a release-grade image prompt from the chosen direction. Prompts
 *     are strictly abstract and deliberately never contain the raw song title,
 *     which keeps content filters happy and stops models painting literal
 *     objects ("storm" → a ship, "piano" → a grand piano).
 */

import type { AnalysisData, Improvisation } from '@/types/improvisation';
import { displayTitle } from './display-title';

export type ArtPromptMode = 'generic' | 'metadata';
export type ArtEnergy = 'still' | 'gentle' | 'flowing' | 'turbulent';

/**
 * How the picture is made. This matters more than the "style" word alone:
 * image models have no negative-prompt channel, so you cannot ask for "no hard
 * edges" — you have to positively describe a medium that behaves that way.
 * `render` carries those medium-specific clauses.
 */
export interface ArtMedium {
  id: string;
  name: string;
  /** Positive description of the medium, written for the model. */
  render: string;
  /** 0 = softest, bleeding, hand-made; 1 = crispest, graphic, vector-clean. */
  edge: number;
}

export interface ArtClues {
  title: string;
  genre: string;
  genre2: string;
  mood: string;
  key: string;
  tempo: number | null;
  tags: string[];
  description: string;
  notes: string;
  themes: string[];
  benefits: string[];
  practices: string;
  audience: string;
  /** True when there is enough metadata for the "from metadata" mode to mean something. */
  rich: boolean;
}

export interface ArtPalette {
  name: string;
  colors: string[];
}

export interface ArtSuggestions {
  moods: string[];
  palettes: ArtPalette[];
  styles: string[];
  textures: string[];
  lighting: string[];
  compositions: string[];
  energies: ArtEnergy[];
}

export interface ArtDirection {
  moods: string[];
  palette: ArtPalette;
  style: string;
  texture: string;
  lighting: string;
  composition: string;
  energy: ArtEnergy;
}

export const ART_PALETTES: Record<string, string[]> = {
  'Lavender Haze': ['#EFEAF7', '#D6CCEB', '#B3A3D9', '#7E6BA8', '#3B3350'],
  'Sage & Peach': ['#F7EDE3', '#EFCDB4', '#C7D2B4', '#8FA184', '#4D5A46'],
  'Midnight Steel': ['#0D141E', '#1E2B3B', '#3E5168', '#7E93AC', '#C9D6E2'],
  'Ember Glow': ['#120D09', '#3B2013', '#7C3D1F', '#C8702F', '#E9B45F'],
  'Deep Ocean': ['#04121F', '#0B2B42', '#1D5A73', '#5FA6B2', '#D2EAEA'],
  'Ivory & Ash': ['#F7F3EA', '#DED6C6', '#AAA294', '#6F685C', '#2C2924'],
  'Dawn Rose': ['#2C1C31', '#6D4162', '#BC7E92', '#E8B7BA', '#F8E4DA'],
  'Forest Mist': ['#0B1710', '#1D3B29', '#3F6C4C', '#82A57D', '#D8E5CA'],
  'Neon Dusk': ['#0A0A14', '#241C4F', '#5D2FA0', '#C251AA', '#F2A65A'],
  'Gold Leaf': ['#151009', '#3B2F15', '#8B6B2B', '#C9A34C', '#F3E4B4'],
  'Slate & Sky': ['#E8EDF2', '#C5D0DA', '#8FA3B6', '#566B80', '#2A3642'],
  'Clay & Moss': ['#F2E9DF', '#D9C0A8', '#B08968', '#7E8A6A', '#3F4A3A'],
};

const MOODS = [
  'serene', 'contemplative', 'melancholic', 'hopeful', 'bittersweet',
  'intimate', 'vast', 'weightless', 'warm', 'cool', 'tense', 'resolved',
  'dreamlike', 'grounded', 'nostalgic', 'luminous', 'hushed', 'searching',
  'still', 'restless', 'tender', 'solemn', 'playful', 'mysterious',
];

/**
 * The styles are now genuine *mediums* rather than adjectives. Ordered from
 * softest (bleeding, hand-made) to hardest (graphic) — `STYLE_EDGE` keeps the
 * ordering, and the suggestion engine can bias toward the soft end.
 */
const STYLES = [
  'wet-on-wet watercolour',
  'loose ink-and-wash',
  'gouache with visible brushwork',
  'soft pastel on textured paper',
  'layered translucent dye',
  'diffuse colour-field painting',
  'misted long-exposure abstraction',
  'impasto oil with soft edges',
  'frosted glass abstraction',
  'risograph grain',
  'hard-edge geometric abstraction',
  'vector-clean minimalism',
];

/** Edge hardness per style, 0 (softest) → 1 (hardest). Used to bias and to warn. */
const STYLE_EDGE: Record<string, number> = {
  'wet-on-wet watercolour': 0.05,
  'loose ink-and-wash': 0.15,
  'gouache with visible brushwork': 0.25,
  'soft pastel on textured paper': 0.2,
  'layered translucent dye': 0.1,
  'diffuse colour-field painting': 0.08,
  'misted long-exposure abstraction': 0.05,
  'impasto oil with soft edges': 0.35,
  'frosted glass abstraction': 0.4,
  'risograph grain': 0.55,
  'hard-edge geometric abstraction': 0.95,
  'vector-clean minimalism': 0.9,
};

/**
 * Positively-worded "keep it soft" clauses. Because these models ignore
 * negatives, softness has to be *requested*, not prohibited.
 */
const SOFT_EDGE_CLAUSES = [
  'soft feathered edges throughout',
  'pigment bleeding into damp paper, edges softening outward',
  'wet bleeding colour with gentle diffused outlines',
  'forms fading into one another through soft gradient',
  'hand-brushed edges with the paper grain showing through',
];

/**
 * Medium vocabulary that reliably produces watercolour behaviour in FLUX —
 * "material-focused" words work where the bare word "watercolour" does not.
 */
const MEDIUM_VOCAB: Record<string, string> = {
  'wet-on-wet watercolour': 'transparent layered washes, pigment pooling at the edges, wet-on-wet bleeding, granulation, the white of the paper glowing through',
  'loose ink-and-wash': 'diluted ink bleeding into wet paper, feathered edges, unpredictable blooms, restrained brush marks',
  'gouache with visible brushwork': 'opaque matte pigment, soft blended transitions, gentle bristle marks, chalky surface',
  'soft pastel on textured paper': 'dry pigment dust, smudged soft gradients, velvety blending, the tooth of the paper showing',
  'layered translucent dye': 'many thin transparent layers building depth, colour glowing through colour, no opaque areas',
  'diffuse colour-field painting': 'vast soft regions of colour, blurred boundaries, atmospheric diffusion',
  'misted long-exposure abstraction': 'motion-blurred light, veils of colour, everything softened and continuous',
  'impasto oil with soft edges': 'thick creamy paint, visible palette-knife passages, edges still blended and soft',
  'frosted glass abstraction': 'hazy diffusion, light scattered through misted glass, soft glows',
  'risograph grain': 'flat ink layers with visible paper grain, slight misregistration, soft ink spread',
  'hard-edge geometric abstraction': 'clean flat shapes, precise edges, solid fields of colour',
  'vector-clean minimalism': 'razor-sharp flat shapes, uniform colour, graphic precision',
};

const TEXTURES = [
  'cold-pressed watercolour paper',
  'soft watercolour bleed',
  'wet pigment pooling and blooming',
  'visible paper grain under thin washes',
  'dry-brush scumbling',
  'salt-textured watercolour',
  'frosted glass',
  'drifting mist',
  'raw linen',
  'matte paper',
  'photographic grain',
  'silk sheen',
];

const LIGHTING = [
  'soft diffused dawn light', 'low-key chiaroscuro', 'hazy backlight',
  'cool moonlit glow', 'warm rim light', 'overcast flat light',
  'dappled caustics', 'a single beam through haze', 'candlelit warmth',
  'a slow twilight gradient',
];

const COMPOSITIONS = [
  'a centred luminous core', 'an off-centre light well', 'a horizontal tonal band',
  'a gentle diagonal drift', 'a vignette around a glowing centre',
  'a full-bleed colour field', 'horizon-free layered depth', 'a radial bloom',
  'quiet negative space', 'interlocking soft forms',
];

const ENERGY_LABELS: Record<ArtEnergy, string> = {
  still: 'Still — held breath, minimal movement',
  gentle: 'Gentle — slow drift, soft motion',
  flowing: 'Flowing — continuous movement, rising and falling',
  turbulent: 'Turbulent — churning, high contrast, restless',
};

const ENERGY_BY_TEMPO = (tempo: number | null): ArtEnergy => {
  if (!tempo || tempo < 60) return 'still';
  if (tempo < 90) return 'gentle';
  if (tempo < 125) return 'flowing';
  return 'turbulent';
};

/** Human-readable colour name derived from HSL — avoids hard-coding 60 labels. */
export function colorName(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return 'tonal shade';
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d !== 0) {
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  if (h < 0) h += 360;

  if (s < 0.1) {
    if (l > 0.92) return 'pearl white';
    if (l < 0.1) return 'near-black';
    return l > 0.62 ? 'soft grey' : 'deep charcoal';
  }
  let base: string;
  if (h < 15 || h >= 345) base = 'rose red';
  else if (h < 35) base = 'warm coral';
  else if (h < 50) base = 'amber';
  else if (h < 70) base = 'gold';
  else if (h < 90) base = 'olive';
  else if (h < 150) base = 'sage green';
  else if (h < 175) base = 'teal';
  else if (h < 200) base = 'sea blue';
  else if (h < 230) base = 'slate blue';
  else if (h < 255) base = 'indigo';
  else if (h < 285) base = 'violet';
  else if (h < 320) base = 'plum';
  else base = 'dusty rose';

  const prefix = l > 0.8 ? 'pale ' : l < 0.26 ? 'deep ' : s < 0.32 ? 'muted ' : '';
  return prefix + base;
}

interface Traits {
  moods?: string[];
  palettes?: string[];
  styles?: string[];
  textures?: string[];
  lighting?: string[];
  energy?: ArtEnergy;
}

/** Keyword → visual traits. Deliberately broad: these are cues, not rules. */
const KEYWORD_TRAITS: { re: RegExp; traits: Traits }[] = [
  { re: /storm|thunder|wind|turbul|chaos/i, traits: { moods: ['tense', 'vast'], palettes: ['Midnight Steel', 'Slate & Sky'], textures: ['wet pigment pooling and blooming'], energy: 'turbulent' } },
  { re: /rain|drizzle|mist|fog|haze|smoke/i, traits: { moods: ['mysterious', 'hushed'], palettes: ['Slate & Sky', 'Midnight Steel'], textures: ['drifting mist'], lighting: ['a single beam through haze'] } },
  { re: /sun|dawn|sunrise|morning|light|golden|daybreak/i, traits: { moods: ['hopeful', 'luminous'], palettes: ['Dawn Rose', 'Gold Leaf'], lighting: ['soft diffused dawn light'] } },
  { re: /dusk|twilight|evening|night|moon|star|midnight/i, traits: { moods: ['contemplative', 'mysterious'], palettes: ['Lavender Haze', 'Neon Dusk'], lighting: ['cool moonlit glow'] } },
  { re: /fire|ember|burn|flame|smoulder/i, traits: { moods: ['warm', 'restless'], palettes: ['Ember Glow', 'Gold Leaf'], energy: 'flowing' } },
  { re: /ocean|sea|tide|wave|water|lake|river|rainfall/i, traits: { moods: ['vast', 'weightless'], palettes: ['Deep Ocean', 'Sage & Peach'], textures: ['soft watercolour bleed'] } },
  { re: /forest|tree|moss|leaf|garden|earth|soil|root/i, traits: { moods: ['grounded', 'tender'], palettes: ['Forest Mist', 'Clay & Moss'] } },
  { re: /winter|snow|ice|frost|cold/i, traits: { moods: ['still', 'solemn'], palettes: ['Slate & Sky', 'Ivory & Ash'], textures: ['frosted glass'] } },
  { re: /autumn|harvest|amber|rust|october/i, traits: { moods: ['nostalgic', 'bittersweet'], palettes: ['Ember Glow', 'Gold Leaf'] } },
  { re: /love|heart|tender|embrace|longing/i, traits: { moods: ['tender', 'intimate'], palettes: ['Dawn Rose', 'Sage & Peach'] } },
  { re: /grief|loss|goodbye|farewell|mourn|alone|absence/i, traits: { moods: ['melancholic', 'hushed'], palettes: ['Ivory & Ash', 'Midnight Steel'], energy: 'still' } },
  { re: /hope|rise|renew|heal|home|return/i, traits: { moods: ['hopeful', 'serene'], palettes: ['Dawn Rose', 'Gold Leaf'] } },
  { re: /dream|sleep|drift|float|weightless/i, traits: { moods: ['dreamlike', 'weightless'], palettes: ['Lavender Haze', 'Deep Ocean'], energy: 'gentle' } },
  { re: /prayer|sacred|spirit|hymn|devotion|meditat|silence/i, traits: { moods: ['serene', 'solemn'], palettes: ['Gold Leaf', 'Ivory & Ash'], lighting: ['soft diffused dawn light'], energy: 'still' } },
  { re: /child|play|joy|dance|alive/i, traits: { moods: ['playful', 'luminous'], palettes: ['Sage & Peach', 'Dawn Rose'], energy: 'flowing' } },
  { re: /dark|shadow|deep|void|nightfall/i, traits: { moods: ['mysterious', 'solemn'], palettes: ['Midnight Steel', 'Ivory & Ash'] } },
  { re: /bloom|flower|spring|blossom|seed/i, traits: { moods: ['tender', 'hopeful'], palettes: ['Sage & Peach', 'Dawn Rose'] } },
  { re: /mountain|cliff|stone|rock|canyon/i, traits: { moods: ['grounded', 'vast'], palettes: ['Clay & Moss', 'Slate & Sky'], textures: ['dry-brush scumbling'] } },
  { re: /time|memory|remember|yesterday|passing|fading/i, traits: { moods: ['nostalgic', 'contemplative'], palettes: ['Ivory & Ash', 'Slate & Sky'] } },
];

/** Genre → starting point when the text has few clues. */
const GENRE_TRAITS: { re: RegExp; traits: Traits }[] = [
  { re: /ambient|drone|soundscape|new age/i, traits: { moods: ['serene', 'vast'], palettes: ['Deep Ocean', 'Lavender Haze', 'Slate & Sky'], styles: ['misted long-exposure abstraction', 'diffuse colour-field painting'], energy: 'still' } },
  { re: /neo.?classical|classical|piano|chamber/i, traits: { moods: ['contemplative', 'tender'], palettes: ['Ivory & Ash', 'Dawn Rose'], styles: ['wet-on-wet watercolour', 'loose ink-and-wash'], energy: 'gentle' } },
  { re: /jazz|improvis/i, traits: { moods: ['playful', 'mysterious'], palettes: ['Ember Glow', 'Neon Dusk'], styles: ['gouache with visible brushwork', 'impasto oil with soft edges'], energy: 'flowing' } },
  { re: /electronic|synth|techno|experimental/i, traits: { moods: ['restless', 'dreamlike'], palettes: ['Neon Dusk', 'Deep Ocean'], styles: ['frosted glass abstraction', 'misted long-exposure abstraction'], energy: 'turbulent' } },
  { re: /folk|acoustic|singer.?songwriter/i, traits: { moods: ['grounded', 'nostalgic'], palettes: ['Clay & Moss', 'Sage & Peach'], styles: ['soft pastel on textured paper', 'wet-on-wet watercolour'], energy: 'gentle' } },
  { re: /cinematic|soundtrack|score|orchestral/i, traits: { moods: ['vast', 'tense'], palettes: ['Midnight Steel', 'Gold Leaf'], styles: ['impasto oil with soft edges', 'diffuse colour-field painting'], energy: 'turbulent' } },
  { re: /blues|soul|gospel/i, traits: { moods: ['bittersweet', 'intimate'], palettes: ['Ember Glow', 'Deep Ocean'], energy: 'gentle' } },
  { re: /rock|metal|punk|grunge/i, traits: { moods: ['restless', 'tense'], palettes: ['Midnight Steel', 'Ember Glow'], energy: 'turbulent' } },
  { re: /pop|indie|alternative/i, traits: { moods: ['luminous', 'playful'], palettes: ['Dawn Rose', 'Neon Dusk'], energy: 'flowing' } },
];

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  return Math.abs(hash);
}

/** Clamp to the 0–1 range, treating anything non-finite as 0. */
function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

export function collectArtClues(imp: Improvisation): ArtClues {
  const analysis = (imp.analysis_data || {}) as AnalysisData;
  const notes = (imp.notes || [])
    .map((n) => `${n.title || ''} ${n.content || ''}`.trim())
    .filter(Boolean)
    .join(' ');
  const tags = (imp.user_tags || []).filter(Boolean);
  const themes = (imp.insight_themes || []).filter(Boolean);
  const benefits = (imp.insight_benefits || []).filter(Boolean);
  const title = displayTitle(imp.generated_name || imp.original_name);
  const genre = (imp.primary_genre || '').trim();
  const description = (imp.description || '').trim();
  const tempo = typeof analysis.simulated_tempo === 'number' ? analysis.simulated_tempo : null;

  return {
    title,
    genre,
    genre2: (imp.secondary_genre || '').trim(),
    mood: (analysis.mood || '').trim(),
    key: (analysis.simulated_key || '').trim(),
    tempo,
    tags,
    description,
    notes,
    themes,
    benefits,
    practices: (imp.insight_practices || '').trim(),
    audience: (imp.insight_audience_level || '').trim(),
    rich: !!(genre || tags.length || description || notes || themes.length || analysis.mood),
  };
}

interface Scores {
  moods: Map<string, number>;
  palettes: Map<string, number>;
  styles: Map<string, number>;
  textures: Map<string, number>;
  lighting: Map<string, number>;
  compositions: Map<string, number>;
  energies: Map<ArtEnergy, number>;
}

function bump<T>(map: Map<T, number>, key: T, amount: number): void {
  map.set(key, (map.get(key) || 0) + amount);
}

function applyTraits(scores: Scores, traits: Traits, weight: number): void {
  traits.moods?.forEach((m) => bump(scores.moods, m, weight));
  traits.palettes?.forEach((p) => bump(scores.palettes, p, weight));
  // Style suggestions are deliberately damped: genre should *lean* the medium,
  // not lock it. At full weight the genre pinned the same four mediums for a
  // given song, which made the softness spectrum and "Suggest again" inert.
  traits.styles?.forEach((s) => bump(scores.styles, s, weight * 0.4));
  traits.textures?.forEach((t) => bump(scores.textures, t, weight));
  traits.lighting?.forEach((l) => bump(scores.lighting, l, weight));
  if (traits.energy) bump(scores.energies, traits.energy, weight);
}

function ranked<T>(pool: T[], scores: Map<T, number>, rng: () => number, count: number): T[] {
  return pool
    .map((item) => ({ item, score: (scores.get(item) || 0) + rng() }))
    .sort((a, b) => b.score - a.score)
    .slice(0, count)
    .map((entry) => entry.item);
}

/**
 * Rank styles with a soft-edge bias.
 *
 * `softBias` (0 → 1) is a *ceiling*, and that is the whole point: it defines
 * which mediums are eligible at all, then the song's own scores and the RNG
 * decide among them. That is what makes the control behave like a spectrum —
 * at 0 the full range (including hard-edge and vector) is in play, and as it
 * rises the graphic mediums fall out of contention entirely.
 *
 * An earlier version *rewarded* softness instead of gating it. Because genre
 * traits already pinned a few mediums for a given song, the reward could never
 * out-vote them, so every softness setting returned the same four styles and
 * the control looked broken.
 */
function rankStyles(
  scores: Map<string, number>,
  rng: () => number,
  count: number,
  softBias: number,
): string[] {
  const bias = clamp01(softBias);
  // Edge score past which a medium is excluded. bias 0 → ~everything eligible
  // (full range, graphic mediums included); bias 1 → only the genuinely soft
  // mediums survive. The ceiling must *fall* as softness rises.
  const ceiling = 1.05 - bias * 0.75;
  const eligible = STYLES.filter((s) => (STYLE_EDGE[s] ?? 0.5) <= ceiling);
  const pool = eligible.length >= count ? eligible : STYLES;
  return pool
    .map((style) => ({ style, score: (scores.get(style) || 0) + rng() * 1.5 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, count)
    .map((entry) => entry.style);
}

/**
 * Suggest a full art direction from the song's clues. Deterministic for a given
 * song + salt, so "Suggest again" is the only thing that reshuffles it.
 */
export function suggestArtDirection(clues: ArtClues, salt = 0, softness = 0.85): ArtSuggestions {
  const scores: Scores = {
    moods: new Map(), palettes: new Map(), styles: new Map(),
    textures: new Map(), lighting: new Map(), compositions: new Map(),
    energies: new Map(),
  };

  const haystack = [
    clues.title, clues.mood, clues.description, clues.notes,
    clues.tags.join(' '), clues.themes.join(' '), clues.benefits.join(' '),
    clues.practices, clues.genre, clues.genre2,
  ].join(' ').toLowerCase();

  for (const { re, traits } of KEYWORD_TRAITS) {
    if (re.test(haystack)) applyTraits(scores, traits, 3);
  }
  for (const { re, traits } of GENRE_TRAITS) {
    if (re.test(clues.genre) || re.test(clues.genre2) || re.test(haystack)) {
      applyTraits(scores, traits, 2);
    }
  }

  // Musical fundamentals still say a lot about the visuals.
  const tempoEnergy = ENERGY_BY_TEMPO(clues.tempo);
  bump(scores.energies, tempoEnergy, 2);
  if (clues.tempo && clues.tempo < 70) {
    bump(scores.moods, 'hushed', 2);
    bump(scores.moods, 'intimate', 1);
    bump(scores.textures, 'visible paper grain under thin washes', 1);
  }
  if (clues.key && /m(inor)?\b/i.test(clues.key)) {
    bump(scores.moods, 'melancholic', 2);
    bump(scores.moods, 'contemplative', 1);
  }
  if (clues.key && /maj/i.test(clues.key)) {
    bump(scores.moods, 'hopeful', 2);
    bump(scores.moods, 'luminous', 1);
  }
  if (clues.benefits.some((b) => /calm|relax|sleep|anxiety|stress/i.test(b))) {
    bump(scores.moods, 'serene', 2);
    bump(scores.palettes, 'Lavender Haze', 1);
  }

  const rng = mulberry32(
    hashString(`${haystack}|${clues.genre}|${clues.key}|${clues.tempo}|${salt}`),
  );

  const paletteNames = Object.keys(ART_PALETTES);
  const palettePicks = ranked(paletteNames, scores.palettes, rng, 3);

  return {
    moods: unique([
      ...ranked(MOODS, scores.moods, rng, 6),
      'contemplative', 'serene',
    ]).slice(0, 8),
    palettes: palettePicks.map((name) => ({ name, colors: ART_PALETTES[name] })),
    styles: rankStyles(scores.styles, rng, 5, softness),
    textures: ranked(TEXTURES, scores.textures, rng, 5),
    lighting: ranked(LIGHTING, scores.lighting, rng, 5),
    compositions: ranked(COMPOSITIONS, scores.compositions, rng, 5),
    energies: ranked(['still', 'gentle', 'flowing', 'turbulent'] as ArtEnergy[], scores.energies, rng, 4),
  };
}

export function defaultDirection(s: ArtSuggestions): ArtDirection {
  return {
    moods: s.moods.slice(0, 2),
    palette: s.palettes[0],
    style: s.styles[0],
    texture: s.textures[0],
    lighting: s.lighting[0],
    composition: s.compositions[0],
    energy: s.energies[0],
  };
}

/** Keep a hand-picked direction valid when suggestions are reshuffled. */
export function reconcileDirection(direction: ArtDirection, s: ArtSuggestions): ArtDirection {
  const palette = s.palettes.find((p) => p.name === direction.palette.name) || s.palettes[0];
  const keepMoods = direction.moods.filter((m) => s.moods.includes(m));
  return {
    moods: keepMoods.length ? keepMoods : s.moods.slice(0, 2),
    palette,
    style: s.styles.includes(direction.style) ? direction.style : s.styles[0],
    texture: s.textures.includes(direction.texture) ? direction.texture : s.textures[0],
    lighting: s.lighting.includes(direction.lighting) ? direction.lighting : s.lighting[0],
    composition: s.compositions.includes(direction.composition) ? direction.composition : s.compositions[0],
    energy: s.energies.includes(direction.energy) ? direction.energy : s.energies[0],
  };
}

function joinList(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

const FORM_BY_ENERGY: Record<ArtEnergy, string> = {
  still: 'a quiet near-monochrome field, one or two soft breaths of colour, generous empty space',
  gentle: 'slow overlapping translucent washes and soft-edged organic blooms drifting into one another',
  flowing: 'long sweeping ribbons of wet colour, pigment bleeding and pooling as it travels, layered translucency',
  turbulent: 'churning wet colour colliding and marbling, blooms bursting and softening, dense layered depth',
};

/** Medium-specific rendering clauses, so "watercolour" behaves like watercolour. */
export const MEDIUM_RENDER: Record<string, string> = MEDIUM_VOCAB;

/** Edge hardness per style, 0 (softest) → 1 (hardest). Exposed so the UI can warn. */
export { STYLE_EDGE };

/** True when a style produces crisp, graphic edges the user usually wants to avoid. */
export function isHardEdgeStyle(style: string): boolean {
  return (STYLE_EDGE[style] ?? 0) > 0.6;
}

/** All known style/medium names, softest first — for UI lists. */
export function stylesBySoftness(): string[] {
  return [...STYLES].sort((a, b) => (STYLE_EDGE[a] ?? 0.5) - (STYLE_EDGE[b] ?? 0.5));
}

/** Words that would make a model paint the object instead of the feeling. */
const LITERAL_BLOCKLIST = /piano|guitar|drum|violin|cello|sax|voice|vocal|singer|instrument|song|track|album|music/i;

function atmosphericThemes(clues: ArtClues): string[] {
  const raw = [...clues.themes, ...clues.tags];
  return unique(
    raw
      .map((t) => t.replace(/^#/, '').replace(/[_-]+/g, ' ').trim().toLowerCase())
      .filter((t) => t.length > 2 && t.length < 32 && !LITERAL_BLOCKLIST.test(t)),
  ).slice(0, 4);
}

const article = (phrase: string): string => (/^[aeiou]/i.test(phrase) ? 'an' : 'a');

function metadataSentence(clues: ArtClues): string {
  const kind = [clues.genre, clues.genre2].filter(Boolean).join(' / ').toLowerCase();
  const detail = [
    clues.key ? `in ${clues.key}` : '',
    clues.tempo ? `at ${clues.tempo} BPM` : '',
  ].filter(Boolean).join(' ');
  const themes = atmosphericThemes(clues);
  const atmosphere = themes.length ? `, shaped by ${joinList(themes)},` : '';
  if (!kind && !detail && !atmosphere) return '';
  const subject = kind ? `${article(kind)} ${kind} piece` : 'the piece';
  return `Translating the atmosphere of ${subject}${detail ? ` ${detail}` : ''}${atmosphere} into pure colour, light and texture.`;
}

/**
 * The prompt actually sent to the image model. Keep it abstract, explicit and
 * free of the title, names and literal objects.
 *
 * Written for models with *no negative-prompt channel* (FLUX), so softness is
 * always requested positively, and the medium vocabulary carries the weight —
 * "watercolour" alone does nothing; "wet-on-wet bleeding, pigment pooling,
 * paper grain" does.
 */
export function buildArtPrompt(
  direction: ArtDirection,
  clues: ArtClues,
  mode: ArtPromptMode,
): string {
  const colors = direction.palette.colors
    .map((hex) => `${colorName(hex)} (${hex})`)
    .join(', ');
  const metadata = mode === 'metadata' ? metadataSentence(clues) : '';
  const medium = MEDIUM_VOCAB[direction.style] || '';
  const edge = STYLE_EDGE[direction.style] ?? 0.3;
  const soft = edge <= 0.55;

  const parts = [
    soft
      ? `Abstract album cover, square 1:1, painted as a ${direction.style}.`
      : `Abstract album cover, square 1:1, in a ${direction.style} treatment.`,
    medium ? `${medium}.` : '',
    `Mood: ${joinList(direction.moods)}; ${direction.energy} energy.`,
    `Palette: ${direction.palette.name} — ${colors}.`,
    `Form: ${FORM_BY_ENERGY[direction.energy]}.`,
    `Composition: ${direction.composition}, with generous crop-safe margins.`,
    `Surface: ${direction.texture}.`,
    `Light: ${direction.lighting}.`,
    metadata,
    soft ? `Edges stay soft and indeterminate — ${SOFT_EDGE_CLAUSES[edge < 0.2 ? 0 : edge < 0.4 ? 1 : 2]}.` : '',
    'Strictly non-representational: no text, letters, numbers, logos, watermarks, signatures, borders, people, faces, hands, instruments, or recognizable objects.',
    soft
      ? 'Hand-painted feel, gallery-quality, ultra-detailed, high resolution, 3000×3000.'
      : 'Gallery-quality, ultra-detailed, high resolution, 3000×3000.',
  ].filter(Boolean);

  return parts.join(' ');
}

/** Shown in the UI so the prompt philosophy is visible, not folklore. */
export const ART_PROMPT_NOTES = [
  'The song title never enters the image prompt — titles leak literal objects and trip content filters.',
  'Metadata becomes atmosphere (mood, colour, light), not nouns.',
  'These models have no "negative prompt", so softness is asked for positively — wet bleeding, feathered edges — never just "not hard".',
  'Styles are real mediums (watercolour, ink-and-wash, pastel), not adjectives, because FLUX responds to material words.',
  'Hard-edge styles are available but never the default; the suggestion engine leans soft.',
  'AI images are generated at 1024px, then exported at 3000×3000 for release.',
];
