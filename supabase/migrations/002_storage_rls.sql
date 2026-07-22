-- Storage bucket RLS policies for piano_improvisations bucket
-- This bucket stores audio files and artwork images.

-- 1. Create the bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('piano_improvisations', 'piano_improvisations', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Policy: Allow users to view (read) their own files
CREATE POLICY "Users can view their own files"
ON storage.objects FOR SELECT
TO authenticated
USING (
    bucket_id = 'piano_improvisations'
    AND (storage.foldername(name))[1] = auth.uid()::text
);

-- 3. Policy: Allow users to upload files to their own folder
CREATE POLICY "Users can upload their own files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'piano_improvisations'
    AND (storage.foldername(name))[1] = auth.uid()::text
);

-- 4. Policy: Allow users to update their own files
CREATE POLICY "Users can update their own files"
ON storage.objects FOR UPDATE
TO authenticated
USING (
    bucket_id = 'piano_improvisations'
    AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
    bucket_id = 'piano_improvisations'
    AND (storage.foldername(name))[1] = auth.uid()::text
);

-- 5. Policy: Allow users to delete their own files
CREATE POLICY "Users can delete their own files"
ON storage.objects FOR DELETE
TO authenticated
USING (
    bucket_id = 'piano_improvisations'
    AND (storage.foldername(name))[1] = auth.uid()::text
);

-- 6. Public read access (since the bucket is public, anyone can read files by URL)
CREATE POLICY "Public read access for piano_improvisations"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'piano_improvisations');
