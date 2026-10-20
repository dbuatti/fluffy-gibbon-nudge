import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Loader2, Sparkles, Film, FolderOpen, Copy, Instagram, Youtube, Music2,
  Play, RefreshCw, Check, Info, Clock, ExternalLink, Palette, ChevronDown,
  Save, Image as ImageIcon,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  useLocalBridge, openFolderInFinder, revealInFinder, type SocialKit, type SocialKitFile,
  type SocialCaptionPlatform, type SocialCaptions, type SocialBuildStatus,
} from '@/lib/local-bridge';
import { showSuccess, showError } from '@/utils/toast';
import type { Improvisation } from '@/types/improvisation';
import {
  CLIP_TARGETS,
  PLATFORMS,
  CAPTION_TABS,
  BUILD_PHASES,
  fmt,
  parseTime,
  timeAgo,
  splitYouTube,
  emptyCaptions,
} from './social-kit-helpers';

type ImprovisationData = Pick<Improvisation, 'id' | 'generated_name' | 'original_name' | 'artwork_url'>;

interface SocialKitTabProps {
  imp: ImprovisationData;
}

const SocialKitTab: React.FC<SocialKitTabProps> = ({ imp }) => {
  // Use the stable singleton client — the hook's wrapper functions are new
  // identities on every render, which would re-trigger the load effect.
  const { connected, client } = useLocalBridge();
  const navigate = useNavigate();
  const [kit, setKit] = useState<SocialKit | null>(null);
  const [loadingKit, setLoadingKit] = useState(false);
  const [building, setBuilding] = useState(false);
  const [buildStep, setBuildStep] = useState<string | null>(null);
  const [buildStartedAt, setBuildStartedAt] = useState<number | null>(null);
  const [buildElapsed, setBuildElapsed] = useState(0);
  const [phase, setPhase] = useState(0);
  const [captions, setCaptions] = useState<SocialCaptions>({});
  const [savedCaptions, setSavedCaptions] = useState<SocialCaptions>({});
  const [captionTab, setCaptionTab] = useState<SocialCaptionPlatform>('instagram');
  const [savingCaption, setSavingCaption] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewName, setPreviewName] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [showExcerpt, setShowExcerpt] = useState(false);
  const [showVideoStyle, setShowVideoStyle] = useState(false);
  const [clipSec, setClipSec] = useState('90');
  const [clipCount, setClipCount] = useState('1');
  const [clipTargets, setClipTargets] = useState<string[]>(['reels']);
  const [startAt, setStartAt] = useState('');
  const [posted, setPosted] = useState<Partial<Record<SocialCaptionPlatform, string>>>({});
  const [markingPosted, setMarkingPosted] = useState<SocialCaptionPlatform | null>(null);
  // Video style options
  const [visualizerEnabled, setVisualizerEnabled] = useState(true);
  const [visualizerType, setVisualizerType] = useState<'waveform' | 'spectrum' | 'spectrogram' | 'vectorscope' | 'volume'>('waveform');
  const [visualizerMode, setVisualizerMode] = useState('cline');
  const [visualizerColor, setVisualizerColor] = useState('#FFFFFF');
  const [visualizerWidth, setVisualizerWidth] = useState(1080);
  const [visualizerHeight, setVisualizerHeight] = useState(180);
  const [visualizerBg, setVisualizerBg] = useState('');
  const [titleOverlayEnabled, setTitleOverlayEnabled] = useState(true);
  const [titleOverlayText, setTitleOverlayText] = useState('');
  const [titleOverlayColor, setTitleOverlayColor] = useState('#FFFFFF');
  const [titleOverlayFontSize, setTitleOverlayFontSize] = useState(56);
  const previewUrlRef = useRef<string | null>(null);

  const title = useMemo(
    () => (imp.original_name || imp.generated_name || 'Untitled').replace(/^\d{8}\s+/, '').trim(),
    [imp.original_name, imp.generated_name],
  );

  /** Adopt a kit from either the build response or the status endpoint. */
  const applyKit = useCallback((next: SocialKit) => {
    setKit(next);
    const caps: SocialCaptions =
      next.captions && Object.values(next.captions).some(Boolean)
        ? next.captions
        : { instagram: next.caption || '' };
    // Kits built before per-platform captions only have the Instagram one.
    const complete: SocialCaptions = {
      instagram: caps.instagram || '',
      tiktok: caps.tiktok || caps.instagram || '',
      youtube: caps.youtube || caps.instagram || '',
    };
    setCaptions(complete);
    setSavedCaptions(complete);
    setPosted(next.posted || {});
  }, []);

  // --- Load any existing kit (so re-opening the page is instant) ---
  useEffect(() => {
    let cancelled = false;
    if (!connected || !imp.id) return;
    setLoadingKit(true);
    client.getSocialKit(imp.id).then((res) => {
      if (cancelled) return;
      if (res.success && res.data?.built) {
        applyKit(res.data);
        // Mirror the existing excerpt into the controls so "rebuild" reproduces
        // the same cut instead of silently reverting to the automatic one.
        const trimmed = (res.data.files || []).find(
          (f) => f.kind === 'video' && (f.clipStartSec || 0) > 0,
        );
        if (trimmed) {
          if (trimmed.clipSec) setClipSec(String(trimmed.clipSec));
          // Only pin a manual cut; auto excerpts should re-pick on rebuild.
          setStartAt(trimmed.autoExcerpt ? '' : fmt(trimmed.clipStartSec));
        }
        setClipCount(String(res.data.clipCount || 1));
        if (res.data.clipRatios?.length) setClipTargets(res.data.clipRatios);
      } else {
        setPosted({});
        setClipCount('1');
        setClipTargets(['reels']);
        setStartAt('');
      }
      setLoadingKit(false);
    });
    return () => { cancelled = true; };
  }, [connected, imp.id, client, applyKit]);

  // --- Resume a build that was already running (e.g. after a page reload) ---
  useEffect(() => {
    let cancelled = false;
    if (!connected || !imp.id) return;
    client.getSocialBuildStatus(imp.id).then((res) => {
      if (cancelled) return;
      const status = res.data;
      if (res.success && status?.building) {
        setBuilding(true);
        setBuildStep(status.step || 'Rendering…');
        setBuildStartedAt(status.startedAt || Date.now());
      }
    });
    return () => { cancelled = true; };
  }, [connected, imp.id, client]);

  // --- Real build progress: poll the bridge while the POST is in flight ---
  useEffect(() => {
    if (!building || !connected) return;
    let cancelled = false;
    const check = async () => {
      const res = await client.getSocialBuildStatus(imp.id);
      if (cancelled || !res.success || !res.data) return;
      const status: SocialBuildStatus = res.data;
      if (status.status === 'idle') return;
      if (status.step) setBuildStep(status.step);

      if (status.status === 'done') {
        const refreshed = await client.getSocialKit(imp.id);
        if (!cancelled && refreshed.success && refreshed.data?.built) applyKit(refreshed.data);
        if (!cancelled) {
          setBuilding(false);
          setBuildStep(null);
          setBuildStartedAt(null);
        }
      } else if (status.status === 'error') {
        if (!cancelled) {
          showError(status.error || 'The social kit build failed');
          setBuilding(false);
          setBuildStep(null);
          setBuildStartedAt(null);
        }
      }
    };
    void check();
    const timer = setInterval(() => { void check(); }, 2000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [building, connected, client, imp.id, applyKit]);

  // --- Elapsed time on the build card ---
  useEffect(() => {
    if (!building || !buildStartedAt) {
      setBuildElapsed(0);
      return;
    }
    const update = () => setBuildElapsed(Math.max(0, Math.round((Date.now() - buildStartedAt) / 1000)));
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [building, buildStartedAt]);

  // Advance the narrated phase while a build runs.
  useEffect(() => {
    if (!building) return;
    setPhase(0);
    const t = setInterval(() => setPhase((p) => Math.min(p + 1, BUILD_PHASES.length - 1)), 22000);
    return () => clearInterval(t);
  }, [building]);

  useEffect(() => () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
  }, []);

  const handleBuild = useCallback(async () => {
    const count = Number(clipCount) || 1;
    // One clip means every ratio gets the single cut; several clips only go to
    // the ratios the user ticked (never zero of them).
    const targets = count > 1 && clipTargets.length ? clipTargets : ['reels'];
    setBuilding(true);
    setBuildStep('Starting…');
    setBuildStartedAt(Date.now());
    try {
      const res = await client.buildSocialKit(imp.id, {
        clipSec: clipSec === 'full' ? 999999 : Number(clipSec) || undefined,
        clipStartSec: parseTime(startAt) ?? undefined,
        clipCount: count,
        clipRatios: targets,
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
          text: (titleOverlayText || title).toUpperCase(),
          color: titleOverlayColor,
          fontSize: titleOverlayFontSize,
        } : { enabled: false },
      });
      if (res.success && res.data) {
        applyKit(res.data);
        showSuccess(res.data.message || 'Social kit ready');
      } else {
        showError(res.error || 'Could not build the social kit');
      }
    } finally {
      setBuilding(false);
      setBuildStep(null);
      setBuildStartedAt(null);
    }
  }, [client, imp.id, clipSec, clipCount, clipTargets, startAt, applyKit, visualizerEnabled, visualizerType, visualizerMode, visualizerColor, visualizerWidth, visualizerHeight, visualizerBg, titleOverlayEnabled, titleOverlayText, titleOverlayColor, titleOverlayFontSize, title]);

  const handleReveal = () => {
    if (kit?.folder) openFolderInFinder(kit.folder);
  };

  const copyText = async (text: string, what: string) => {
    if (!text.trim()) {
      showError(`No ${what} yet`);
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      showSuccess(`${what} copied — paste it into the post`);
    } catch {
      showError('Could not access the clipboard');
    }
  };

  const handleCopyPath = async (file: SocialKitFile) => {
    try {
      await navigator.clipboard.writeText(file.path);
      showSuccess('File path copied');
    } catch {
      showError('Could not access the clipboard');
    }
  };

  const handleSaveCaption = async () => {
    const text = captions[captionTab] || '';
    if (!text.trim()) {
      showError('Caption is empty');
      return;
    }
    setSavingCaption(true);
    try {
      const res = await client.saveSocialCaption(imp.id, captionTab, text);
      if (res.success) {
        setSavedCaptions((prev) => ({ ...prev, [captionTab]: text }));
        showSuccess('Caption saved to the kit folder');
      } else {
        showError(res.error || 'Could not save the caption');
      }
    } finally {
      setSavingCaption(false);
    }
  };

  const handleTogglePosted = async (platform: SocialCaptionPlatform, next: boolean) => {
    setMarkingPosted(platform);
    try {
      const res = await client.markSocialPosted(imp.id, platform, next);
      if (res.success && res.data) {
        setPosted(res.data.posted || {});
        showSuccess(res.data.message || 'Updated');
      } else {
        showError(res.error || 'Could not update the post record');
      }
    } catch (e) {
      showError(e instanceof Error ? e.message : 'Could not update the post record');
    } finally {
      setMarkingPosted(null);
    }
  };

  const handlePreview = async (file: SocialKitFile) => {
    if (file.kind === 'text') return;
    setPreviewLoading(true);
    setPreviewName(file.name);
    const blob = await client.fetchSocialPreview(file.path);
    if (!blob) {
      showError('Could not load the preview — is the bridge still running?');
      setPreviewLoading(false);
      setPreviewName(null);
      return;
    }
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    const url = URL.createObjectURL(blob);
    previewUrlRef.current = url;
    setPreviewUrl(url);
    setPreviewLoading(false);
  };

  /**
   * One click = caption on the clipboard + the right file selected in Finder +
   * the upload page open. No thinking about which asset goes where.
   */
  const handlePlatform = (platform: (typeof PLATFORMS)[number]) => {
    const text = captions[platform.captionPlatform] || '';
    // YouTube publishes title and description in separate fields — send the
    // description, so pasting doesn't duplicate the title.
    const payload = platform.captionPlatform === 'youtube' ? splitYouTube(text).body : text;
    if (payload.trim()) {
      navigator.clipboard.writeText(payload).catch(() => showError('Could not copy the caption'));
    } else {
      showError('No caption for that platform yet');
    }

    window.open(platform.url, '_blank', 'noopener,noreferrer');

    const target = (kit?.files || []).find((f) => f.kind === 'video' && f.ratio === platform.ratio);
    if (target) {
      void revealInFinder(target.path);
    } else if (kit?.folder) {
      openFolderInFinder(kit.folder);
    }
  };

  const videos = (kit?.files || []).filter((f) => f.kind === 'video');
  const stills = (kit?.files || []).filter((f) => f.kind !== 'video');
  const longSong = (kit?.durationSec || 0) > 90;
  const trimmedVideos = videos.filter((v) => (v.clipStartSec || 0) > 0);
  // 9:16 and 1:1 share the same cut — list each window once in the summary.
  const trimmedWindows = [...new Map(
    trimmedVideos.map((v) => [`${v.clipStartSec}-${v.clipSec}`, v]),
  ).values()];
  const autoPicked = trimmedVideos.some((v) => v.autoExcerpt);
  const postedCount = Object.keys(posted).length;
  const activeCaption = captions[captionTab] || '';
  const captionDirty = activeCaption !== (savedCaptions[captionTab] || '');
  const isImagePreview = !!previewName && /\.(png|jpe?g)$/i.test(previewName);

  // --- Not connected: explain, don't dead-end ---
  if (!connected) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl flex items-center gap-2">
              <Film className="w-5 h-5" /> Social Kit
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              This builds artwork + ready-to-post videos on your Mac and stages them in a folder
              you can drag straight into Instagram, TikTok or YouTube.
            </p>
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                The Local Bridge must be running on your Mac. Start it with{' '}
                <code className="text-xs bg-muted px-1 py-0.5 rounded">pm2 start composer-hub-bridge</code>{' '}
                and set the bridge token under Local Bridge settings.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* --- Build / status --- */}
      <Card>
        <CardHeader>
          <CardTitle className="text-xl flex items-center gap-2">
            <Film className="w-5 h-5" /> Social Kit
            {kit?.built && postedCount > 0 && (
              <Badge variant="outline" className="ml-auto">{postedCount}/3 posted</Badge>
            )}
            {kit?.built && (
              <Badge variant="secondary" className={`${postedCount > 0 ? '' : 'ml-auto'} flex items-center gap-1`}>
                <Check className="w-3 h-3" /> Ready
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            One click turns <span className="font-medium text-foreground">{title}</span> into a
            vertical cut (Reels/TikTok/Shorts), a square cut, and a full-length YouTube video —
            with cover art, a thumbnail, and captions, staged in a folder on your Desktop, then
            copied to Moon Prism as a second copy.
          </p>

          {kit?.nas && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {kit.nas.status === 'mirrored' ? (
                <>
                  <Badge variant="secondary" className="flex items-center gap-1">
                    <Check className="w-3 h-3" /> Also on Moon Prism
                  </Badge>
                  {kit.nas.path && (
                    <button
                      type="button"
                      onClick={() => openFolderInFinder(kit.nas!.path!)}
                      className="text-primary hover:underline flex items-center gap-1"
                    >
                      <FolderOpen className="w-3 h-3" /> Open NAS copy
                    </button>
                  )}
                </>
              ) : kit.nas.status === 'unavailable' ? (
                <span className="text-amber-600 dark:text-amber-400">
                  Not copied to Moon Prism — the drive isn't mounted. Rebuild once it's back
                  (the videos are reused, so it's quick).
                </span>
              ) : kit.nas.status === 'failed' ? (
                <span className="text-destructive">
                  Moon Prism copy failed: {kit.nas.error}
                </span>
              ) : null}
            </div>
          )}

          {building ? (
            <div className="space-y-3 py-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
                {buildStep || BUILD_PHASES[phase]}
              </div>
              <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-1000 ease-out"
                  style={{ width: `${((phase + 1) / BUILD_PHASES.length) * 100}%` }}
                />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>
                  Rendering takes a minute or two depending on the length of the recording. You can
                  leave this page — the kit keeps building on your Mac.
                </span>
                {buildElapsed > 0 && (
                  <span className="flex items-center gap-1 tabular-nums">
                    <Clock className="w-3.5 h-3.5" /> {fmt(buildElapsed)} elapsed
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button onClick={handleBuild} disabled={loadingKit}>
                {kit?.built ? <RefreshCw className="w-4 h-4 mr-2" /> : <Sparkles className="w-4 h-4 mr-2" />}
                {kit?.built ? 'Rebuild Social Kit' : 'Build Social Kit'}
              </Button>
              <Button variant="outline" onClick={() => navigate(`/video-drafting/${imp.id}`)}>
                <Film className="w-4 h-4 mr-2" /> Video Drafting
              </Button>
              {kit?.folder && (
                <Button variant="outline" onClick={handleReveal}>
                  <FolderOpen className="w-4 h-4 mr-2" /> Reveal in Finder
                </Button>
              )}
              {loadingKit && (
                <span className="flex items-center text-sm text-muted-foreground gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Checking for an existing kit…
                </span>
              )}
            </div>
          )}

          {kit?.built && kit.durationSec ? (
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              Recording is {fmt(kit.durationSec)} long.
              {autoPicked && ' The short cuts were trimmed to the strongest passage.'}
            </p>
          ) : null}

          {longSong && trimmedVideos.length > 0 && (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription className="text-xs">
                This recording is {fmt(kit?.durationSec)} — too long for Reels/TikTok/Shorts.
                Those cuts are trimmed to a shareable excerpt
                ({trimmedWindows.map((v) => `${fmt(v.clipStartSec)}–${fmt((v.clipStartSec || 0) + (v.clipSec || 0))}`).join(', ')}
                {autoPicked ? ', strongest first' : ''});
                the 16:9 YouTube file keeps the full piece.
              </AlertDescription>
            </Alert>
          )}

          {!building && (
            <Collapsible open={showExcerpt} onOpenChange={setShowExcerpt}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="px-0 text-muted-foreground">
                  <ChevronDown className={`w-4 h-4 mr-1 transition-transform ${showExcerpt ? 'rotate-180' : ''}`} />
                  Adjust the excerpt
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-3">
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Clip length</label>
                    <Select value={clipSec} onValueChange={setClipSec}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="60">1:00</SelectItem>
                        <SelectItem value="90">1:30</SelectItem>
                        <SelectItem value="180">3:00</SelectItem>
                        <SelectItem value="full">Full length</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Clips</label>
                    <Select value={clipCount} onValueChange={setClipCount}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">1 clip</SelectItem>
                        <SelectItem value="2">2 clips</SelectItem>
                        <SelectItem value="3">3 clips</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="social-start-at" className="text-xs font-medium text-muted-foreground">Start at</Label>
                    <Input
                      id="social-start-at"
                      value={startAt}
                      onChange={(e) => setStartAt(e.target.value)}
                      placeholder="Automatic (m:ss)"
                    />
                  </div>
                </div>
                {Number(clipCount) > 1 && (
                  <div className="mt-4 space-y-2">
                    <label className="text-xs font-medium text-muted-foreground">
                      Which videos get {clipCount} cuts
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {CLIP_TARGETS.map((target) => {
                        const on = clipTargets.includes(target.key);
                        return (
                          <Button
                            key={target.key}
                            type="button"
                            size="sm"
                            variant={on ? 'default' : 'outline'}
                            onClick={() => setClipTargets((prev) => (
                              prev.includes(target.key)
                                ? prev.filter((k) => k !== target.key)
                                : [...prev, target.key]
                            ))}
                          >
                            {on && <Check className="w-3.5 h-3.5 mr-1.5" />}
                            {target.label}
                          </Button>
                        );
                      })}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Every ticked video is rendered once per cut (numbered 1–{clipCount}). The rest
                      get a single cut — the square 1:1 posts stay one-per-platform, so doubling them
                      only costs time. The full-length 16:9 is always the whole piece.
                    </p>
                  </div>
                )}
                <p className="text-xs text-muted-foreground mt-2">
                  Applies to the Reels/TikTok and square cuts. Leave the start blank and the kit
                  picks the most active passages — extra clips never overlap. Songs shorter than
                  the clip length are never trimmed.
                </p>
              </CollapsibleContent>
            </Collapsible>
          )}

          {/* --- Video Style (waveform + title overlay) --- */}
          {!building && (
            <Collapsible open={showVideoStyle} onOpenChange={setShowVideoStyle}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="px-0 text-muted-foreground">
                  <ChevronDown className={`w-4 h-4 mr-1 transition-transform ${showVideoStyle ? 'rotate-180' : ''}`} />
                  Video style
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-3">
                <div className="space-y-4">
                  {/* Waveform */}
                  <div className="space-y-1.5">
                    <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={visualizerEnabled}
                        onChange={(e) => setVisualizerEnabled(e.target.checked)}
                        className="accent-primary"
                      />
                      Audio visualizer overlay
                    </label>
                    {visualizerEnabled && (
                      <div className="grid gap-4 sm:grid-cols-2 pl-6">
                        <div className="space-y-1.5">
                          <label className="text-xs font-medium text-muted-foreground">Type</label>
                          <Select value={visualizerType} onValueChange={setVisualizerType}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="waveform">Waveform (bars)</SelectItem>
                              <SelectItem value="spectrum">Spectrum (frequency bars)</SelectItem>
                              <SelectItem value="spectrogram">Spectrogram (waterfall)</SelectItem>
                              <SelectItem value="vectorscope">Vectorscope (stereo)</SelectItem>
                              <SelectItem value="volume">Volume meter</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="social-visualizer-mode" className="text-xs font-medium text-muted-foreground">Mode</Label>
                          <Select value={visualizerMode} onValueChange={setVisualizerMode}>
                            <SelectTrigger id="social-visualizer-mode" className="h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {visualizerType === 'waveform' && (
                                <>
                                  <SelectItem value="cline">Centered lines</SelectItem>
                                  <SelectItem value="p2p">Peak-to-peak</SelectItem>
                                </>
                              )}
                              {visualizerType === 'spectrum' && (
                                <>
                                  <SelectItem value="bar">Bars</SelectItem>
                                  <SelectItem value="line">Line</SelectItem>
                                  <SelectItem value="dot">Dots</SelectItem>
                                </>
                              )}
                              {visualizerType === 'spectrogram' && (
                                <>
                                  <SelectItem value="combined">Combined</SelectItem>
                                  <SelectItem value="separate">Separate channels</SelectItem>
                                </>
                              )}
                              {visualizerType === 'vectorscope' && (
                                <>
                                  <SelectItem value="lissajous">Lissajous</SelectItem>
                                  <SelectItem value="lissajous_xy">Lissajous XY</SelectItem>
                                  <SelectItem value="polar">Polar</SelectItem>
                                </>
                              )}
                              {visualizerType === 'volume' && (
                                <SelectItem value="bar">Bar meter</SelectItem>
                              )}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="social-visualizer-color" className="text-xs font-medium text-muted-foreground">Color</Label>
                          <Input
                            id="social-visualizer-color"
                            type="color"
                            value={visualizerColor}
                            onChange={(e) => setVisualizerColor(e.target.value)}
                            className="h-8 w-12"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="social-visualizer-height" className="text-xs font-medium text-muted-foreground">Height (px)</Label>
                          <Input
                            id="social-visualizer-height"
                            type="number"
                            value={visualizerHeight}
                            onChange={(e) => setVisualizerHeight(Number(e.target.value) || 180)}
                            min={50}
                            max={500}
                            className="h-8 text-xs w-20"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="social-visualizer-width" className="text-xs font-medium text-muted-foreground">Width (px)</Label>
                          <Input
                            id="social-visualizer-width"
                            type="number"
                            value={visualizerWidth}
                            onChange={(e) => setVisualizerWidth(Number(e.target.value) || 1080)}
                            min={100}
                            max={1920}
                            className="h-8 text-xs w-20"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="social-visualizer-bg" className="text-xs font-medium text-muted-foreground">Background (hex, optional)</Label>
                          <Input
                            id="social-visualizer-bg"
                            type="text"
                            value={visualizerBg}
                            onChange={(e) => setVisualizerBg(e.target.value)}
                            placeholder="e.g. 0x00000080"
                            className="h-8 text-xs w-40"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Title Overlay */}
                  <div className="space-y-1.5">
                    <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={titleOverlayEnabled}
                        onChange={(e) => setTitleOverlayEnabled(e.target.checked)}
                        className="accent-primary"
                      />
                      Song title overlay (bottom center)
                    </label>
                    {titleOverlayEnabled && (
                      <div className="grid gap-4 sm:grid-cols-2 pl-6">
                        <div className="space-y-1.5">
                          <label className="text-xs font-medium text-muted-foreground">Text</label>
                          <Input
                            value={titleOverlayText || title}
                            onChange={(e) => setTitleOverlayText(e.target.value)}
                            placeholder="Auto: song title"
                            className="h-8 text-xs"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="social-title-color" className="text-xs font-medium text-muted-foreground">Color</Label>
                          <Input
                            id="social-title-color"
                            type="color"
                            value={titleOverlayColor}
                            onChange={(e) => setTitleOverlayColor(e.target.value)}
                            className="h-8 w-12"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="social-title-font-size" className="text-xs font-medium text-muted-foreground">Font size (px)</Label>
                          <Input
                            id="social-title-font-size"
                            type="number"
                            value={titleOverlayFontSize}
                            onChange={(e) => setTitleOverlayFontSize(Number(e.target.value) || 56)}
                            min={24}
                            max={120}
                            className="h-8 text-xs w-20"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  <p className="text-xs text-muted-foreground">
                    Waveform renders as moving bars synced to the audio. Title uses a sans-serif font
                    in ALL CAPS, centered at the bottom. Both are burned into the video at render time.
                  </p>
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}

        </CardContent>
      </Card>

      {kit?.built && (
        <>
          {/* --- Files --- */}
          <Card>
            <CardHeader>
              <CardTitle className="text-xl flex items-center gap-2">
                <Film className="w-5 h-5" /> Videos & Assets
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {videos.map((file) => (
                <div
                  key={file.name}
                  className="flex flex-wrap items-center gap-3 rounded-lg border p-3"
                >
                  <div className="flex-1 min-w-[200px]">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{file.name}</span>
                      {file.ratio && <Badge variant="outline">{file.ratioLabel || file.ratio}</Badge>}
                      {file.idea && <Badge variant="secondary">Idea {file.clipIndex}</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {file.sizeMB} MB
                      {file.clipSec ? ` · ${fmt(file.clipSec)} clip from ${fmt(file.clipStartSec)}` : ''}
                      {file.autoExcerpt && !file.idea ? ' · strongest passage' : ''}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handlePreview(file)}
                      disabled={previewLoading && previewName === file.name}
                    >
                      {previewLoading && previewName === file.name
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : <Play className="w-4 h-4" />}
                      <span className="ml-2">Preview</span>
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => revealInFinder(file.path)}
                      title="Show this file in Finder (ready to drag)"
                    >
                      <FolderOpen className="w-4 h-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => handleCopyPath(file)} title="Copy file path">
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}

              {previewUrl && (
                <div className="rounded-lg overflow-hidden border bg-black">
                  {isImagePreview ? (
                    <img
                      key={previewUrl}
                      src={previewUrl}
                      alt={previewName || 'Kit image'}
                      className="w-full max-h-[420px] object-contain"
                    />
                  ) : (
                    <video key={previewUrl} src={previewUrl} controls autoPlay className="w-full max-h-[420px]" />
                  )}
                </div>
              )}

              <Separator />
              <div className="space-y-2">
                {stills.map((file) => (
                  <div key={file.name} className="flex items-center gap-2 text-sm text-muted-foreground">
                    {file.kind === 'image'
                      ? <Palette className="w-4 h-4 flex-shrink-0" />
                      : <Info className="w-4 h-4 flex-shrink-0" />}
                    <span className="truncate">{file.name}</span>
                    {file.sizeMB ? <span className="ml-auto text-xs">{file.sizeMB} MB</span> : null}
                    {file.kind === 'image' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2"
                        onClick={() => handlePreview(file)}
                        title="Preview image"
                      >
                        <ImageIcon className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* --- Post it --- */}
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">Post It</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Each button opens the upload page, copies that platform's caption, and selects the
                matching file in Finder. Drag it in, paste, post.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {PLATFORMS.map((platform) => {
                  const Icon = platform.icon;
                  const postedAt = posted[platform.captionPlatform];
                  const busy = markingPosted === platform.captionPlatform;
                  return (
                    <div key={platform.key} className="rounded-lg border p-3 space-y-2">
                      <Button
                        variant="outline"
                        className="w-full h-auto py-2 flex-col items-start gap-1"
                        onClick={() => handlePlatform(platform)}
                      >
                        <span className="flex items-center gap-2 font-medium">
                          <Icon className="w-4 h-4" /> {platform.label}
                          <ExternalLink className="w-3 h-3 opacity-60" />
                        </span>
                        <span className="text-xs text-muted-foreground text-left">{platform.fileHint}</span>
                      </Button>
                      <div className="flex items-center justify-between gap-2">
                        {postedAt ? (
                          <span className="flex items-center gap-1 text-xs text-green-600">
                            <Check className="w-3 h-3" /> Posted {timeAgo(postedAt)}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">Not posted</span>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-2 text-xs"
                          disabled={busy}
                          onClick={() => handleTogglePosted(platform.captionPlatform, !postedAt)}
                        >
                          {busy
                            ? <Loader2 className="w-3 h-3 animate-spin" />
                            : postedAt ? 'Undo' : 'Mark posted'}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <Separator />

              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  {CAPTION_TABS.map((tab) => (
                    <Button
                      key={tab.key}
                      size="sm"
                      variant={captionTab === tab.key ? 'default' : 'outline'}
                      onClick={() => setCaptionTab(tab.key)}
                    >
                      {tab.label}
                      {captions[tab.key] !== savedCaptions[tab.key] && (
                        <span className="ml-1.5 w-1.5 h-1.5 rounded-full bg-amber-400" title="Unsaved changes" />
                      )}
                    </Button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  {CAPTION_TABS.find((t) => t.key === captionTab)?.hint}
                </p>
                <Textarea
                  value={activeCaption}
                  onChange={(e) => setCaptions((prev) => ({ ...prev, [captionTab]: e.target.value }))}
                  rows={8}
                  className="text-sm"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => copyText(activeCaption, 'Caption')}>
                    <Copy className="w-4 h-4 mr-2" /> Copy
                  </Button>
                  {captionTab === 'youtube' && splitYouTube(activeCaption).title && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => copyText(splitYouTube(activeCaption).title, 'Title')}
                    >
                      <Copy className="w-4 h-4 mr-2" /> Copy title
                    </Button>
                  )}
                  <Button
                    size="sm"
                    onClick={handleSaveCaption}
                    disabled={!captionDirty || savingCaption}
                  >
                    {savingCaption
                      ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      : <Save className="w-4 h-4 mr-2" />}
                    Save to kit
                  </Button>
                  {captionDirty && (
                    <span className="text-xs text-muted-foreground">Unsaved edits</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Saved as a text file next to the videos, so it's there when you post from Finder.
                </p>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};

export default SocialKitTab;
