import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Loader2, Sparkles, Film, FolderOpen, Copy, Instagram, Youtube, Music2,
  Play, RefreshCw, Check, Info, Clock, ExternalLink, Palette,
} from 'lucide-react';
import { useLocalBridge, openFolderInFinder, type SocialKit, type SocialKitFile } from '@/lib/local-bridge';
import { showSuccess, showError } from '@/utils/toast';
import type { Improvisation } from '@/types/improvisation';

type ImprovisationData = Pick<Improvisation, 'id' | 'generated_name' | 'original_name' | 'artwork_url'>;

interface SocialKitTabProps {
  imp: ImprovisationData;
}

/** 95 → "1:35" */
function fmt(sec?: number): string {
  if (!sec && sec !== 0) return '';
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Upload pages open in a new tab — no API keys, no review process. The kit
 * folder is already open in Finder, so it's drag-file → paste-caption → post.
 */
const PLATFORMS = [
  {
    key: 'reels',
    label: 'Instagram Reels',
    url: 'https://www.instagram.com/reels/',
    icon: Instagram,
    fileHint: 'Drag the 9:16 video',
  },
  {
    key: 'tiktok',
    label: 'TikTok',
    url: 'https://www.tiktok.com/upload?lang=en',
    icon: Music2,
    fileHint: 'Drag the 9:16 video',
  },
  {
    key: 'youtube',
    label: 'YouTube',
    url: 'https://studio.youtube.com/videos/upload',
    icon: Youtube,
    fileHint: 'Drag the 16:9 video',
  },
] as const;

/** Rough, honest progress narration — we only get a response at the end. */
const BUILD_PHASES = [
  'Finding the finished audio…',
  'Preparing artwork…',
  'Rendering the 9:16 video…',
  'Rendering the 1:1 video…',
  'Rendering the 16:9 video…',
  'Writing the caption…',
];

const SocialKitTab: React.FC<SocialKitTabProps> = ({ imp }) => {
  const { connected, client, getSocialKit, buildSocialKit } = useLocalBridge();
  const [kit, setKit] = useState<SocialKit | null>(null);
  const [loadingKit, setLoadingKit] = useState(false);
  const [building, setBuilding] = useState(false);
  const [phase, setPhase] = useState(0);
  const [caption, setCaption] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewName, setPreviewName] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const previewUrlRef = useRef<string | null>(null);

  const title = useMemo(
    () => (imp.original_name || imp.generated_name || 'Untitled').replace(/^\d{8}\s+/, '').trim(),
    [imp.original_name, imp.generated_name],
  );

  // --- Load any existing kit (so re-opening the page is instant) ---
  useEffect(() => {
    let cancelled = false;
    if (!connected || !imp.id) return;
    setLoadingKit(true);
    getSocialKit(imp.id).then((res) => {
      if (cancelled) return;
      if (res.success && res.data?.built) {
        setKit(res.data);
        setCaption(res.data.caption || '');
      }
      setLoadingKit(false);
    });
    return () => { cancelled = true; };
  }, [connected, imp.id, getSocialKit]);

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
    setBuilding(true);
    try {
      const res = await buildSocialKit(imp.id);
      if (res.success && res.data) {
        setKit(res.data);
        setCaption(res.data.caption || '');
        showSuccess(res.data.message || 'Social kit ready');
      } else {
        showError(res.error || 'Could not build the social kit');
      }
    } finally {
      setBuilding(false);
    }
  }, [buildSocialKit, imp.id]);

  const handleReveal = () => {
    if (kit?.folder) openFolderInFinder(kit.folder);
  };

  const handleCopyCaption = async () => {
    try {
      await navigator.clipboard.writeText(caption);
      showSuccess('Caption copied — paste it into the post');
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

  const videos = (kit?.files || []).filter((f) => f.kind === 'video');
  const stills = (kit?.files || []).filter((f) => f.kind !== 'video');
  const longSong = (kit?.durationSec || 0) > 90;
  const trimmedVideos = videos.filter((v) => (v.clipStartSec || 0) > 0);

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
            {kit?.built && (
              <Badge variant="secondary" className="ml-auto flex items-center gap-1">
                <Check className="w-3 h-3" /> Ready
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            One click turns <span className="font-medium text-foreground">{title}</span> into a
            vertical cut (Reels/TikTok/Shorts), a square cut, and a full-length YouTube video —
            with cover art and a caption, staged in a folder on your Desktop.
          </p>

          {building ? (
            <div className="space-y-3 py-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
                {BUILD_PHASES[phase]}
              </div>
              <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-1000 ease-out"
                  style={{ width: `${((phase + 1) / BUILD_PHASES.length) * 100}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Rendering takes a minute or two depending on the length of the recording. You can
                leave this page — the kit keeps building on your Mac.
              </p>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button onClick={handleBuild} disabled={loadingKit}>
                {kit?.built ? <RefreshCw className="w-4 h-4 mr-2" /> : <Sparkles className="w-4 h-4 mr-2" />}
                {kit?.built ? 'Rebuild Social Kit' : 'Build Social Kit'}
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
            </p>
          ) : null}

          {longSong && trimmedVideos.length > 0 && (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription className="text-xs">
                This recording is {fmt(kit?.durationSec)} — too long for Reels/TikTok/Shorts.
                Those cuts are trimmed to a shareable excerpt
                ({trimmedVideos.map((v) => `${fmt(v.clipStartSec)}–${fmt((v.clipStartSec || 0) + (v.clipSec || 0))}`).join(', ')});
                the 16:9 YouTube file keeps the full piece.
              </AlertDescription>
            </Alert>
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
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {file.sizeMB} MB
                      {file.clipSec ? ` · ${fmt(file.clipSec)} clip from ${fmt(file.clipStartSec)}` : ''}
                    </p>
                  </div>
                  <div className="flex gap-2">
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
                    <Button size="sm" variant="ghost" onClick={() => handleCopyPath(file)} title="Copy file path">
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}

              {previewUrl && (
                <div className="rounded-lg overflow-hidden border bg-black">
                  <video key={previewUrl} src={previewUrl} controls autoPlay className="w-full max-h-[420px]" />
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
                Open a platform, drag the matching file in from the Finder window, then paste the
                caption below. (Opening the upload page in a new tab — no accounts connected here.)
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {PLATFORMS.map(({ key, label, url, icon: Icon, fileHint }) => (
                  <Button
                    key={key}
                    variant="outline"
                    className="h-auto py-3 flex-col items-start gap-1"
                    onClick={() => {
                      window.open(url, '_blank', 'noopener,noreferrer');
                      handleReveal();
                    }}
                  >
                    <span className="flex items-center gap-2 font-medium">
                      <Icon className="w-4 h-4" /> {label}
                      <ExternalLink className="w-3 h-3 opacity-60" />
                    </span>
                    <span className="text-xs text-muted-foreground">{fileHint}</span>
                  </Button>
                ))}
              </div>

              <Separator />

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Caption</span>
                  <Button size="sm" variant="outline" onClick={handleCopyCaption}>
                    <Copy className="w-4 h-4 mr-2" /> Copy caption
                  </Button>
                </div>
                <Textarea
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  rows={6}
                  className="text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Edits here are just for copying — rebuild the kit to regenerate the file.
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
