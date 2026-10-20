-- Public read policies for portfolio
-- Allow anyone to read completed, ready-for-release improvisations

-- 1. Enable RLS on improvisations (if not already)
ALTER TABLE public.improvisations ENABLE ROW LEVEL SECURITY;

-- 2. Public read: completed + ready for release
CREATE POLICY "public_read_portfolio" ON public.improvisations
  FOR SELECT
  USING (
    status = 'completed' 
    AND is_ready_for_release = true
  );

-- 3. Public read: artwork files (storage bucket)
-- This requires storage policies in Supabase Dashboard:
-- Bucket: piano_improvisations
-- Policy: "public_read_artwork" 
-- Operation: SELECT
-- Target: public
-- Condition: (bucket_id = 'piano_improvisations') AND (name LIKE '%/artwork/%')

-- 4. Public read: audio files for streaming
-- Policy: "public_read_audio"
-- Operation: SELECT
-- Target: public
-- Condition: (bucket_id = 'piano_improvisations') AND (name NOT LIKE '%/artwork/%')

-- 4. Index for portfolio queries
CREATE INDEX IF NOT EXISTS idx_improvisations_portfolio 
  ON public.improvisations(user_id, status, is_ready_for_release, session_date DESC);