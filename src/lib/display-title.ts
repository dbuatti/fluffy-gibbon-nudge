/**
 * Title display helpers.
 *
 * Older records created by the Workflow Picker / CLI / web capture all got a
 * `YYYYMMDD - ` prefix baked into generated_name (it was the de-facto sort key
 * before original_name + created_at existed). The date is now carried by the
 * session_date column, so the prefix is redundant noise on cards — it eats the
 * title's truncation budget and duplicates the date shown two lines below.
 *
 * New captures no longer add the prefix; these helpers hide it on display for
 * records that already have it. The stored value is never modified — titles
 * remain freely editable and search still matches the raw string.
 */

const DATE_PREFIX_RE = /^\d{8}\s*[-–—:]?\s*/;

/**
 * Returns the title with a leading `YYYYMMDD - ` prefix removed for display.
 * Falls back to the raw value if stripping would leave nothing.
 */
export function displayTitle(title: string | null | undefined): string {
  const raw = (title || '').trim();
  if (!raw) return 'Untitled Idea';
  const stripped = raw.replace(DATE_PREFIX_RE, '').trim();
  return stripped || raw;
}

/**
 * Returns a formatted date string (YYYY-MM-DD) for display, preferring
 * session_date, then created_at.
 */
export function displaySessionDate(imp: { session_date?: string | null; created_at?: string | null }): string {
  if (imp.session_date) return imp.session_date;
  if (imp.created_at) return imp.created_at.slice(0, 10);
  return '—';
}
