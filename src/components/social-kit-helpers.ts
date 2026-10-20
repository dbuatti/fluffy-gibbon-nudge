import type { SocialCaptionPlatform, SocialCaptions } from '@/lib/local-bridge';
import type { Improvisation } from '@/types/improvisation';
import { Instagram, Music2, Youtube } from 'lucide-react';

/** Ratios that can be given several cuts, with the label shown in the UI. */
export const CLIP_TARGETS = [
  { key: 'reels', label: 'Vertical (9:16)', short: '9:16' },
  { key: 'feed', label: 'Square (1:1)', short: '1:1' },
  { key: 'youtube', label: 'YouTube (16:9)', short: '16:9' },
] as const;

/** Upload pages open in a new tab — no API keys, no review process. Clicking one
 * copies its caption and reveals the matching file in Finder, so the flow is
 * drag → paste → post.
 */
export const PLATFORMS = [
  {
    key: 'reels',
    label: 'Instagram Reels',
    url: 'https://www.instagram.com/reels/',
    icon: Instagram,
    ratio: 'reels',
    captionPlatform: 'instagram' as SocialCaptionPlatform,
    fileHint: 'Copies the caption + shows the 9:16 video',
  },
  {
    key: 'tiktok',
    label: 'TikTok',
    url: 'https://www.tiktok.com/upload?lang=en',
    icon: Music2,
    ratio: 'reels',
    captionPlatform: 'tiktok' as SocialCaptionPlatform,
    fileHint: 'Copies the caption + shows the 9:16 video',
  },
  {
    key: 'shorts',
    label: 'YouTube Shorts',
    url: 'https://www.youtube.com/upload?filter=shorts',
    icon: Youtube,
    ratio: 'reels',
    captionPlatform: 'youtube' as SocialCaptionPlatform,
    fileHint: 'Copies the caption + shows the 9:16 video',
  },
  {
    key: 'feed',
    label: 'Instagram Feed',
    url: 'https://www.instagram.com/create/',
    icon: Instagram,
    ratio: 'feed',
    captionPlatform: 'instagram' as SocialCaptionPlatform,
    fileHint: 'Copies the caption + shows the square video',
  },
  {
    key: 'youtube',
    label: 'YouTube (Full Length)',
    url: 'https://www.youtube.com/upload',
    icon: Youtube,
    ratio: 'youtube',
    captionPlatform: 'youtube' as SocialCaptionPlatform,
    fileHint: 'Copies the caption + shows the full 16:9 video',
  },
] as const;

export const CAPTION_TABS: { key: SocialCaptionPlatform; label: string; hint: string }[] = [
  { key: 'instagram', label: 'Instagram', hint: 'Reels, Feed, Stories' },
  { key: 'tiktok', label: 'TikTok', hint: 'Vertical, hashtags' },
  { key: 'youtube', label: 'YouTube', hint: 'Title + description + tags' },
];

export const BUILD_PHASES = [
  { step: 'fetching audio…', weight: 0.1 },
  { step: 'generating artwork…', weight: 0.2 },
  { step: 'rendering videos…', weight: 0.65 },
  { step: 'writing kit.json…', weight: 0.05 },
] as const;

type ImprovisationData = Pick<Improvisation, 'id' | 'generated_name' | 'original_name' | 'artwork_url'>;

export function fmt(sec?: number): string {
  if (!sec && sec !== 0) return '';
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Accepts "95", "1:35", "1.35" → seconds, or null when blank/invalid. */
export function parseTime(input: string): number | null {
  const t = input.trim();
  if (!t) return null;
  if (/^\d+:\d{1,2}$/.test(t)) {
    const [m, s] = t.split(':').map(Number);
    return m * 60 + s;
  }
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

export function timeAgo(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function splitYouTube(text: string): { title: string; body: string } {
  const lines = text.split('\n');
  const first = lines[0] || '';
  const rest = lines.slice(1).join('\n').trim();
  return { title: first, body: rest };
}

/** Initial captions state — empty strings so controlled inputs don't warn. */
export const emptyCaptions: SocialCaptions = {
  instagram: '',
  tiktok: '',
  youtube: '',
};