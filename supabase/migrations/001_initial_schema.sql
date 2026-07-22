-- Initial schema for the improvisations application
-- This migration creates the core table and sets up Row Level Security.

-- 1. Create the improvisations table
CREATE TABLE IF NOT EXISTS public.improvisations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    file_name TEXT,
    storage_path TEXT,
    status TEXT NOT NULL DEFAULT 'uploaded' CHECK (status IN ('uploaded', 'analyzing', 'completed', 'failed')),
    generated_name TEXT,
    is_improvisation BOOLEAN,
    is_piano BOOLEAN,
    is_instrumental BOOLEAN,
    is_original_song BOOLEAN,
    has_explicit_lyrics BOOLEAN,
    primary_genre TEXT,
    secondary_genre TEXT,
    analysis_data JSONB,
    artwork_url TEXT,
    artwork_prompt TEXT,
    notes JSONB DEFAULT '[]'::jsonb,
    user_tags TEXT[] DEFAULT '{}',
    is_ready_for_release BOOLEAN DEFAULT false,
    is_metadata_confirmed BOOLEAN DEFAULT false,
    insight_content_type TEXT,
    insight_language TEXT,
    insight_primary_use TEXT,
    insight_audience_level TEXT,
    insight_audience_age TEXT[] DEFAULT '{}',
    insight_benefits TEXT[] DEFAULT '{}',
    insight_practices TEXT,
    insight_themes TEXT[] DEFAULT '{}',
    insight_voice TEXT,
    description TEXT,
    is_submitted_to_distrokid BOOLEAN DEFAULT false,
    is_submitted_to_insight_timer BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_improvisations_user_id ON public.improvisations(user_id);
CREATE INDEX IF NOT EXISTS idx_improvisations_status ON public.improvisations(status);
CREATE INDEX IF NOT EXISTS idx_improvisations_created_at ON public.improvisations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_improvisations_user_status ON public.improvisations(user_id, status);

-- 3. Enable Row Level Security
ALTER TABLE public.improvisations ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies

-- Select: Users can only view their own improvisations
CREATE POLICY select_own_improvisations ON public.improvisations
    FOR SELECT
    USING (auth.uid() = user_id);

-- Insert: Users can only create improvisations with their own user_id
CREATE POLICY insert_own_improvisations ON public.improvisations
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Update: Users can only update their own improvisations
CREATE POLICY update_own_improvisations ON public.improvisations
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Delete: Users can only delete their own improvisations
CREATE POLICY delete_own_improvisations ON public.improvisations
    FOR DELETE
    USING (auth.uid() = user_id);

-- 5. Storage bucket for audio and artwork (created manually via Supabase dashboard)
-- Bucket name: piano_improvisations
-- RLS policies for storage are managed separately in the Supabase dashboard.
