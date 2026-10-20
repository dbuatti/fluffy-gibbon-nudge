import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2, Circle, AlertTriangle, Image as ImageIcon, Music2, Loader2,
  ArrowRight, Sparkles, Clock, ExternalLink, PartyPopper,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { displaySessionDate } from '@/lib/display-title';
import type { ReleaseReadiness } from '@/lib/release-readiness';
import type { Improvisation } from '@/types/improvisation';
import { useArtworkInfo } from '@/hooks/useArtworkInfo';

interface OverviewTabProps {
  imp: Improvisation;
  readiness: ReleaseReadiness;
  isAnalyzing: boolean;
  onOpenTab: (tab: string) => void;
  onMarkReady: () => Promise<void>;
  isMarkingReady: boolean;
}

/** 1450 → "24:10" */
function fmtTime(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const STATUS_LABELS: Record<Improvisation['status'], string> = {
  uploaded: 'Uploaded',
  analyzing: 'Analyzing',
  completed: 'Processed',
  failed: 'Processing failed',
};

/**
 * The one screen that answers "where is this song?". It leads with the next
 * action, then the assets in the state they are actually in, then the full
 * task list. Everything else in the page is detail behind a tab.
 */
const OverviewTab: React.FC<OverviewTabProps> = ({
  imp,
  readiness,
  isAnalyzing,
  onOpenTab,
  onMarkReady,
  isMarkingReady,
}) => {
  const [audioSeconds, setAudioSeconds] = useState<number | null>(null);
  const { artworkInfo, artworkReady } = useArtworkInfo(imp.artwork_url);

  // Read the real duration from the file instead of guessing from the title.
  useEffect(() => {
    let cancelled = false;
    setAudioSeconds(null);
    if (!imp.storage_path) return;
    const url = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/piano_improvisations/${imp.storage_path}`;
    const audio = new Audio(url);
    const onLoaded = () => { if (!cancelled && Number.isFinite(audio.duration)) setAudioSeconds(audio.duration); };
    audio.addEventListener('loadedmetadata', onLoaded);
    audio.preload = 'metadata';
    return () => {
      cancelled = true;
      audio.removeEventListener('loadedmetadata', onLoaded);
    };
  }, [imp.storage_path]);

  const { next, readyToSubmit, percent, completed, total, tasks, blockers } = readiness;

  const submitted = useMemo(
    () => [imp.is_submitted_to_distrokid, imp.is_submitted_to_insight_timer].filter(Boolean).length,
    [imp.is_submitted_to_distrokid, imp.is_submitted_to_insight_timer],
  );

  const handleNext = () => {
    if (!next) return;
    if (next.id === 'ready') {
      void onMarkReady();
      return;
    }
    onOpenTab(next.tab);
  };

  /** Checklist rows: the "ready" task performs the action, everything else deep-links. */
  const openTask = (taskId: string, tab: string) => {
    if (taskId === 'ready') {
      void onMarkReady();
      return;
    }
    onOpenTab(tab);
  };

  return (
    <div className="space-y-6">
      {/* --- Next action: the whole point of this tab --- */}
      <Card
        className={cn(
          'border-2 shadow-card-light dark:shadow-card-dark',
          readyToSubmit ? 'border-success/50 bg-success/5' : 'border-primary/40 bg-primary/5',
        )}
      >
        <CardContent className="p-5 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                {readyToSubmit ? 'Ready to submit' : 'Next step'}
              </p>
              <h2 className="text-xl font-bold flex items-center gap-2">
                {readyToSubmit
                  ? (next ? next.label : 'Everything is done')
                  : next?.label}
                {isAnalyzing && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
              </h2>
              {next && <p className="text-sm text-muted-foreground max-w-prose">{next.why}</p>}
            </div>
            <Button
              onClick={handleNext}
              disabled={!next || isMarkingReady || isAnalyzing}
              size="lg"
              className="shrink-0"
            >
              {isMarkingReady ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving…</>
              ) : (
                <>{readyToSubmit ? 'Go' : 'Do it'} <ArrowRight className="h-4 w-4 ml-2" /></>
              )}
            </Button>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {completed} of {total} steps complete
              </span>
              <span className="font-semibold tabular-nums">{percent}%</span>
            </div>
            <Progress value={percent} className="h-2" />
          </div>

          {blockers.length > 0 && (
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 text-warning" />
              {blockers.length === 1
                ? 'One item still blocks distribution.'
                : `${blockers.length} items still block distribution.`}
            </p>
          )}

          {readyToSubmit && submitted === 2 && (
            <p className="text-sm font-medium text-success flex items-center gap-2">
              <PartyPopper className="h-4 w-4" /> Submitted to both distributors. Nothing left to do.
            </p>
          )}
        </CardContent>
      </Card>

      {/* --- Assets, in the state they are actually in --- */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="shadow-card-light dark:shadow-card-dark">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ImageIcon className="h-4 w-4 text-pink-500" /> Artwork
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <button
              type="button"
              onClick={() => onOpenTab('assets-downloads')}
              className="block w-full text-left group"
              aria-label="Open the artwork tab"
            >
              <div
                className={cn(
                  'relative w-full aspect-square max-h-56 rounded-lg overflow-hidden border-2 transition-colors',
                  imp.artwork_url
                    ? 'border-primary/40 group-hover:border-primary'
                    : 'border-dashed border-muted-foreground/40 bg-muted/40',
                )}
              >
                {imp.artwork_url ? (
                  <img
                    src={imp.artwork_url}
                    alt={imp.generated_name || 'Release artwork'}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-center p-4 text-muted-foreground">
                    <ImageIcon className="h-8 w-8 mb-2 opacity-40" />
                    <p className="text-sm font-medium">No artwork yet</p>
                  </div>
                )}
              </div>
            </button>
            {artworkInfo && (
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-muted-foreground">{artworkInfo}</span>
                {artworkReady === true && (
                  <Badge className="bg-success/15 text-success hover:bg-success/15">Release-ready</Badge>
                )}
                {artworkReady === false && (
                  <Badge className="bg-warning/20 text-foreground hover:bg-warning/20">Below platform minimum</Badge>
                )}
              </div>
            )}
            {!imp.artwork_prompt && !imp.artwork_url && (
              <p className="text-xs text-muted-foreground">
                The Artwork Prompt Studio on the Assets tab builds a prompt from this song's mood,
                key and tags — or from nothing at all, if you would rather go generic.
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-card-light dark:shadow-card-dark">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Music2 className="h-4 w-4 text-sky-500" /> Recording
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {imp.storage_path ? (
              <>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Duration</span>
                  <span className="font-medium tabular-nums flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" />
                    {audioSeconds === null ? '—' : fmtTime(audioSeconds)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Processing</span>
                  <Badge variant={imp.status === 'failed' ? 'destructive' : 'secondary'}>
                    {STATUS_LABELS[imp.status]}
                  </Badge>
                </div>
                <Separator />
                <p className="text-xs text-muted-foreground">
                  Play it from the player above — it stays available on every tab.
                </p>
              </>
            ) : (
              <>
                <p className="text-muted-foreground">
                  No audio attached yet. The entry is complete without it — notes, artwork and
                  distribution prep all work in the meantime.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => onOpenTab('creative-hub')}
                >
                  Attach audio <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* --- The full list --- */}
      <Card id="mark-ready-section" className="shadow-card-light dark:shadow-card-dark">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-violet-500" /> Release checklist
            <span className="ml-auto text-sm font-normal text-muted-foreground">
              {completed}/{total}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ul className="divide-y">
            {tasks.map((task) => (
              <li key={task.id}>
                <button
                  type="button"
                  id={task.id}
                  onClick={() => openTask(task.id, task.tab)}
                  className="w-full flex items-start gap-3 px-6 py-3 text-left hover:bg-muted/50 transition-colors focus-visible:outline-none focus-visible:bg-muted/50"
                >
                  {task.done ? (
                    <CheckCircle2 className="h-5 w-5 mt-0.5 shrink-0 text-success" />
                  ) : (
                    <Circle
                      className={cn(
                        'h-5 w-5 mt-0.5 shrink-0',
                        task.severity === 'required' ? 'text-warning' : 'text-muted-foreground/60',
                      )}
                    />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className={cn('block text-sm font-medium', task.done && 'text-muted-foreground line-through decoration-muted-foreground/40')}>
                      {task.done ? task.doneLabel : task.label}
                    </span>
                    {!task.done && (
                      <span className="block text-xs text-muted-foreground mt-0.5">{task.why}</span>
                    )}
                  </span>
                  {!task.done && task.severity === 'required' && (
                    <Badge variant="outline" className="shrink-0 border-warning/60 text-foreground">
                      Blocks release
                    </Badge>
                  )}
                  {!task.done && task.severity !== 'required' && (
                    <ExternalLink className="h-3.5 w-3.5 mt-1 shrink-0 text-muted-foreground/50" />
                  )}
                </button>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
};

export default OverviewTab;
