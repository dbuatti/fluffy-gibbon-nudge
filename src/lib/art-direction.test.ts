import { describe, expect, it } from 'vitest';
import type { Improvisation } from '@/types/improvisation';
import {
  ART_PALETTES,
  buildArtPrompt,
  collectArtClues,
  defaultDirection,
  reconcileDirection,
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
});
