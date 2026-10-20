-- Add portfolio visibility flag to improvisations
-- Allows the composer to choose which released songs appear on the public portfolio

ALTER TABLE public.improvisations
ADD COLUMN IF NOT EXISTS show_on_portfolio BOOLEAN DEFAULT false;

-- Backfill: any song already marked ready for release shows on portfolio
UPDATE public.improvisations
SET show_on_portfolio = true
WHERE is_ready_for_release = true AND status = 'completed';

-- Index for portfolio queries
CREATE INDEX IF NOT EXISTS idx_improvisations_portfolio_visible
ON public.improvisations (show_on_portfolio, status)
WHERE show_on_portfolio = true AND status = 'completed';

COMMENT ON COLUMN public.improvisations.show_on_portfolio IS 'Whether this composition appears on the public music portfolio (music.danielebuatti.com). Independent of is_ready_for_release — a song can be released without being publicly listed.';