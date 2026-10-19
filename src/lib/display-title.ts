/**
 * Title display helpers.
 *
 * Older records created by the Workflow Picker / CLI / web capture all got a
 * `YYYYMMDD - ` prefix baked into generated_name (it was the de-facto sort key
 * before original_name + created_at existed). The date is now carried by the
 * folder name and the created_at column, so the prefix is redundant noise on
 * cards — it eats the title's truncation budget and duplicates the date shown
 * two lines below.
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
