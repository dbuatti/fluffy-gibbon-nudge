import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, getPublicAudioUrl } from '@/integrations/supabase/client';
import { Loader2, Sparkles, Play, Pause, Download, Settings, X, ChevronDown, ChevronUp, Eye, EyeOff, Film, FolderOpen, AlertTriangle, CheckCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { showSuccess, showError } from '@/utils/toast';
import { cn } from '@/lib/utils';
import { useLocalBridge, openFolderInFinder } from '@/lib/local-bridge';
import type { Improvisation } from '@/types/improvisation';

const VISUALIZER_TYPES = [
  { value: 'waveform', label: 'Waveform', icon: '📊', modes: ['cline', 'p2p'] },
  { value: 'spectrum', label: 'Spectrum', icon: '📈', modes: ['bar', 'line', 'dot'] },
  { value: 'spectrogram', label: 'Spectrogram', icon: '🌊', modes: ['combined', 'separate'] },
  { value: 'vectorscope', label: 'Vectorscope', icon: '🔄', modes: ['lissajous', 'lissajous_xy', 'polar'] },
  { value: 'volume', label: 'Volume Meter', icon: '🔊', modes: ['bar'] },
] as const;

const CLIP_TARGETS = [
  { key: 'reels', label: 'Reels / TikTok / Shorts (9:16)', w: 1080, h: 1920 },
  { key: 'feed', label: 'Square Feed (1:1)', w: 1080, h: 1080 },
  { key: 'youtube', label: 'YouTube (16:9)', w: 1920, h: 1080 },
] as const;

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
  const { createLocalProject, deleteLocalFolder, openFolderInFinder } = useLocalBridge();

  const { data: imp, isLoading, error } = useQuery<Improvisation>({
    queryKey: ['improvisation', id],
    queryFn: () => fetchImprovisation(id!),
    enabled: !!id,
  });

  // Local draft state
  const [visualizerEnabled, setVisualizerEnabled] = useState(true);
  const [visualizerType, setVisualizerType] = useState<'waveform' | 'spectrum' | 'spectrogram' | 'vectorscope' | 'volume'>('waveform');
  const [visualizerMode, setVisualizerMode] = useState('cline');
  const [visualizerColor, setVisualizerColor] = useState('#FFFFFF');
  const [visualizerWidth, setVisualizerWidth] = useState(1080);
  const [visualizerHeight, setVisualizerHeight] = useState(200);
  const [visualizerBg, setVisualizerBg] = useState('');
  const [visualizerMarginBottom, setVisualizerMarginBottom] = useState(40);
  
  const [titleOverlayEnabled, setTitleOverlayEnabled] = useState(true);
  const [titleOverlayText, setTitleOverlayText] = useState('');
  const [titleOverlayColor, setTitleOverlayColor] = useState('#FFFFFF');
  const [titleOverlayFontSize, setTitleOverlayFontSize] = useState(56);
  const [titleOverlayFont, setTitleOverlayFont] = useState('Arial');
  const [titleOverlayY, setTitleOverlayY] = useState('h-th-60');

  const [clipSec, setClipSec] = useState(90);
  const [clipCount, setClipCount] = useState(1);
  const [clipTargets, setClipTargets] = useState<string[]>(['reels']);
  const [startAt, setStartAt] = useState('');
  const [clipStartSec, setClipStartSec] = useState<number | null>(null);

  const [selectedRatio, setSelectedRatio] = useState(CLIP_TARGETS[0].key);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isBuilding, setIsBuilding] = useState(false);
  const [buildStep, setBuildStep] = useState<string>('');
  const [exporting, setExporting] = useState(false);
  const [localFolderPath, setLocalFolderPath] = useState<string>('');

  const audioUrl = useMemo(() => imp?.storage_path ? getPublicAudioUrl(imp.storage_path) : null, [imp?.storage_path]);

  const title = useMemo(() => (imp?.generated_name || imp?.original_name || 'Untitled').replace(/^\d{8}\s+/, '').trim(), [imp?.generated_name, imp?.original_name]);

  // Update visualizer mode options when type changes
  useEffect(() => {
    const vt = VISUALIZER_TYPES.find(v => v.value === visualizerType);
    if (vt && !vt.modes.includes(visualizerMode)) {
      setVisualizerMode(vt.modes[0]);
    }
  }, [visualizerType]);

  // Preview generator - creates a short preview using the bridge
  const generatePreview = useCallback(async () => {
    if (!imp?.id || !audioUrl) return;
    setIsPreviewing(true);
    try {
      const { client } = useLocalBridge.getState();
      const res = await client.buildSocialKit(imp.id, {
        clipSec: Number(clipSec) || 15, // Short preview
        clipStartSec: clipStartSec ?? undefined,
        clipCount: 1,
        clipRatios: [selectedRatio],
        visualizer: visualizerEnabled ? {
          enabled: true,
          type: visualizerType,
          mode: visualizerMode,
          color: visualizerColor.replace('#', '0x'),
          width: visualizerWidth,
          height: visualizerHeight,
          background: visualizerBg || undefined,
          marginBottom: visualizerMarginBottom,
        } : { enabled: false },
        titleOverlay: titleOverlayEnabled ? {
          enabled: true,
          text: (titleOverlayText || title).toUpperCase(),
          color: titleOverlayColor,
          fontSize: titleOverlayFontSize,
          font: titleOverlayFont,
          y: titleOverlayY,
        } : { enabled: false },
      });
      if (res.success && res.data?.files?.[0]) {
        const file = res.data.files[0];
        const previewRes = await client.fetchSocialPreview(file.path);
        if (previewRes) {
          const url = URL.createObjectURL(previewRes);
          setPreviewUrl(url);
        }
      } else {
        showError(res.error || 'Preview generation failed');
      }
    } catch (e) {
      showError(e instanceof Error ? e.message : 'Preview failed');
    } finally {
      setIsPreviewing(false);
    }
  }, [imp?.id, audioUrl, clipSec, clipStartSec, selectedRatio, visualizerEnabled, visualizerType, visualizerMode, visualizerColor, visualizerWidth, visualizerHeight, visualizerBg, visualizerMarginBottom, titleOverlayEnabled, titleOverlayText, titleOverlayColor, titleOverlayFontSize, titleOverlayFont, titleOverlayY, title]);

  // Full export to local folder
  const handleExport = useCallback(async () => {
    if (!imp?.id || !audioUrl) return;
    setExporting(true);
    try {
      const { client } = useLocalBridge.getState();
      const res = await client.buildSocialKit(imp.id, {
        clipSec: Number(clipSec) || undefined,
        clipStartSec: clipStartSec ?? undefined,
        clipCount: Number(clipCount) || 1,
        clipRatios: clipTargets.length ? clipTargets : ['reels'],
        visualizer: visualizerEnabled ? {
          enabled: true,
          type: visualizerType,
          mode: visualizerMode,
          color: visualizerColor.replace('#', '0x'),
          width: visualizerWidth,
          height: visualizerHeight,
          background: visualizerBg || undefined,
        } : { enabled: false },
        titleOverlay: titleOverlayEnabled ? {
          enabled: true,
          text: (titleOverlayText || imp.generated_name || 'Untitled').toUpperCase(),
          color: titleOverlayColor,
          fontSize: titleOverlayFontSize,
        } : { enabled: false },
      });
      if (res.success && res.data?.folder) {
        showSuccess(`Exported ${res.data.files?.length || 0} videos to ${res.data.folder}`);
        setLocalFolderPath(res.data.folder);
      } else {
        showError(res.error || 'Export failed');
      }
    } catch (e) {
      showError(e instanceof Error ? e.message : 'Export failed');
    }
  }, [clipSec, clipCount, clipTargets, visualizerEnabled, visualizerType, visualizerMode, visualizerColor, visualizerWidth, visualizerHeight, visualizerBg, visualizerMarginBottom, titleOverlayEnabled, titleOverlayText, titleOverlayColor, titleOverlayFontSize]);

  // Create local Logic project folder
  const createLocalFolder = async () => {
    if (!imp?.generated_name) return;
    try {
      const { client } = useLocalBridge.getState();
      const res = await client.createLocalProject(imp.generated_name);
      if (res.success && res.data?.path) {
        setLocalFolderPath(res.data.path);
        showSuccess(`Local Logic folder created: ${res.data.path}`);
        openFolderInFinder(res.data.path);
      } else {
        showError(res.error || 'Failed to create local folder');
      }
    } catch (e) {
      showError(e instanceof Error ? e.message : 'Failed to create folder');
    }
  };

  const openLocalFolder = () => {
    if (localFolderPath) openFolderInFinder(localFolderPath);
  };

  // Parse time input
  const parseTime = (input: string): number | null => {
    const t = input.trim();
    if (!t) return null;
    if (/^\d+:\d{1,2}$/.test(t)) {
      const [m, s] = t.split(':').map(Number);
      return m * 60 + s;
    }
    const n = Number(t);
    return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
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

  const visualizerTypeConfig = VISUALIZER_TYPES.find(v => v.value === visualizerType);

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <header className="mb-6 max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Film className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Video Drafting</h1>
            <p className="text-sm text-muted-foreground">Configure, preview & export videos for {title}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => navigate(`/improvisation/${id}`)}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Back to Song
          </Button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto">
        {/* Audio & Song Info */}
        <Card className="mb-6">
          <CardContent className="p-4">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="h-16 w-16 rounded-lg bg-gradient-to-br from-primary to-violet-600 flex items-center justify-center">
                <Sparkles className="h-8 w-8 text-white" />
              </div>
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

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Panel - Controls */}
          <div className="lg:col-span-1 space-y-4">
            {/* Visualizer */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={visualizerEnabled}
                      onChange={(e) => setVisualizerEnabled(e.target.checked)}
                      className="accent-primary"
                    />
                    Visualizer
                  </label>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Type</Label>
                  <Select value={visualizerType} onValueChange={setVisualizerType}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {VISUALIZER_TYPES.map(v => (
                        <SelectItem key={v.value} value={v.value}>{v.icon} {v.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Mode</Label>
                  <Select value={visualizerMode} onValueChange={setVisualizerMode}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {visualizerTypeConfig?.modes.map(m => (
                        <SelectItem key={m} value={m}>{m}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Color</Label>
                    <Input type="color" value={visualizerColor} onChange={e => setVisualizerColor(e.target.value)} className="h-8 w-12" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Background (optional)</Label>
                    <Input type="text" value={visualizerBg} onChange={e => setVisualizerBg(e.target.value)} placeholder="e.g. 0x00000080" className="h-8 text-xs" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Width (px)</Label>
                    <Input type="number" value={visualizerWidth} onChange={e => setVisualizerWidth(Number(e.target.value) || 1080)} min={100} max={1920} className="h-8 text-xs w-20" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Height (px)</Label>
                    <Input type="number" value={visualizerHeight} onChange={e => setVisualizerHeight(Number(e.target.value) || 200)} min={50} max={500} className="h-8 text-xs w-20" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Margin Bottom (px)</Label>
                    <Input type="number" value={visualizerMarginBottom} onChange={e => setVisualizerMarginBottom(Number(e.target.value) || 40)} min={0} max={200} className="h-8 text-xs w-20" />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Title Overlay */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={titleOverlayEnabled}
                      onChange={e => setTitleOverlayEnabled(e.target.checked)}
                      className="accent-primary"
                    />
                    Title Overlay
                  </label>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Text</Label>
                  <Input value={titleOverlayText || title} onChange={e => setTitleOverlayText(e.target.value)} placeholder="Auto: song title" className="h-8 text-xs" />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Color</Label>
                    <Input type="color" value={titleOverlayColor} onChange={e => setTitleOverlayColor(e.target.value)} className="h-8 w-12" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Font Size (px)</Label>
                    <Input type="number" value={titleOverlayFontSize} onChange={e => setTitleOverlayFontSize(Number(e.target.value) || 56)} min={24} max={120} className="h-8 text-xs w-20" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Font</Label>
                    <Input value={titleOverlayFont} onChange={e => setTitleOverlayFont(e.target.value)} className="h-8 text-xs" placeholder="Arial" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Y Position</Label>
                    <Input value={titleOverlayY} onChange={e => setTitleOverlayY(e.target.value)} className="h-8 text-xs" placeholder="h-th-60" />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Clips & Export */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Clips & Export</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Clip Length</Label>
                  <Select value={clipSec} onValueChange={setClipSec}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="30">0:30</SelectItem>
                      <SelectItem value="60">1:00</SelectItem>
                      <SelectItem value="90">1:30</SelectItem>
                      <SelectItem value="180">3:00</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Clips per Ratio</Label>
                  <Select value={clipCount} onValueChange={setClipCount}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1</SelectItem>
                      <SelectItem value="2">2</SelectItem>
                      <SelectItem value="3">3</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Start At (m:ss or seconds)</Label>
                  <Input value={startAt} onChange={e => { setStartAt(e.target.value); setClipStartSec(parseTime(e.target.value)); }} placeholder="Auto: strongest passage" className="h-8 text-xs" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Ratios</Label>
                  <div className="flex flex-wrap gap-2">
                    {CLIP_TARGETS.map(t => (
                      <Button
                        key={t.key}
                        type="button"
                        size="sm"
                        variant={clipTargets.includes(t.key) ? 'default' : 'outline'}
                        onClick={() => setClipTargets(prev => prev.includes(t.key) ? prev.filter(k => k !== t.key) : [...prev, t.key])}
                        className="text-[10px] h-6 px-2"
                      >
                        {clipTargets.includes(t.key) && <CheckCircle className="h-3 w-3 mr-1.5" />}
                        {t.label}
                      </Button>
                    ))}
                  </div>
                </div>

                <Separator />

                <Button onClick={generatePreview} disabled={isPreviewing || isBuilding} className="w-full gap-2">
                  {isPreviewing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  {isPreviewing ? 'Generating Preview…' : 'Generate Preview'}
                </Button>

                <Button variant="default" onClick={handleExport} disabled={isBuilding} className="w-full gap-2">
                  {isBuilding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  {isBuilding ? 'Exporting…' : 'Export Videos to Folder'}
                </Button>

                {localFolderPath && (
                  <Button variant="outline" onClick={openLocalFolder} className="w-full gap-2">
                    <FolderOpen className="h-4 w-4" /> Open Export Folder
                  </Button>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right Panel - Preview */}
          <div className="lg:col-span-2 space-y-4">
            {/* Preview Area */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center justify-between">
                  Preview
                  <Badge variant={previewUrl ? 'default' : 'secondary'}>
                    {previewUrl ? 'Ready' : 'No Preview'}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="relative bg-black/50 rounded-lg overflow-hidden aspect-video">
                  {previewUrl ? (
                    <video
                      src={previewUrl}
                      controls
                      autoPlay
                      loop
                      muted
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground p-8">
                      <Film className="h-16 w-16 mb-4 opacity-30" />
                      <p className="text-lg font-medium">No Preview Yet</p>
                      <p className="text-sm mt-1">Click "Generate Preview" to render a short preview with your current settings</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Export Status */}
            {localFolderPath && (
              <Alert className="border-emerald-500/50 bg-emerald-500/10">
                <CheckCircle className="h-4 w-4 text-emerald-600" />
                <AlertDescription className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FolderOpen className="h-4 w-4 text-emerald-600" />
                    <span>Exported to:</span>
                    <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{localFolderPath}</code>
                  </div>
                  <Button variant="ghost" size="sm" onClick={openLocalFolder}>
                    <FolderOpen className="h-3 w-3 mr-1" /> Open
                  </Button>
                </AlertDescription>
              </Alert>
            )}

            {/* Local Logic Folder */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center justify-between">
                  Local Logic Project Folder
                  <Badge variant={localFolderPath ? 'default' : 'secondary'}>
                    {localFolderPath ? 'Created' : 'Not Created'}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {localFolderPath ? (
                  <div className="space-y-2">
                    <div className="bg-muted/50 rounded-lg p-3 space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">Folder Path</p>
                      <p className="text-sm font-mono text-foreground break-all">{localFolderPath}</p>
                    </div>
                    <Button variant="outline" onClick={openLocalFolder} className="w-full gap-2">
                      <FolderOpen className="h-4 w-4" /> Open in Finder
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">
                      Create a dated Logic project folder (YYYYMMDD Title.logicx) in ~/Music/Logic/
                      with the full package structure (Alternatives/, Media/, Resources/).
                    </p>
                    <Button onClick={createLocalFolder} className="w-full gap-2">
                      <Plus className="h-4 w-4" /> Create Logic Project Folder
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
};

export default VideoDrafting;