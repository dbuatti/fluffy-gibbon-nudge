/**
 * Art Repository — persistent storage for generated artwork.
 *
 * Every generation (Generative Art Studio or the inline Assets-tab
 * generator) can be saved here so nothing is wasted: the image lives in
 * Supabase Storage and the row keeps the prompt, mode and seed needed to
 * reproduce or reuse it later. Rows are RLS-scoped to their owner.
 */
import { supabase } from '@/integrations/supabase/client';

export interface ArtRepositoryItem {
  id: string;
  user_id: string;
  storage_path: string;
  public_url: string;
  prompt: string | null;
  mode: 'procedural' | 'cloudflare' | 'gemini' | string;
  seed: number | null;
  improvisation_id: string | null;
  created_at: string;
}

const BUCKET = 'piano_improvisations';

/** Convert a base64 PNG (no data: prefix) to a Blob. */
export function base64ToBlob(base64: string, type = 'image/png'): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type });
}

/**
 * Upload an image to the repository and record its metadata.
 * Throws on failure — callers decide whether to surface the error
 * (the studio toasts; the inline generator fails silently-ish).
 */
export async function saveToRepository(opts: {
  blob: Blob;
  prompt: string;
  mode: 'procedural' | 'cloudflare' | 'gemini' | string;
  seed?: number;
  improvisationId?: string;
}): Promise<ArtRepositoryItem> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not logged in');

  const ext = opts.blob.type === 'image/jpeg' ? 'jpg' : 'png';
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const storagePath = `${user.id}/repository/${stamp}-${opts.mode}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, opts.blob, { contentType: opts.blob.type || 'image/png' });
  if (uploadError) throw uploadError;

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);

  const { data, error } = await supabase
    .from('art_repository')
    .insert({
      user_id: user.id,
      storage_path: storagePath,
      public_url: urlData.publicUrl,
      prompt: opts.prompt || null,
      mode: opts.mode,
      seed: opts.seed ?? null,
      improvisation_id: opts.improvisationId || null,
    })
    .select()
    .single();
  if (error) {
    // Roll the orphaned upload back so storage doesn't fill with garbage
    await supabase.storage.from(BUCKET).remove([storagePath]).catch(() => {});
    throw error;
  }
  return data as ArtRepositoryItem;
}

/** List the current user's repository, newest first. */
export async function listRepository(limit = 60): Promise<ArtRepositoryItem[]> {
  const { data, error } = await supabase
    .from('art_repository')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []) as ArtRepositoryItem[];
}

/** Delete a repository entry (row + storage file). */
export async function deleteFromRepository(item: Pick<ArtRepositoryItem, 'id' | 'storage_path'>): Promise<void> {
  const { error } = await supabase.from('art_repository').delete().eq('id', item.id);
  if (error) throw error;
  await supabase.storage.from(BUCKET).remove([item.storage_path]).catch(() => {});
}

/** Assign a repository image as an improvisation's artwork. */
export async function assignArtworkToImprovisation(improvisationId: string, item: ArtRepositoryItem): Promise<void> {
  const { error } = await supabase
    .from('improvisations')
    .update({ artwork_url: item.public_url, artwork_prompt: item.prompt })
    .eq('id', improvisationId);
  if (error) throw error;
  try {
    // Best-effort link back from the repository entry — the artwork is
    // already assigned above, so a failure here is not fatal.
    await supabase.from('art_repository').update({ improvisation_id: improvisationId }).eq('id', item.id);
  } catch {
    // ignore
  }
}

/**
 * Convert a canvas to a Blob, preferring JPEG for AI-like content (smaller
 * files) — PNG for procedural keeps crisp gradients.
 */
export function canvasToBlob(canvas: HTMLCanvasElement, mode: string): Promise<Blob> {
  const type = mode === 'procedural' ? 'image/png' : 'image/jpeg';
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Failed to create image'))), type, 0.92);
  });
}
