/**
 * One source of truth for "how finished is this song?".
 *
 * The page used to recompute readiness in three different places with three
 * different answers: the progress card counted ten ad-hoc steps, the pre-flight
 * checklist counted three (and disagreed about whether audio was required), and
 * the tabs decided again inline. This module is the single answer — every
 * surface reads `tasks` from here.
 *
 * Task ids are stable; they double as deep-link fragments (`?tab=…#task-id`).
 */

import type { Improvisation } from '@/types/improvisation';

/** Tabs a task can point at. Keep in sync with the tab list on the song page. */
export type TaskTab = 'overview' | 'creative-hub' | 'assets-downloads' | 'analysis-distro' | 'social';

export type TaskSeverity = 'required' | 'recommended';

export interface ReleaseTask {
  id: string;
  label: string;
  /** What "done" means, shown when the task is complete. */
  doneLabel: string;
  /** Why it matters — one line, plain language. */
  why: string;
  done: boolean;
  severity: TaskSeverity;
  tab: TaskTab;
}

export interface ReleaseReadiness {
  tasks: ReleaseTask[];
  /** 0–100, weighted equally across every task. */
  percent: number;
  completed: number;
  total: number;
  /** Required tasks still outstanding — these block submission. */
  blockers: ReleaseTask[];
  /** Recommended tasks still outstanding — worth doing, never blocking. */
  suggestions: ReleaseTask[];
  /** The single best next thing to do, or null when everything is done. */
  next: ReleaseTask | null;
  readyToSubmit: boolean;
}

/**
 * Insight Timer categorization is complete when every field it insists on has
 * a value. Exported so the Insight Timer tab and the checklist agree instead
 * of each keeping a slightly different list.
 */
export function hasInsightCategorization(imp: Pick<
  Improvisation,
  'insight_content_type' | 'insight_language' | 'insight_primary_use'
  | 'insight_audience_level' | 'insight_benefits' | 'insight_practices'
  | 'insight_themes' | 'insight_voice'
>): boolean {
  return Boolean(
    imp.insight_content_type
    && imp.insight_language
    && imp.insight_primary_use
    && imp.insight_audience_level
    && (imp.insight_benefits?.length || 0) > 0
    && imp.insight_practices
    && (imp.insight_themes?.length || 0) > 0
    && imp.insight_voice,
  );
}

/** Core musical metadata: the three fields the artwork prompt leans on. */
export function hasCoreMetadata(imp: Pick<Improvisation, 'primary_genre' | 'analysis_data'>): boolean {
  return Boolean(
    imp.primary_genre
    && imp.analysis_data?.simulated_key
    && imp.analysis_data?.simulated_tempo
    && imp.analysis_data?.mood,
  );
}

/**
 * Score a song's release readiness.
 *
 * Deliberate choices, since the old logic was contradictory:
 *  - Audio is **recommended**, not required. Entries legitimately exist as
 *    ideas with notes and artwork; the distribution tabs already say so.
 *  - Artwork and metadata confirmation are **required** — they hard-block
 *    every distribution target.
 *  - Everything else informs quality but never blocks.
 */
export function computeReleaseReadiness(imp: Improvisation): ReleaseReadiness {
  const hasAudio = Boolean(imp.storage_path);
  const hasArtwork = Boolean(imp.artwork_url);
  const hasPrompt = Boolean(imp.artwork_prompt);
  const hasNotes = Boolean(imp.notes?.some((n) => n.content.trim().length > 0));
  const hasTags = (imp.user_tags?.length || 0) > 0;
  const categorized = hasInsightCategorization(imp);
  const description = (imp.description || '').trim();
  const categorizedOrDescribed = categorized && description.length > 0;

  const tasks: ReleaseTask[] = [
    {
      id: 'type',
      label: 'Set the improvisation type',
      doneLabel: 'Improvisation type set',
      why: 'DistroKid and Insight Timer treat a live improvisation differently from a composed piece.',
      done: imp.is_improvisation !== null,
      severity: 'recommended',
      tab: 'creative-hub',
    },
    {
      id: 'core-metadata',
      label: 'Add core musical metadata',
      doneLabel: 'Key, tempo and mood set',
      why: 'These feed the artwork prompt, the hashtags and the Insight Timer description.',
      done: hasCoreMetadata(imp),
      severity: 'recommended',
      tab: 'creative-hub',
    },
    {
      id: 'audio',
      label: 'Attach the finished audio',
      doneLabel: 'Audio attached',
      why: 'Required by both distributors. The entry can live here without it in the meantime.',
      done: hasAudio,
      severity: 'recommended',
      tab: 'creative-hub',
    },
    {
      id: 'notes',
      label: 'Write creative notes',
      doneLabel: 'Creative notes written',
      why: 'Future you will not remember what you were hearing. Two lines is enough.',
      done: hasNotes,
      severity: 'recommended',
      tab: 'creative-hub',
    },
    {
      id: 'tags',
      label: 'Add user tags',
      doneLabel: 'User tags added',
      why: 'Drives the hashtags and makes the song findable later.',
      done: hasTags,
      severity: 'recommended',
      tab: 'creative-hub',
    },
    {
      id: 'artwork-prompt',
      label: 'Build an artwork prompt',
      doneLabel: 'Artwork prompt saved',
      why: 'A saved prompt means the cover can be regenerated consistently at any time.',
      done: hasPrompt,
      severity: 'recommended',
      tab: 'assets-downloads',
    },
    {
      id: 'artwork',
      label: 'Create the release artwork',
      doneLabel: 'Release artwork in place',
      why: 'Both distributors reject a release without cover art (≥1600×1600 px).',
      done: hasArtwork,
      severity: 'required',
      tab: 'assets-downloads',
    },
    {
      id: 'metadata',
      label: 'Populate and review the metadata',
      doneLabel: 'Metadata populated and confirmed',
      why: 'Insight Timer categorisation plus a description, then an explicit review.',
      done: categorizedOrDescribed && Boolean(imp.is_metadata_confirmed),
      severity: 'required',
      tab: 'analysis-distro',
    },
    {
      id: 'ready',
      label: 'Mark ready for release',
      doneLabel: 'Marked ready for release',
      why: 'Your own signal that the assets are frozen and nothing else needs changing.',
      done: Boolean(imp.is_ready_for_release),
      severity: 'required',
      tab: 'overview',
    },
  ];

  const completed = tasks.filter((t) => t.done).length;
  const blockers = tasks.filter((t) => !t.done && t.severity === 'required');
  const suggestions = tasks.filter((t) => !t.done && t.severity === 'recommended');

  return {
    tasks,
    completed,
    total: tasks.length,
    percent: Math.round((completed / tasks.length) * 100),
    blockers,
    suggestions,
    // Required first (they gate submission), then the quick wins in order.
    next: blockers[0] ?? suggestions[0] ?? null,
    readyToSubmit: blockers.length === 0,
  };
}
