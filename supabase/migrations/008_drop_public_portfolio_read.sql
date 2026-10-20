-- Retire the public portfolio read access.
--
-- 007_public_portfolio.sql added an unconditional SELECT policy so an
-- unauthenticated portfolio page could list release-ready songs. That page
-- lived in the stray Next.js tree under src/app/ (removed in a3bc393), so the
-- policy now grants anonymous read for nothing.
--
-- It was also broader than its comment implied: `SELECT` on the table returns
-- the *whole* row, so any stranger with the anon key (which ships in the client
-- bundle) could read user_id, storage_path, file_name and the private `notes`
-- field of every completed, release-ready improvisation.
--
-- Dropping the policy restores the default: rows are visible only to their
-- owner (or via the service role).

DROP POLICY IF EXISTS "public_read_portfolio" ON public.improvisations;

-- The index existed only to serve that portfolio query.
DROP INDEX IF EXISTS public.idx_improvisations_portfolio;

-- Note: no public storage policies were ever created for the bucket — the
-- artwork/audio read policies in 007 were left as instructions in comments,
-- not executable SQL. If a public portfolio is ever wanted again, prefer a
-- dedicated view exposing only safe columns rather than a table-wide policy.
