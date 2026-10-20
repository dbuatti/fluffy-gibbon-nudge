-- Add session_date column to store the composition/recording date separately from the title
-- This allows the date to be preserved independently of the generated_name (title)

-- 1. Add the column
ALTER TABLE public.improvisations
ADD COLUMN IF NOT EXISTS session_date DATE;

-- 2. Backfill existing records: extract date from generated_name prefix (YYYYMMDD - )
-- or fall back to created_at date
UPDATE public.improvisations
SET session_date = CASE
    WHEN generated_name ~ '^\d{8}\s*[-–—:]' THEN
        (substring(generated_name from '^(\d{8})'))::date
    ELSE
        created_at::date
    END
WHERE session_date IS NULL;

-- 3. Add index for date-based queries
CREATE INDEX IF NOT EXISTS idx_improvisations_session_date ON public.improvisations(session_date DESC);

-- 4. Comment
COMMENT ON COLUMN public.improvisations.session_date IS 'Composition/recording date (YYYY-MM-DD). Used for folder naming, sorting, and display. Separate from generated_name so the title can be freely edited without losing the date.';