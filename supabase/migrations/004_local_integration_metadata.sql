-- Migration 004: Add local workflow metadata to improvisations
-- Supports richer context from the Workflow Picker (AppleScript + Node scripts)

ALTER TABLE public.improvisations
ADD COLUMN IF NOT EXISTS nas_folder_path TEXT,
ADD COLUMN IF NOT EXISTS template_used TEXT,
ADD COLUMN IF NOT EXISTS sound_choice TEXT,
ADD COLUMN IF NOT EXISTS video_path TEXT,
ADD COLUMN IF NOT EXISTS workflow_mode TEXT,
ADD COLUMN IF NOT EXISTS logic_project_path TEXT;

-- Helpful indexes for local-script queries
CREATE INDEX IF NOT EXISTS idx_improvisations_workflow_mode ON public.improvisations (workflow_mode);
CREATE INDEX IF NOT EXISTS idx_improvisations_nas_folder_path ON public.improvisations (nas_folder_path);
CREATE INDEX IF NOT EXISTS idx_improvisations_logic_project_path ON public.improvisations (logic_project_path);

-- Optional: constraint for known workflow modes (comment out if you want flexibility)
-- ALTER TABLE public.improvisations
-- ADD CONSTRAINT check_workflow_mode CHECK (
--   workflow_mode IN ('tiktok', 'ig_story', 'piano_improvisation', 'deep_composition') OR workflow_mode IS NULL
-- );

-- Comment columns for documentation
COMMENT ON COLUMN public.improvisations.nas_folder_path IS 'Full NAS path for Deep Composition projects (e.g. /Volumes/Moon Prism/DBP/Creation/20260722 - Title)';
COMMENT ON COLUMN public.improvisations.template_used IS 'Logic/Sibelius template filename used (e.g. felt-ideas.logicx, Piano Template.logicx, #TEMPLATE.sib)';
COMMENT ON COLUMN public.improvisations.sound_choice IS 'Sound selected in picker: Felt Piano, Piano, Streaming, Insight Timer';
COMMENT ON COLUMN public.improvisations.video_path IS 'Final video file path from finish-take.js (Movies/<Label>/...)';
COMMENT ON COLUMN public.improvisations.workflow_mode IS 'Picker mode that created this entry: tiktok, ig_story, piano_improvisation, deep_composition';
COMMENT ON COLUMN public.improvisations.logic_project_path IS 'Path to the .logicx file in _Captures/ (e.g. _Captures/20260722-124215 Felt Piano.logicx)';