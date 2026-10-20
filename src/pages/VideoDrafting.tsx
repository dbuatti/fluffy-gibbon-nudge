import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, getPublicAudioUrl } from '@/integrations/supabase/client';
import { Loader2, Sparkles, Play, Pause, Download, Film, FolderOpen, AlertTriangle, CheckCircle, ArrowLeft, ImageIcon } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { showSuccess, showError } from '@/utils/toast';
import { cn } from '@/lib/utils';
import { useLocalBridge, openFolderInFinder, bridgeClient } from '@/lib/local-bridge';
import type { Improvisation } from '@/types/improvisation';

const fetchImprovisation = async (id: string): Promise<Improvisation> => {
  const { data, error } = await supabase
    .from('improvisations')
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw new Error(error.message);
  return data as Improvisation;
};

const VideoDrafting: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { openFolderInFinder } = useLocalBridge();

  const { data: imp, isLoading, error } = useQuery<Improvisation>({
    queryKey: ['improvisation', id],
    queryFn: () => fetchImprovisation(id!),
    enabled: !!id,
  });

  const [exporting, setExporting] = useState(false);
  const [localFolderPath, setLocalFolderPath] = useState<string>('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);

  const audioUrl = useMemo(() => imp?.storage_path ? getPublicAudioUrl(imp.storage_path) : null, [imp?.storage_path]);
  const title = useMemo(() => (imp?.generated_name || imp?.original_name || 'Untitled').replace(/^\d{8}\s+/, '').trim(), [imp?.generated_name, imp?.original_name]);

  // Simple one-click: full audio + artwork, landscape (16:9) + portrait (9:16)
  const handleGenerate = useCallback(async () => {
    if (!imp?.id || !audioUrl) return;
    setExporting(true);
    try {
      const res = await bridgeClient.buildSocialKit(imp.id, {
        clipSec: 999999, // full length
        clipCount: 1,
        clipRatios: ['youtube', 'reels'],
      });
      if (res.success && res.data?.folder) {
        showSuccess(`Exported ${res.data.files?.length || 0} videos to ${res.data.folder}`);
        setLocalFolderPath(res.data.folder);
      } else {
        showError(res.error || 'Export failed');
      }
    } catch (e) {
      showError(e instanceof Error ? e.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  }, [imp?.id, audioUrl]);

  // Preview: short 15s clip of the portrait version
  const handlePreview = useCallback(async () => {
    if (!imp?.id || !audioUrl) return;
    setIsPreviewing(true);
    try {
      const res = await bridgeClient.buildSocialKit(imp.id, {
        clipSec: 15,
        clipCount: 1,
        clipRatios: ['reels'],
      });
      if (res.success && res.data?.files?.[0]) {
        const file = res.data.files[0];
        const previewRes = await bridgeClient.fetchSocialPreview(file.path);
        if (previewRes) {
          const url = URL.createObjectURL(previewRes);
          setPreviewUrl(url);
        }
      } else {
        showError(res.error || 'Preview failed');
      }
    } catch (e) {
      showError(e instanceof Error ? e.message : 'Preview failed');
    } finally {
      setIsPreviewing(false);
    }
  }, [imp?.id, audioUrl]);

  const openLocalFolder = () => {
    if (localFolderPath) openFolderInFinder(localFolderPath);
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-primary to-violet-600 flex items-center justify-center shadow-lg shadow-primary/30">
          <Sparkles className="h-6 w-6 text-white" />
        </div>
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !imp) {
    return (
      <div className="max-w-4xl mx-auto p-8 text-center">
        <AlertTriangle className="h-16 w-16 mx-auto mb-4 text-destructive" />
        <h2 className="text-2xl font-bold mb-2">Project not found</h2>
        <Button onClick={() => navigate('/composer')}>Back to Composer</Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <header className="mb-6 max-w-4xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Film className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Video Drafting</h1>
            <p className="text-sm text-muted-foreground">Landscape + portrait videos for {title}</p>
          </div>
        </div>
        <Button variant="outline" onClick={() => navigate(`/improvisation/${id}`)}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Song
        </Button>
      </header>

      <main className="max-w-4xl mx-auto space-y-6">
        {/* Song info + artwork */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-4 flex-wrap">
              {imp?.artwork_url ? (
                <img
                  src={imp.artwork_url}
                  alt="Artwork"
                  className="h-24 w-24 rounded-lg object-cover border border-border"
                />
              ) : (
                <div className="h-24 w-24 rounded-lg bg-gradient-to-br from-primary to-violet-600 flex items-center justify-center">
                  <Sparkles className="h-8 w-8 text-white" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-semibold truncate text-foreground">{title}</h2>
                <p className="text-sm text-muted-foreground">
                  {imp?.primary_genre || 'No genre'} • {imp?.analysis_data?.simulated_tempo ? `${imp.analysis_data.simulated_tempo} BPM` : 'No tempo'} • {imp?.analysis_data?.simulated_key || 'No key'}
                </p>
              </div>
              {audioUrl && (
                <audio src={audioUrl} controls className="w-64 h-10" />
              )}
            </div>
          </CardContent>
        </Card>

        {/* Simple generate button */}
        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Film className="h-4 w-4 text-primary" /> Generate Videos
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Creates two videos using your artwork and full audio: a landscape (16:9) for YouTube and a portrait (9:16) for Reels/TikTok/Shorts.
            </p>
            <div className="flex gap-3">
              <Button
                onClick={handleGenerate}
                disabled={exporting}
                className="flex-1 gap-2"
                size="lg"
              >
                {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                {exporting ? 'Generating…' : 'Generate Landscape + Portrait'}
              </Button>
            </div>
            {localFolderPath && (
              <Button variant="outline" onClick={openLocalFolder} className="w-full gap-2">
                <FolderOpen className="h-4 w-4" /> Open Export Folder
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Preview (optional) */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Play className="h-4 w-4" /> Preview (optional)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Render a 15-second preview of the portrait version to check the look.
            </p>
            <Button
              onClick={handlePreview}
              disabled={isPreviewing || exporting}
              variant="outline"
              className="w-full gap-2"
            >
              {isPreviewing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              {isPreviewing ? 'Rendering preview…' : 'Generate 15s Preview'}
            </Button>
            {previewUrl && (
              <div className="relative bg-black/50 rounded-lg overflow-hidden aspect-video mt-3">
                <video
                  src={previewUrl}
                  controls
                  autoPlay
                  loop
                  muted
                  className="w-full h-full object-contain"
                />
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default VideoDrafting;