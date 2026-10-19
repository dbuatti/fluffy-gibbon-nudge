import { describe, it, expect } from 'vitest';
import { computeReleaseReadiness, hasCoreMetadata, hasInsightCategorization } from './release-readiness';
import type { Improvisation } from '@/types/improvisation';

/** Minimal complete record; override per test. */
function makeImp(overrides: Partial<Improvisation> = {}): Improvisation {
  return {
    id: 'song-1',
    file_name: 'take.wav',
    storage_path: 'user/song/take.wav',
    status: 'completed',
    generated_name: 'A Title',
    artwork_url: 'https://example.com/cover.png',
    artwork_prompt: 'an abstract prompt',
    is_piano: true,
    is_improvisation: true,
    primary_genre: 'Ambient',
    secondary_genre: null,
    analysis_data: { simulated_key: 'C minor', simulated_tempo: 60, mood: 'calm' },
    notes: [{ id: 'n1', title: 'Notes', color: 'blue', content: 'Something happened here.' }],
    created_at: '2026-01-01T00:00:00Z',
    is_ready_for_release: true,
    user_tags: ['piano'],
    is_instrumental: true,
    is_original_song: true,
    has_explicit_lyrics: false,
    is_metadata_confirmed: true,
    insight_content_type: 'music',
    insight_language: 'en',
    insight_primary_use: 'relaxation',
    insight_audience_level: 'all',
    insight_audience_age: ['adults'],
    insight_benefits: ['calm'],
    insight_practices: 'listening',
    insight_themes: ['peace'],
    insight_voice: 'instrumental',
    description: 'A calm piece.',
    is_submitted_to_distrokid: false,
    is_submitted_to_insight_timer: false,
    ...overrides,
  } as Improvisation;
}

describe('hasCoreMetadata', () => {
  it('is true only when genre, key, tempo and mood are all present', () => {
    expect(hasCoreMetadata(makeImp())).toBe(true);
    expect(hasCoreMetadata(makeImp({ primary_genre: null }))).toBe(false);
    expect(hasCoreMetadata(makeImp({ analysis_data: { simulated_key: 'C' } }))).toBe(false);
  });
});

describe('hasInsightCategorization', () => {
  it('requires every field Insight Timer insists on', () => {
    expect(hasInsightCategorization(makeImp())).toBe(true);
    expect(hasInsightCategorization(makeImp({ insight_voice: null }))).toBe(false);
    expect(hasInsightCategorization(makeImp({ insight_benefits: [] }))).toBe(false);
  });
});

describe('computeReleaseReadiness', () => {
  it('reports a fully prepared song as ready to submit', () => {
    const r = computeReleaseReadiness(makeImp());
    expect(r.readyToSubmit).toBe(true);
    expect(r.blockers).toHaveLength(0);
    expect(r.percent).toBe(100);
    expect(r.next).toBeNull();
  });

  it('treats artwork and metadata confirmation as hard blockers', () => {
    const r = computeReleaseReadiness(makeImp({ artwork_url: null, is_metadata_confirmed: false }));
    expect(r.readyToSubmit).toBe(false);
    expect(r.blockers.map((t) => t.id).sort()).toEqual(['artwork', 'metadata']);
  });

  it('never blocks on missing audio, because entries can exist as ideas', () => {
    const r = computeReleaseReadiness(makeImp({ storage_path: null, file_name: null }));
    expect(r.readyToSubmit).toBe(true);
    expect(r.blockers).toHaveLength(0);
    // ...but it is still surfaced as an unfinished step.
    expect(r.suggestions.some((t) => t.id === 'audio')).toBe(true);
  });

  it('surfaces a required task ahead of any recommended one as "next"', () => {
    const r = computeReleaseReadiness(makeImp({
      artwork_url: null,
      user_tags: [],
      artwork_prompt: null,
    }));
    expect(r.next?.id).toBe('artwork');
    expect(r.next?.severity).toBe('required');
  });

  it('falls back to a recommended task when nothing blocks', () => {
    const r = computeReleaseReadiness(makeImp({ user_tags: [], artwork_prompt: null }));
    expect(r.readyToSubmit).toBe(true);
    expect(r.next?.severity).toBe('recommended');
  });

  it('computes a monotonic percentage of completed tasks', () => {
    const none = computeReleaseReadiness(makeImp({
      artwork_url: null,
      artwork_prompt: null,
      user_tags: [],
      is_metadata_confirmed: false,
      is_ready_for_release: false,
      notes: [],
      storage_path: null,
      primary_genre: null,
      is_improvisation: null,
    }));
    const some = computeReleaseReadiness(makeImp({ artwork_url: null, is_metadata_confirmed: false }));
    const all = computeReleaseReadiness(makeImp());

    expect(none.percent).toBeLessThan(some.percent);
    expect(some.percent).toBeLessThan(all.percent);
    expect(none.total).toBe(all.total);
  });

  it('keeps task ids stable for deep-linking', () => {
    const ids = computeReleaseReadiness(makeImp()).tasks.map((t) => t.id);
    expect(ids).toEqual([
      'type', 'core-metadata', 'audio', 'notes', 'tags',
      'artwork-prompt', 'artwork', 'metadata', 'ready',
    ]);
  });
});
