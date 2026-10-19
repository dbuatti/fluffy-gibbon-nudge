import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import {
  Check, Cloud, Copy, Dices, Download, Image as ImageIcon, Info, Loader2,
  Palette, Save, Sparkles, Wand2,
} from 'lucide-react';
import { showError, showSuccess } from '@/utils/toast';
import { cn } from '@/lib/utils';
import type { Improvisation } from '@/types/improvisation';
import {
  ART_PROMPT_NOTES, ART_PALETTES, buildArtPrompt, collectArtClues, colorName,
  defaultDirection, reconcileDirection, suggestArtDirection,
  type ArtDirection, type ArtPromptMode, type ArtSuggestions,
} from '@/lib/art-direction';
import { base64ToBlob, saveToRepository } from '@/lib/art-repository';
import {
  RELEASE_EXPORT_SIZE, describeImage, downloadBlob, getImageDimensions, toSquareExport,
} from '@/lib/image-compliance';

interface ArtPromptStudioProps {
  imp: Improvisation;
  /** Ask the parent to re-fetch the row (artwork URL / prompt changed). */
  onSaved: () => void;
}

const Chip: React.FC<{
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}> = ({ active, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      'rounded-full border px-3 py-1 text-xs transition-colors',
      active
        ? 'border-primary bg-primary text-primary-foreground'
        : 'border-border bg-background hover:bg-muted',
    )}
  >
    {children}
  </button>
);

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="space-y-1.5">
    <p className="text-xs font-medium text-muted-foreground">{label}</p>
    <div className="flex flex-wrap gap-1.5">{children}</div>
  </div>
);

const ArtPromptStudio: React.FC<ArtPromptStudioProps> = ({ imp, onSaved }) => {
  const clues = useMemo(() => collectArtClues(imp), [imp]);

  const [mode, setMode] = useState<ArtPromptMode>(clues.rich ? 'metadata' : 'generic');
  const [salt, setSalt] = useState(0);
  const [suggestions, setSuggestions] = useState<ArtSuggestions>(() => suggestArtDirection(clues, 0));
  const [direction, setDirection] = useState<ArtDirection>(() => defaultDirection(suggestArtDirection(clues, 0)));

  const [aiSuggestLoading, setAiSuggestLoading] = useState(false);
  const [aiPromptLoading, setAiPromptLoading] = useState(false);
  const [savingPrompt, setSavingPrompt] = useState(false);
  const [prompt, setPrompt] = useState(imp.artwork_prompt || '');
  const [cluesUsed, setCluesUsed] = useState<string[]>([]);

  const [genMode, setGenMode] = useState<'cloudflare' | 'gemini'>('cloudflare');
  const [genImage, setGenImage] = useState<string | null>(null);
  const [genLoading, setGenLoading] = useState(false);
  const [savingImage, setSavingImage] = useState(false);

  // A different song gets a fresh brief; a refetch of the same song does not.
  useEffect(() => {
    const next = suggestArtDirection(clues, 0);
    setSuggestions(next);
    setDirection(defaultDirection(next));
    setSalt(0);
    setPrompt(imp.artwork_prompt || '');
    setMode(clues.rich ? 'metadata' : 'generic');
    setGenImage(null);
    setCluesUsed([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imp.id]);

  const applySuggestions = (next: ArtSuggestions) => {
    setSuggestions(next);
    setDirection((current) => reconcileDirection(current, next));
  };

  const shuffle = () => {
    const nextSalt = salt + 1;
    setSalt(nextSalt);
    applySuggestions(suggestArtDirection(clues, nextSalt));
  };

  const aiSuggest = async () => {
    setAiSuggestLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('suggest-art-direction', {
        body: { improvisationId: imp.id },
      });
      if (error) throw error;
      if (data?.suggestions) {
        applySuggestions(data.suggestions as ArtSuggestions);
        showSuccess('AI suggested a new direction');
      } else {
        showError(data?.reason || 'AI suggestions unavailable — kept the local proposal');
      }
    } catch (e) {
      showError(e instanceof Error ? e.message : 'Could not fetch AI suggestions');
    } finally {
      setAiSuggestLoading(false);
    }
  };

  const toggleMood = (mood: string) => {
    setDirection((current) => {
      const has = current.moods.includes(mood);
      const moods = has ? current.moods.filter((m) => m !== mood) : [...current.moods, mood].slice(-4);
      return { ...current, moods: moods.length ? moods : [mood] };
    });
  };

  const composePrompt = () => {
    setPrompt(buildArtPrompt(direction, clues, mode));
    showSuccess('Prompt built from your direction');
  };

  const writeWithAI = async () => {
    setAiPromptLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-art-prompt', {
        body: { improvisationId: imp.id, mode, direction },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (!data?.prompt) throw new Error('No prompt returned');
      setPrompt(data.prompt);
      setCluesUsed(data.cluesUsed || []);
      onSaved();
      showSuccess(
        data.source === 'gemini'
          ? 'AI wrote a new prompt from the song'
          : 'Prompt written locally (AI unavailable)',
      );
    } catch (e) {
      showError(e instanceof Error ? e.message : 'Prompt generation failed');
      // Never leave the user empty-handed.
      setPrompt(buildArtPrompt(direction, clues, mode));
    } finally {
      setAiPromptLoading(false);
    }
  };

  const savePrompt = async () => {
    if (!prompt.trim()) return;
    setSavingPrompt(true);
    try {
      const { error } = await supabase
        .from('improvisations')
        .update({ artwork_prompt: prompt.trim() })
        .eq('id', imp.id);
      if (error) throw error;
      onSaved();
      showSuccess('Prompt saved to this song');
    } catch (e) {
      showError(e instanceof Error ? e.message : 'Could not save the prompt');
    } finally {
      setSavingPrompt(false);
    }
  };

  const copyPrompt = () => {
    if (!prompt.trim()) return;
    navigator.clipboard.writeText(prompt.trim())
      .then(() => showSuccess('Prompt copied'))
      .catch(() => showError('Could not copy the prompt'));
  };

  const generateImage = async () => {
    if (!prompt.trim()) {
      showError('Build or write a prompt first');
      return;
    }
    setGenLoading(true);
    setGenImage(null);
    try {
      const fn = genMode === 'cloudflare' ? 'generate-ai-artwork' : 'generate-ai-artwork-gemini';
      const { data, error } = await supabase.functions.invoke(fn, {
        body: { prompt: prompt.trim(), improvisationId: imp.id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (!data?.image) throw new Error('No image returned');
      setGenImage(data.image);
      showSuccess('Artwork generated — save it to get the 3000×3000 release file');
      try {
        const ready = await toSquareExport(base64ToBlob(data.image), RELEASE_EXPORT_SIZE);
        await saveToRepository({
          blob: ready,
          prompt: prompt.trim(),
          mode: genMode,
          improvisationId: imp.id,
        });
      } catch {
        // Not fatal: the image is still on screen and can be saved below.
      }
    } catch (e) {
      showError(e instanceof Error ? e.message : 'Generation failed');
    } finally {
      setGenLoading(false);
    }
  };

  const saveGeneratedImage = async () => {
    if (!genImage) return;
    setSavingImage(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not signed in');

      // Generation is 1024px (FLUX) — export the release format here so the
      // stored artwork is always square and 3000×3000.
      const ready = await toSquareExport(base64ToBlob(genImage), RELEASE_EXPORT_SIZE);
      const path = `${user.id}/artwork/${imp.id}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from('piano_improvisations')
        .upload(path, ready, { upsert: true, contentType: 'image/jpeg' });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('piano_improvisations').getPublicUrl(path);
      const { error: updateError } = await supabase
        .from('improvisations')
        .update({ artwork_url: urlData.publicUrl, artwork_prompt: prompt.trim() })
        .eq('id', imp.id);
      if (updateError) throw updateError;

      // Keep a copy in the repository too (it is already saved there at
      // generation time; this re-save is intentionally skipped to avoid dupes).
      onSaved();
      const dims = await getImageDimensions(ready);
      showSuccess(`Artwork saved — ${describeImage(ready, dims)}`);
    } catch (e) {
      showError(e instanceof Error ? e.message : 'Could not save the artwork');
    } finally {
      setSavingImage(false);
    }
  };

  const downloadGeneratedImage = async () => {
    if (!genImage) return;
    try {
      const ready = await toSquareExport(base64ToBlob(genImage), RELEASE_EXPORT_SIZE);
      const name = (imp.generated_name || 'artwork').replace(/[^\w\- ]+/g, '').trim() || 'artwork';
      downloadBlob(ready, `${name}_3000x3000.jpg`);
      const dims = await getImageDimensions(ready);
      showSuccess(`Downloaded ${describeImage(ready, dims)}`);
    } catch (e) {
      showError(e instanceof Error ? e.message : 'Download failed');
    }
  };

  const clueChips = [
    clues.genre && `Genre: ${clues.genre}`,
    clues.genre2,
    clues.mood && `Mood: ${clues.mood}`,
    clues.key && `Key: ${clues.key}`,
    clues.tempo && `${clues.tempo} BPM`,
    clues.tags.length > 0 && `${clues.tags.length} tags`,
    clues.themes.length > 0 && `${clues.themes.length} themes`,
    clues.benefits.length > 0 && `${clues.benefits.length} benefits`,
    clues.description && 'Description',
    clues.notes && 'Creative notes',
  ].filter(Boolean) as string[];

  const wordCount = prompt.trim() ? prompt.trim().split(/\s+/).length : 0;
  const selectedPaletteName = direction.palette.name;

  return (
    <Card id="artwork-studio" className="border-primary/20">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Palette className="h-5 w-5 text-primary" /> Artwork Prompt Studio
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Two ways in: a prompt built from every piece of song metadata, or a generic one.
          The app proposes the moods and colours — pick, shuffle or ask AI.
        </p>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* Prompt source -------------------------------------------------- */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Prompt source</span>
          <Button
            size="sm"
            variant={mode === 'metadata' ? 'default' : 'outline'}
            onClick={() => setMode('metadata')}
          >
            From song metadata
          </Button>
          <Button
            size="sm"
            variant={mode === 'generic' ? 'default' : 'outline'}
            onClick={() => setMode('generic')}
          >
            Generic / surprise me
          </Button>
          <Badge variant="outline" className="ml-auto text-[10px]">
            {mode === 'metadata' ? 'uses all available clues' : 'no song clues'}
          </Badge>
        </div>

        {mode === 'metadata' && (
          <div className="rounded-lg border bg-muted/40 p-3">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-medium">
              <Info className="h-3.5 w-3.5" /> Clues in play
            </p>
            {clueChips.length ? (
              <div className="flex flex-wrap gap-1.5">
                {clueChips.map((chip) => (
                  <Badge key={chip} variant="secondary" className="text-[10px] font-normal">{chip}</Badge>
                ))}
                {cluesUsed.length > 0 && (
                  <Badge className="text-[10px] font-normal" variant="outline">
                    AI used: {cluesUsed.join(', ')}
                  </Badge>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Not much metadata yet — add tags, notes or a description, or use the generic mode.
              </p>
            )}
          </div>
        )}

        {/* Direction ------------------------------------------------------ */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-sm font-semibold">Direction</h4>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={shuffle}>
              <Dices className="mr-1 h-3.5 w-3.5" /> Suggest again
            </Button>
            <Button size="sm" variant="outline" onClick={aiSuggest} disabled={aiSuggestLoading}>
              {aiSuggestLoading
                ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                : <Sparkles className="mr-1 h-3.5 w-3.5" />}
              AI suggest
            </Button>
          </div>
        </div>

        <div className="space-y-3">
          <Field label="Moods (pick 1–3)">
            {suggestions.moods.map((mood) => (
              <Chip
                key={mood}
                active={direction.moods.includes(mood)}
                onClick={() => toggleMood(mood)}
              >
                {mood}
              </Chip>
            ))}
          </Field>

          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Palette</p>
            <div className="grid gap-2 sm:grid-cols-3">
              {suggestions.palettes.map((palette) => (
                <button
                  key={palette.name}
                  type="button"
                  onClick={() => setDirection((d) => ({ ...d, palette }))}
                  className={cn(
                    'rounded-lg border p-2 text-left transition-all',
                    selectedPaletteName === palette.name
                      ? 'border-primary ring-2 ring-primary/40'
                      : 'hover:border-primary/40',
                  )}
                >
                  <span className="flex h-7 overflow-hidden rounded">
                    {palette.colors.map((hex) => (
                      <span key={hex} className="flex-1" style={{ backgroundColor: hex }} />
                    ))}
                  </span>
                  <span className="mt-1.5 block text-xs font-medium">{palette.name}</span>
                  <span className="block text-[10px] leading-tight text-muted-foreground">
                    {palette.colors.map((hex) => colorName(hex)).join(' · ')}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Style">
              {suggestions.styles.map((style) => (
                <Chip key={style} active={direction.style === style}
                  onClick={() => setDirection((d) => ({ ...d, style }))}>{style}</Chip>
              ))}
            </Field>
            <Field label="Texture">
              {suggestions.textures.map((texture) => (
                <Chip key={texture} active={direction.texture === texture}
                  onClick={() => setDirection((d) => ({ ...d, texture }))}>{texture}</Chip>
              ))}
            </Field>
            <Field label="Lighting">
              {suggestions.lighting.map((light) => (
                <Chip key={light} active={direction.lighting === light}
                  onClick={() => setDirection((d) => ({ ...d, lighting: light }))}>{light}</Chip>
              ))}
            </Field>
            <Field label="Composition">
              {suggestions.compositions.map((composition) => (
                <Chip key={composition} active={direction.composition === composition}
                  onClick={() => setDirection((d) => ({ ...d, composition }))}>{composition}</Chip>
              ))}
            </Field>
          </div>

          <Field label="Energy">
            {suggestions.energies.map((energy) => (
              <Chip key={energy} active={direction.energy === energy}
                onClick={() => setDirection((d) => ({ ...d, energy }))}>
                {energy}
              </Chip>
            ))}
          </Field>
        </div>

        <Separator />

        {/* Prompt --------------------------------------------------------- */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-sm font-semibold">Prompt</h4>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={composePrompt}>
              <Wand2 className="mr-1 h-3.5 w-3.5" /> Build prompt
            </Button>
            <Button size="sm" onClick={writeWithAI} disabled={aiPromptLoading}>
              {aiPromptLoading
                ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                : <Sparkles className="mr-1 h-3.5 w-3.5" />}
              Write with AI
            </Button>
          </div>
        </div>

        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Build a prompt from the direction above, or write with AI…"
          className="min-h-[140px] resize-y font-mono text-xs leading-relaxed"
        />

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={copyPrompt} disabled={!prompt.trim()}>
            <Copy className="mr-1 h-3.5 w-3.5" /> Copy
          </Button>
          <Button size="sm" variant="outline" onClick={savePrompt} disabled={!prompt.trim() || savingPrompt}>
            {savingPrompt
              ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              : <Save className="mr-1 h-3.5 w-3.5" />}
            Save to song
          </Button>
          <span className="text-xs text-muted-foreground">{wordCount} words</span>
        </div>

        <Separator />

        {/* Generation ----------------------------------------------------- */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold">Generate artwork</span>
          <Button size="sm" variant={genMode === 'cloudflare' ? 'default' : 'outline'}
            onClick={() => setGenMode('cloudflare')}>
            <Cloud className="mr-1 h-3.5 w-3.5" /> Cloudflare
          </Button>
          <Button size="sm" variant={genMode === 'gemini' ? 'default' : 'outline'}
            onClick={() => setGenMode('gemini')}>
            <Sparkles className="mr-1 h-3.5 w-3.5" /> Gemini
          </Button>
          <Button size="sm" className="ml-auto" onClick={generateImage} disabled={genLoading || !prompt.trim()}>
            {genLoading
              ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              : <ImageIcon className="mr-1 h-3.5 w-3.5" />}
            {genLoading ? 'Generating…' : 'Generate'}
          </Button>
        </div>

        <p className="text-[11px] text-muted-foreground">
          Cloudflare FLUX returns 1024px; saving exports a centred square JPEG at{' '}
          {RELEASE_EXPORT_SIZE}×{RELEASE_EXPORT_SIZE} for Insight Timer / streaming release.
          Prompt and image are both stored on the song.
        </p>

        {genImage && (
          <div className="space-y-3 rounded-lg border p-3">
            <div className="relative mx-auto w-full max-w-sm overflow-hidden rounded-lg border border-primary/30">
              <img
                src={`data:image/png;base64,${genImage}`}
                alt="Generated artwork preview"
                className="aspect-square w-full object-cover"
              />
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              <Button size="sm" onClick={saveGeneratedImage} disabled={savingImage}>
                {savingImage
                  ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                  : <Check className="mr-1 h-3.5 w-3.5" />}
                Save 3000×3000 to song
              </Button>
              <Button size="sm" variant="outline" onClick={downloadGeneratedImage}>
                <Download className="mr-1 h-3.5 w-3.5" /> Download 3000×3000
              </Button>
            </div>
          </div>
        )}

        <div className="rounded-md bg-muted/40 p-3">
          <p className="mb-1 text-[11px] font-medium">Why the prompts look like this</p>
          <ul className="space-y-0.5 text-[11px] text-muted-foreground">
            {ART_PROMPT_NOTES.map((note) => (
              <li key={note}>• {note}</li>
            ))}
            <li>
              • {Object.keys(ART_PALETTES).length} curated palettes, matched to mood and genre.
            </li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
};

export default ArtPromptStudio;
