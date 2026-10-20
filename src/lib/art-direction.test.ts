import { describe, expect, it } from 'vitest';
import type { Improvisation } from '@/types/improvisation';
import {
  ART_PALETTES,
  buildArtPrompt,
  collectArtClues,
  defaultDirection,
  isHardEdgeStyle,
  MEDIUM_RENDER,
  reconcileDirection,
  STYLE_EDGE,
  stylesBySoftness,
  suggestArtDirection,
} from './art-direction';

const song = {
  id: 'test-id',
  generated_name: '20261017 - A single line of sunlight cutting through smoke',
  original_name: null,
  artwork_prompt: null,
  primary_genre: 'Ambient',
  secondary_genre: 'Neoclassical',
  analysis_data: { mood: 'contemplative', simulated_key: 'D minor', simulated_tempo: 62 },
  user_tags: ['healing', 'rain', 'solitude'],
  description: 'Recorded at dawn after a storm.',
  notes: [{ id: '1', title: 'Session', color: 'blue', content: 'Felt piano, una corda.' }],
  insight_themes: ['release', 'stillness'],
  insight_benefits: ['stress relief', 'deep calm'],
  insight_practices: 'Body scan',
  insight_audience_level: 'beginner',
  insight_audience_age: ['adults'],
  is_piano: true,
  is_improvisation: true,
  file_name: null,
  storage_path: null,
  status: 'completed',
  is_ready_for_release: false,
  is_instrumental: true,
  is_original_song: true,
  has_explicit_lyrics: false,
  is_metadata_confirmed: false,
  insight_content_type: null,
  insight_language: null,
  insight_primary_use: null,
  insight_voice: null,
  created_at: new Date().toISOString(),
} as unknown as Improvisation;

describe('art direction engine', () => {
  it('strips the date prefix from the title', () => {
    expect(collectArtClues(song).title).toBe(
      'A single line of sunlight cutting through smoke',
    );
  });

  it('ships coherent five-colour palettes', () => {
    for (const colors of Object.values(ART_PALETTES)) {
      expect(colors).toHaveLength(5);
      for (const hex of colors) expect(hex).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('is deterministic per salt and reshuffles with a new salt', () => {
    const clues = collectArtClues(song);
    const a = suggestArtDirection(clues, 0);
    const b = suggestArtDirection(clues, 0);
    const c = suggestArtDirection(clues, 1);
    expect(a).toEqual(b);
    expect(a.palettes).not.toEqual(c.palettes);
  });

  it('reads mood, key, tempo and genre into the suggestions', () => {
    const s = suggestArtDirection(collectArtClues(song), 0);
    expect(s.moods.length).toBeGreaterThan(0);
    expect(s.palettes).toHaveLength(3);
    // 62 BPM + D minor should favour calm, slow energy
    expect(s.energies[0]).toBe('gentle');
    expect(s.moods).toContain('contemplative');
  });

  it('never leaks the song title or literal instruments into the prompt', () => {
    const clues = collectArtClues(song);
    const prompt = buildArtPrompt(defaultDirection(suggestArtDirection(clues, 0)), clues, 'metadata');
    expect(prompt.toLowerCase()).not.toContain('single line of sunlight');
    expect(prompt.toLowerCase()).not.toContain('piano');
    expect(prompt.toLowerCase()).not.toContain('storm');
  });

  it('keeps the guardrails and the high-resolution target', () => {
    const clues = collectArtClues(song);
    const prompt = buildArtPrompt(defaultDirection(suggestArtDirection(clues, 0)), clues, 'generic');
    expect(prompt).toMatch(/no text/i);
    expect(prompt).toMatch(/3000×3000/);
    expect(prompt).toMatch(/crop-safe/i);
  });

  it('generic mode contains no song metadata sentence', () => {
    const clues = collectArtClues(song);
    const direction = defaultDirection(suggestArtDirection(clues, 0));
    const generic = buildArtPrompt(direction, clues, 'generic');
    const metadata = buildArtPrompt(direction, clues, 'metadata');
    expect(metadata).toMatch(/Translating the atmosphere/i);
    expect(metadata).toContain(
      'Translating the atmosphere of an ambient / neoclassical piece in D minor at 62 BPM, shaped by',
    );
    expect(generic).not.toMatch(/Translating the atmosphere/i);
  });

  it('keeps hand-picked values when suggestions are reshuffled', () => {
    const clues = collectArtClues(song);
    const first = defaultDirection(suggestArtDirection(clues, 0));
    const next = suggestArtDirection(clues, 7);
    const chosenMood = next.moods[0];
    const reconciled = reconcileDirection({ ...first, moods: [chosenMood] }, next);
    expect(reconciled.moods).toEqual([chosenMood]);
    expect(next.palettes).toContainEqual(reconciled.palette);
  });

  describe('soft-edge spectrum', () => {
    it('defaults every suggested style to a soft medium', () => {
      const clues = collectArtClues(song);
      const s = suggestArtDirection(clues, 0);
      for (const style of s.styles) {
        expect(isHardEdgeStyle(style)).toBe(false);
      }
    });

    it('keeps styles soft across many salts at the default softness', () => {
      const clues = collectArtClues(song);
      for (let salt = 0; salt < 25; salt++) {
        const s = suggestArtDirection(clues, salt);
        expect(s.styles.some(isHardEdgeStyle)).toBe(false);
      }
    });

    it('lets hard-edge styles through at softness 0 across salts', () => {
      const clues = collectArtClues(song);
      // With no soft bias, hard-edge mediums are genuinely in play — over a few
      // "Suggest again" presses at least one surfaces.
      const surfaced = Array.from({ length: 25 }, (_, salt) =>
        suggestArtDirection(clues, salt, 0).styles.some(isHardEdgeStyle),
      );
      expect(surfaced.some(Boolean)).toBe(true);
    });

    it('keeps full softness inside the soft tier while still offering variety', () => {
      const clues = collectArtClues(song);
      // At full softness nothing graphic may appear, and the mediums chosen must
      // stay in the soft end. Variety *within* the soft band is intentional —
      // pinning one medium made the spectrum control feel dead.
      const softestEdge = STYLE_EDGE[stylesBySoftness()[0]];
      const softCeiling = softestEdge + 0.35;
      const seen = new Set<string>();
      for (let salt = 0; salt < 15; salt++) {
        const s = suggestArtDirection(clues, salt, 1);
        expect(s.styles.some(isHardEdgeStyle)).toBe(false);
        for (const style of s.styles) {
          expect(STYLE_EDGE[style]).toBeLessThanOrEqual(softCeiling);
          seen.add(style);
        }
      }
      // ...and it is not the same single medium every single time.
      expect(seen.size).toBeGreaterThan(1);
    });

    it('ranks styles monotonically softer as the spectrum rises', () => {
      const clues = collectArtClues(song);
      // Average the style edges over many "Suggest again" presses, so the check
      // reflects the spectrum rather than one lucky salt.
      const meanEdge = (softness: number) => {
        let sum = 0, n = 0;
        for (let salt = 0; salt < 40; salt++) {
          for (const s of suggestArtDirection(clues, salt, softness).styles) {
            sum += STYLE_EDGE[s] ?? 0.5;
            n++;
          }
        }
        return sum / n;
      };
      expect(meanEdge(1)).toBeLessThan(meanEdge(0));
      expect(meanEdge(0.85)).toBeLessThanOrEqual(meanEdge(0.5));
    });

    it('asks for softness positively rather than only forbidding hard edges', () => {
      const clues = collectArtClues(song);
      const direction = { ...defaultDirection(suggestArtDirection(clues, 0)), style: 'wet-on-wet watercolour' };
      const prompt = buildArtPrompt(direction, clues, 'generic');
      // Positive medium vocabulary (what actually makes FLUX render watercolour).
      expect(prompt).toMatch(/pigment pooling/i);
      expect(prompt).toMatch(/bleeding|feathered/i);
      // And the "keep it soft" instruction is phrased positively, not as a ban.
      expect(prompt).toMatch(/edges stay soft|soft feathered edges/i);
      expect(prompt).not.toMatch(/\bno hard edges\b/i);
    });

    it('drops the softness clause for an explicitly hard-edge medium', () => {
      const clues = collectArtClues(song);
      const direction = { ...defaultDirection(suggestArtDirection(clues, 0)), style: 'vector-clean minimalism' };
      const prompt = buildArtPrompt(direction, clues, 'generic');
      expect(prompt).not.toMatch(/soft feathered edges/i);
      expect(prompt).toMatch(/razor-sharp|graphic precision/i);
    });

    it('keeps every style name a real medium the prompt can render', () => {
      const clues = collectArtClues(song);
      const s = suggestArtDirection(clues, 0);
      for (const style of s.styles) {
        expect(MEDIUM_RENDER[style]).toBeTruthy();
      }
    });
  });
});
