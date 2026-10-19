-- Migration 006: art_repository — persistent gallery of generated artwork
--
-- Every generation (procedural or AI) can be auto-saved here so nothing is
-- wasted: the image lives in Supabase Storage and the row keeps the prompt,
-- mode and seed needed to reproduce or reuse it.

CREATE TABLE IF NOT EXISTS public.art_repository (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,          -- path within the piano_improvisations bucket
  public_url TEXT NOT NULL,
  prompt TEXT,
  mode TEXT NOT NULL,                  -- procedural | cloudflare | gemini
  seed BIGINT,                         -- procedural seed, for reproducibility
  improvisation_id UUID,               -- soft link to improvisations.id (no FK: that table has no PK constraint)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_art_repository_user_created ON public.art_repository (user_id, created_at DESC);

ALTER TABLE public.art_repository ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own artwork" ON public.art_repository
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own artwork" ON public.art_repository
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own artwork" ON public.art_repository
  FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Users can update own artwork" ON public.art_repository
  FOR UPDATE USING (auth.uid() = user_id);

COMMENT ON TABLE public.art_repository IS 'Persistent repository of generated artwork (Generative Art Studio + inline generator). Images stored in piano_improvisations bucket under <user_id>/repository/.';
