-- Migration 005: original_name — the sacred link to the local folder
--
-- A record can be renamed freely (generated_name is the creative, editable
-- title). original_name preserves the local source-of-truth: the .logicx
-- folder base name (e.g. "20261017-101500 Surviving The Storm"). It is set
-- once at creation time by the script or bridge and should not change.

ALTER TABLE public.improvisations
ADD COLUMN IF NOT EXISTS original_name TEXT;

CREATE INDEX IF NOT EXISTS idx_improvisations_original_name ON public.improvisations (original_name);

-- Backfill from logic_project_path where it exists (basename without .logicx)
UPDATE public.improvisations
SET original_name = regexp_replace(split_part(logic_project_path, '/', -1), '\.logicx$', '')
WHERE original_name IS NULL
  AND logic_project_path IS NOT NULL;

COMMENT ON COLUMN public.improvisations.original_name IS 'Original local folder/base name at creation time (e.g. "20260722-124215 Felt Piano"). Immutable link to the local project; generated_name remains freely editable.';
