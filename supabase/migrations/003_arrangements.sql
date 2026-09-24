-- Arrangements tracking table

-- 1. Create the arrangements table
CREATE TABLE IF NOT EXISTS public.arrangements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT,
    source_track TEXT,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'in_progress', 'completed', 'archived')),
    instrumentation TEXT,
    key TEXT,
    tempo TEXT,
    genre TEXT,
    notes TEXT,
    file_links TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_arrangements_user_id ON public.arrangements(user_id);
CREATE INDEX IF NOT EXISTS idx_arrangements_status ON public.arrangements(status);
CREATE INDEX IF NOT EXISTS idx_arrangements_created_at ON public.arrangements(created_at DESC);

-- 3. Enable Row Level Security
ALTER TABLE public.arrangements ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies

-- Select: Users can only view their own arrangements
CREATE POLICY select_own_arrangements ON public.arrangements
    FOR SELECT
    USING (auth.uid() = user_id);

-- Insert: Users can only create arrangements with their own user_id
CREATE POLICY insert_own_arrangements ON public.arrangements
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Update: Users can only update their own arrangements
CREATE POLICY update_own_arrangements ON public.arrangements
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Delete: Users can only delete their own arrangements
CREATE POLICY delete_own_arrangements ON public.arrangements
    FOR DELETE
    USING (auth.uid() = user_id);

-- 5. Trigger to keep updated_at fresh on changes
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_arrangements_updated_at ON public.arrangements;
CREATE TRIGGER trg_arrangements_updated_at
    BEFORE UPDATE ON public.arrangements
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();