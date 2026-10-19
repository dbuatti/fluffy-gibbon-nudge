import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Sparkles, Download, Shuffle, RefreshCw, Lock, Unlock, Palette, Sliders, Cloud, Cpu } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/utils/toast';
import {
  renderArt,
  createParams,
  PALETTES,
  downloadCanvas,
  type ArtParams,
} from '@/lib/generative-art';

const GenerativeArt: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [searchParams] = useSearchParams();
  const improvisationId = searchParams.get('improvisationId');
  const [improvisationTitle, setImprovisationTitle] = useState<string | null>(null);
  const [improvisationMood, setImprovisationMood] = useState<string | null>(null);
  const [improvisationTags, setImprovisationTags] = useState<string[]>([]);
  const [params, setParams] = useState<ArtParams>(() => createParams());
  const [seedLocked, setSeedLocked] = useState(false);
  const [prompt, setPrompt] = useState('Abstract atmospheric oil painting of a minimalist horizon, soft hazy fog, smooth gradient transition from deep stormy indigo blue on the left to warm glowing golden hour sunlight and blush pink on the right, calm reflective ocean surface below, ethereal light spill, subtle canvas texture, impressionistic tone, dreamlike serenity, high resolution, 8k');
  const [paletteName, setPaletteName] = useState('Calming Earth');
  const [generating, setGenerating] = useState(false);
  const [mode, setMode] = useState<'procedural' | 'cloudflare' | 'gemini'>('procedural');
  const [aiImage, setAiImage] = useState<string | null>(null);
  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null);
  const [history, setHistory] = useState<{ type: 'procedural' | 'cloudflare' | 'gemini'; image: string; prompt: string; seed?: number }[]>([]);
  // Cloudflare usage tracking
  const [cfUsage, setCfUsage] = useState<{ count: number; date: string }>(() => {
    try {
      const stored = localStorage.getItem('cf_usage');
      if (stored) {
        const parsed = JSON.parse(stored);
        const today = new Date().toISOString().slice(0, 10);
        if (parsed.date === today) return parsed;
      }
    } catch {}
    return { count: 0, date: new Date().toISOString().slice(0, 10) };
  });

  useEffect(() => {
    document.title = 'Generative Art - AI Composer Hub';
  }, []);

  // Load improvisation context if provided
  useEffect(() => {
    if (!improvisationId) return;
    (async () => {
      const { data } = await supabase
        .from('improvisations')
        .select('generated_name, analysis_data, user_tags, primary_genre, notes')
        .eq('id', improvisationId)
        .single();
      if (data) {
        setImprovisationTitle(data.generated_name);
        const mood = (data.analysis_data as any)?.mood;
        if (mood) setImprovisationMood(mood);
        if (data.user_tags) setImprovisationTags(data.user_tags);
        // Pre-fill prompt from context
        const parts = [data.generated_name, mood, (data.user_tags || []).join(', ')].filter(Boolean);
        setPrompt(parts.join(' — '));
      }
    })();
  }, [improvisationId]);

  const generate = useCallback(() => {
    if (!canvasRef.current) return;
    setGenerating(true);
    // Use setTimeout to allow UI to show spinner
    setTimeout(() => {
      const p = createParams({
        ...params,
        palette: PALETTES[paletteName] || params.palette,
        prompt: prompt || undefined,
        seed: seedLocked ? params.seed : Math.floor(Math.random() * 1e9),
      });
      if (seedLocked) p.seed = params.seed;
      setParams(p);
      renderArt(canvasRef.current!, p);
      // Save to history
      const dataUrl = canvasRef.current!.toDataURL('image/png');
      setHistory((h) => [{ type: 'procedural', image: dataUrl, prompt: prompt || '', seed: p.seed }, ...h].slice(0, 12));
      setGenerating(false);
    }, 50);
  }, [params, paletteName, prompt, seedLocked]);

  const generateAI = useCallback(async () => {
    if (!prompt.trim()) {
      showError('Enter a prompt first');
      return;
    }
    setGenerating(true);
    setAiImage(null);
    try {
      const { data, error } = await supabase.functions.invoke('generate-ai-artwork', {
        body: { prompt: prompt.trim(), improvisationId: improvisationId || undefined },
      });
      if (error) throw error;
      if (data?.error) {
        if (data.configured === false) {
          showError('Cloudflare Workers AI not configured. Set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in Supabase secrets.');
          setAiConfigured(false);
        } else {
          showError(data.error);
        }
        return;
      }
      if (data?.image) {
        setAiImage(data.image);
        setAiConfigured(true);
        setHistory((h) => [{ type: 'cloudflare', image: `data:image/png;base64,${data.image}`, prompt: prompt.trim() }, ...h].slice(0, 12));
        showSuccess('AI artwork generated');
        // Track usage
        setCfUsage((prev) => {
          const today = new Date().toISOString().slice(0, 10);
          const newCount = prev.date === today ? prev.count + 1 : 1;
          const updated = { count: newCount, date: today };
          localStorage.setItem('cf_usage', JSON.stringify(updated));
          return updated;
        });
      }
    } catch (e: any) {
      showError(e.message || 'AI generation failed');
    } finally {
      setGenerating(false);
    }
  }, [prompt, improvisationId]);

  const generateGemini = useCallback(async () => {
    if (!prompt.trim()) {
      showError('Enter a prompt first');
      return;
    }
    setGenerating(true);
    setAiImage(null);
    try {
      const { data, error } = await supabase.functions.invoke('generate-ai-artwork-gemini', {
        body: { prompt: prompt.trim(), improvisationId: improvisationId || undefined },
      });
      if (error) throw error;
      if (data?.error) {
        if (data.configured === false) {
          showError('Gemini API key not configured.');
          setAiConfigured(false);
        } else {
          showError(data.error);
        }
        return;
      }
      if (data?.image) {
        setAiImage(data.image);
        setAiConfigured(true);
        setHistory((h) => [{ type: 'gemini', image: `data:image/png;base64,${data.image}`, prompt: prompt.trim() }, ...h].slice(0, 12));
        showSuccess('Gemini artwork generated');
      }
    } catch (e: any) {
      showError(e.message || 'Gemini generation failed');
    } finally {
      setGenerating(false);
    }
  }, [prompt, improvisationId]);

  const randomize = useCallback(() => {
    const newParams = createParams({
      palette: PALETTES[paletteName],
      prompt: prompt || undefined,
    });
    setParams(newParams);
    setSeedLocked(false);
    if (canvasRef.current) renderArt(canvasRef.current, newParams);
  }, [paletteName, prompt]);

  // Initial render
  useEffect(() => {
    if (canvasRef.current) {
      const p = createParams({ palette: PALETTES[paletteName], prompt: prompt || undefined });
      setParams(p);
      renderArt(canvasRef.current, p);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDownload = () => {
    if ((mode === 'cloudflare' || mode === 'gemini') && aiImage) {
      const link = document.createElement('a');
      link.download = `ai-art-${Date.now()}.png`;
      link.href = `data:image/png;base64,${aiImage}`;
      link.click();
      return;
    }
    if (canvasRef.current) {
      downloadCanvas(canvasRef.current, `generative-art-${params.seed}.png`);
    }
  };

  const handleSaveToImprovisation = async () => {
    if (!improvisationId) return;
    setGenerating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not logged in');
      let blob: Blob;
      if ((mode === 'cloudflare' || mode === 'gemini') && aiImage) {
        const binary = atob(aiImage);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        blob = new Blob([bytes], { type: 'image/png' });
      } else {
        if (!canvasRef.current) throw new Error('No canvas');
        blob = await new Promise<Blob>((resolve, reject) => {
          canvasRef.current!.toBlob((b) => (b ? resolve(b) : reject(new Error('Failed to create image'))), 'image/png');
        });
      }
      const path = `${user.id}/artwork/${improvisationId}.png`;
      const { error: uploadError } = await supabase.storage
        .from('piano_improvisations')
        .upload(path, blob, { upsert: true, contentType: 'image/png' });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from('piano_improvisations').getPublicUrl(path);
      const { error: updateError } = await supabase
        .from('improvisations')
        .update({ artwork_url: urlData.publicUrl, artwork_prompt: prompt || null })
        .eq('id', improvisationId);
      if (updateError) throw updateError;
      showSuccess('Artwork saved to improvisation');
    } catch (e: any) {
      showError(e.message || 'Failed to save artwork');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <header className="mb-6 max-w-7xl mx-auto">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Generative Art Studio</h1>
            <p className="text-sm text-muted-foreground">
              Procedural abstract artwork — flow fields, particles, organic forms, textures. No API required.
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto">
        {improvisationId && improvisationTitle && (
          <Card className="mb-4 border-primary/30 bg-primary/5">
            <CardContent className="py-3 px-4 flex items-center gap-3">
              <Palette className="h-4 w-4 text-primary" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">Creating artwork for:</p>
                <p className="text-sm font-medium truncate">{improvisationTitle}</p>
                {improvisationMood && <Badge variant="secondary" className="text-[10px] mt-1">{improvisationMood}</Badge>}
              </div>
            </CardContent>
          </Card>
        )}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Canvas preview */}
          <div className="lg:col-span-2">
            <Card className="overflow-hidden">
              <CardContent className="p-0">
                <div className="relative bg-muted/30 flex items-center justify-center min-h-[400px]">
                  {(mode === 'cloudflare' || mode === 'gemini') && aiImage ? (
                    <img
                      src={`data:image/png;base64,${aiImage}`}
                      alt="AI generated artwork"
                      className="max-w-full max-h-[70vh] object-contain"
                    />
                  ) : (
                    <canvas
                      ref={canvasRef}
                      className="max-w-full max-h-[70vh] object-contain"
                      style={{ imageRendering: 'auto' }}
                    />
                  )}
                  {generating && (
                    <div className="absolute inset-0 flex items-center justify-center bg-background/50">
                      <RefreshCw className="h-6 w-6 animate-spin text-primary" />
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <div className="flex items-center gap-2 mt-4 flex-wrap">
              <div className="flex items-center rounded-md border border-input bg-background p-0.5">
                <Button
                  variant={mode === 'procedural' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setMode('procedural')}
                  className="h-8 text-xs gap-1.5"
                >
                  <Cpu className="h-3 w-3" /> Procedural
                </Button>
                <Button
                  variant={mode === 'cloudflare' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setMode('cloudflare')}
                  className="h-8 text-xs gap-1.5"
                >
                  <Cloud className="h-3 w-3" /> Cloudflare
                </Button>
                <Button
                  variant={mode === 'gemini' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setMode('gemini')}
                  className="h-8 text-xs gap-1.5"
                >
                  <Sparkles className="h-3 w-3" /> Gemini
                </Button>
              </div>
              {mode === 'procedural' ? (
                <>
                  <Button onClick={generate} disabled={generating} className="gap-2">
                    <Sparkles className="h-4 w-4" /> Generate
                  </Button>
                  <Button variant="outline" onClick={randomize} disabled={generating} className="gap-2">
                    <Shuffle className="h-4 w-4" /> Randomize
                  </Button>
                </>
              ) : mode === 'cloudflare' ? (
                <Button onClick={generateAI} disabled={generating} className="gap-2">
                  <Sparkles className="h-4 w-4" /> Generate with Cloudflare
                </Button>
              ) : (
                <Button onClick={generateGemini} disabled={generating} className="gap-2">
                  <Sparkles className="h-4 w-4" /> Generate with Gemini
                </Button>
              )}
              <Button variant="outline" onClick={handleDownload} className="gap-2">
                <Download className="h-4 w-4" /> Download PNG
              </Button>
              {improvisationId && (
                <Button variant="default" onClick={handleSaveToImprovisation} disabled={generating} className="gap-2">
                  <Palette className="h-4 w-4" /> Save to Improvisation
                </Button>
              )}
              {mode === 'cloudflare' && (
                <div className="text-[10px] text-muted-foreground flex items-center gap-1 ml-auto">
                  <Cloud className="h-3 w-3" />
                  <span>{cfUsage.count} images today · ~{cfUsage.count * 150} neurons used · 10,000/day free</span>
                </div>
              )}
              <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
                {mode === 'procedural' && (
                  <>
                    <span>Seed:</span>
                    <code className="bg-muted px-2 py-0.5 rounded">{params.seed}</code>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => setSeedLocked(!seedLocked)}
                      title={seedLocked ? 'Unlock seed' : 'Lock seed'}
                    >
                      {seedLocked ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Controls */}
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Palette className="h-4 w-4 text-primary" /> Palette
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Select value={paletteName} onValueChange={setPaletteName}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.keys(PALETTES).map((name) => (
                      <SelectItem key={name} value={name}>{name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex gap-1 flex-wrap">
                  {(PALETTES[paletteName] || []).map((c, i) => (
                    <div key={i} className="h-6 w-6 rounded border border-border" style={{ backgroundColor: c }} title={c} />
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Sliders className="h-4 w-4 text-primary" /> Parameters
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Complexity</Label>
                    <span className="text-xs text-muted-foreground">{params.complexity}</span>
                  </div>
                  <Slider
                    value={[params.complexity]}
                    min={1} max={10} step={1}
                    onValueChange={([v]) => setParams((p) => ({ ...p, complexity: v }))}
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Flow</Label>
                    <span className="text-xs text-muted-foreground">{params.flow.toFixed(2)}</span>
                  </div>
                  <Slider
                    value={[params.flow * 100]}
                    min={0} max={100} step={1}
                    onValueChange={([v]) => setParams((p) => ({ ...p, flow: v / 100 }))}
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Texture / Grain</Label>
                    <span className="text-xs text-muted-foreground">{params.texture.toFixed(2)}</span>
                  </div>
                  <Slider
                    value={[params.texture * 100]}
                    min={0} max={100} step={1}
                    onValueChange={([v]) => setParams((p) => ({ ...p, texture: v / 100 }))}
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Organic ↔ Geometric</Label>
                    <span className="text-xs text-muted-foreground">{params.organic.toFixed(2)}</span>
                  </div>
                  <Slider
                    value={[params.organic * 100]}
                    min={0} max={100} step={1}
                    onValueChange={([v]) => setParams((p) => ({ ...p, organic: v / 100 }))}
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Density</Label>
                    <span className="text-xs text-muted-foreground">{params.density}</span>
                  </div>
                  <Slider
                    value={[params.density]}
                    min={1} max={10} step={1}
                    onValueChange={([v]) => setParams((p) => ({ ...p, density: v }))}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Aspect Ratio</Label>
                  <Select value={params.aspectRatio} onValueChange={(v) => setParams((p) => ({ ...p, aspectRatio: v as ArtParams['aspectRatio'] }))}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1:1">Square (1:1)</SelectItem>
                      <SelectItem value="4:5">Portrait (4:5)</SelectItem>
                      <SelectItem value="16:9">Landscape (16:9)</SelectItem>
                      <SelectItem value="9:16">Vertical (9:16)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Prompt / Inspiration</CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder={mode === 'procedural' ? 'Describe the mood, imagery, or feeling… (e.g. "a single line of sunlight cutting through smoke")' : 'Describe the abstract artwork (e.g. "blue and gold abstract texture")'}
                  className="text-xs min-h-[80px] resize-none"
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  {mode === 'procedural' ? 'The prompt influences the seed for reproducible variations.' : mode === 'cloudflare' ? 'Sent to Cloudflare Workers AI (FLUX.1 Schnell). Try simple prompts like "blue and gold abstract texture".' : 'Gemini API key lacks image generation access. Create a new key at aistudio.google.com/apikey or use Cloudflare mode.'}
                </p>
                {!prompt.trim() && mode !== 'procedural' && (
                  <p className="text-[10px] text-amber-600 mt-1">⚠ Enter a prompt to enable AI generation.</p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Gallery */}
        {history.length > 0 && (
          <div className="mt-8">
            <h2 className="text-lg font-semibold mb-3">Recent Generations</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {history.map((item, i) => (
                <button
                  key={i}
                  onClick={() => {
                    if (item.type === 'procedural' && item.seed) {
                      const p = createParams({ ...params, seed: item.seed, prompt: item.prompt || undefined });
                      setParams(p);
                      setPrompt(item.prompt);
                      if (canvasRef.current) renderArt(canvasRef.current, p);
                      setMode('procedural');
                      setAiImage(null);
                    } else {
                      setAiImage(item.image.replace('data:image/png;base64,', ''));
                      setMode(item.type as 'cloudflare' | 'gemini');
                      setPrompt(item.prompt);
                    }
                  }}
                  className="group relative aspect-square rounded-lg overflow-hidden border border-border hover:border-primary transition-colors"
                  title={item.prompt || 'Generated artwork'}
                >
                  <img src={item.image} alt={item.prompt} className="w-full h-full object-cover" />
                  <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[9px] px-1 py-0.5 truncate">
                    {item.type === 'procedural' ? 'Procedural' : item.type === 'cloudflare' ? 'Cloudflare' : 'Gemini'} {item.prompt?.substring(0, 20) || ''}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default GenerativeArt;