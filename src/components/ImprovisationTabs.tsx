import { toSquareExport, downloadBlob, getImageDimensions, describeImage, INSIGHT_TIMER_MIN_DIM, INSIGHT_TIMER_MAX_BYTES } from '@/lib/image-compliance';
import React, { useEffect, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Info, Music, Clock, Download, ExternalLink, Image as ImageIcon, Sparkles } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import AudioUploadForImprovisation from './AudioUploadForImprovisation';
import ImprovisationNotes from './ImprovisationNotes';
import TagGenerator from './TagGenerator';
import AICreativeCoach from './AICreativeCoach';
import FilePathSuggestion from './FilePathSuggestion';
import AudioPlayer from './AudioPlayer';
import PreFlightChecklist from './PreFlightChecklist';
import DistroKidTab from './DistroKidTab';
import InsightTimerTab from './InsightTimerTab';
import SocialKitTab from './SocialKitTab';
import { Input } from '@/components/ui/input';
import { showSuccess, showError } from '@/utils/toast';
import { cn } from '@/lib/utils';
import ArtworkUpload from './ArtworkUpload';
import ArtPromptStudio from './ArtPromptStudio';
import DistributionTogglesCard from './DistributionTogglesCard';
import type { Improvisation } from '@/types/improvisation';
import type { ReleaseReadiness } from '@/lib/release-readiness';
import { DISTROKID_URL, INSIGHT_TIMER_URL, IMAGE_RESIZER_URL, VISUALGPT_AI_IMAGE_EDITOR_URL } from '@/lib/constants';

interface ImprovisationTabsProps {
  imp: Improvisation;
  currentTab: string;
  handleTabChange: (newTab: string) => void;
  handleRefetch: () => void;
  handleRegenerateArtwork: () => Promise<void>;
  handleClearFile: () => Promise<void>;
  handleUpdatePrimaryGenre: (v: string) => Promise<void>;
  handleUpdateSecondaryGenre: (v: string) => Promise<void>;
  handleUpdateIsImprovisation: (value: string) => Promise<void>;
  handleUpdateIsMetadataConfirmed: (checked: boolean) => Promise<void>;
  handleUpdateIsSubmittedToDistroKid: (checked: boolean) => Promise<void>;
  handleUpdateIsSubmittedToInsightTimer: (checked: boolean) => Promise<void>;
  isAnalyzing: boolean;
  isRegenerating: boolean;
  audioPublicUrl: string | null;
  readiness: ReleaseReadiness | null;
  // AI Augmentation Props
  isPopulating: boolean;
  aiGeneratedDescription: string;
  handleAIPopulateMetadata: () => Promise<void>;
  setAiGeneratedDescription: (description: string) => void;
  isPending: boolean;
  handleUpdateDescription: (value: string) => Promise<void>;
  handleUpdateInsightContentType: (value: string) => Promise<void>;
  handleUpdateInsightLanguage: (value: string) => Promise<void>;
  handleUpdateInsightPrimaryUse: (value: string) => Promise<void>;
  handleUpdateInsightAudienceLevel: (value: string) => Promise<void>;
  handleUpdateInsightAudienceAge: (value: string[]) => Promise<void>;
  handleUpdateInsightBenefits: (value: string[]) => Promise<void>;
  handleUpdateInsightPractices: (value: string) => Promise<void>;
  handleUpdateInsightThemes: (value: string[]) => Promise<void>;
  handleUpdateInsightVoice: (value: string) => Promise<void>;
  handleUpdateIsPiano: (checked: boolean) => Promise<void>;
  handleUpdateIsInstrumental: (checked: boolean) => Promise<void>;
  handleUpdateIsOriginalSong: (checked: boolean) => Promise<void>;
  handleUpdateHasExplicitLyrics: (checked: boolean) => Promise<void>;
}

const QuickLinkButton: React.FC<{ href: string, icon: React.ElementType, label: string }> = ({ href, icon: Icon, label }) => (
  <a href={href} target="_blank" rel="noopener noreferrer" className="w-full">
    <Button variant="outline" className="w-full justify-start text-sm h-8 px-3">
      <Icon className="h-4 w-4 mr-2" />
      {label}
      <ExternalLink className="h-3 w-3 ml-auto" />
    </Button>
  </a>
);

const ImprovisationTabs: React.FC<ImprovisationTabsProps> = ({
  imp,
  currentTab,
  handleTabChange,
  handleRefetch,
  handleRegenerateArtwork,
  handleClearFile,
  handleUpdatePrimaryGenre,
  handleUpdateSecondaryGenre,
  handleUpdateIsImprovisation,
  handleUpdateIsMetadataConfirmed,
  handleUpdateIsSubmittedToDistroKid,
  handleUpdateIsSubmittedToInsightTimer,
  isAnalyzing,
  isRegenerating,
  audioPublicUrl,
  readiness,
  isPopulating,
  aiGeneratedDescription,
  handleAIPopulateMetadata,
  setAiGeneratedDescription,
  isPending,
  handleUpdateDescription,
  handleUpdateInsightContentType,
  handleUpdateInsightLanguage,
  handleUpdateInsightPrimaryUse,
  handleUpdateInsightAudienceLevel,
  handleUpdateInsightAudienceAge,
  handleUpdateInsightBenefits,
  handleUpdateInsightPractices,
  handleUpdateInsightThemes,
  handleUpdateInsightVoice,
  handleUpdateIsPiano,
  handleUpdateIsInstrumental,
  handleUpdateIsOriginalSong,
  handleUpdateHasExplicitLyrics,
}) => {
  const hasAudioFile = !!imp.storage_path;
  const isCompleted = imp.status === 'completed';
  const hasArtwork = !!imp.artwork_url;
  const [artworkInfo, setArtworkInfo] = useState<string | null>(null);
  const [artworkReady, setArtworkReady] = useState<boolean | null>(null);

  // Show the stored file's real dimensions/size so "is this release-ready?"
  // is answered on the page rather than guessed.
  useEffect(() => {
    let cancelled = false;
    if (!imp.artwork_url) {
      setArtworkInfo(null);
      setArtworkReady(null);
      return;
    }
    (async () => {
      try {
        const res = await fetch(imp.artwork_url!);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        const dims = await getImageDimensions(blob);
        if (cancelled) return;
        setArtworkInfo(describeImage(blob, dims));
        setArtworkReady(
          Math.min(dims.width, dims.height) >= INSIGHT_TIMER_MIN_DIM &&
          blob.size <= INSIGHT_TIMER_MAX_BYTES,
        );
      } catch {
        if (!cancelled) {
          setArtworkInfo(null);
          setArtworkReady(null);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [imp.artwork_url]);

  const handleDownloadArtwork = async () => {
    if (!imp.artwork_url) {
      showError('No artwork available to download.');
      return;
    }
    try {
      // Fetch as blob so we can export a true 3000×3000 square JPEG —
      // a cross-origin <a download> is ignored by browsers, and the stored
      // file may be any size (AI generations are 1024 before upscaling).
      const res = await fetch(imp.artwork_url);
      if (!res.ok) throw new Error(`Could not fetch artwork (HTTP ${res.status})`);
      const original = await res.blob();
      const square = await toSquareExport(original);
      downloadBlob(square, `${(imp.generated_name || 'artwork').replace(/[^\w\- ]+/g, '')}_3000x3000.jpg`);
      const dims = await getImageDimensions(square);
      showSuccess(`Downloaded ${describeImage(square, dims)} — Insight Timer ready`);
    } catch (e) {
      showError(e instanceof Error ? e.message : 'Download failed');
    }
  };
  
  const handleCopyUrl = () => {
    if (audioPublicUrl) {
      navigator.clipboard.writeText(audioPublicUrl);
      showSuccess('Public audio URL copied to clipboard!');
    } else {
      showError('No public URL available.');
    }
  };
  
  // Distribution is blocked by the same required tasks the Overview tab shows —
  // a single definition instead of a second, subtly different inline one.
  const isBlocked = readiness ? !readiness.readyToSubmit : true;

  // --- Conditional Content Rendering ---

  if (currentTab === 'creative-hub') {
    return (
      <TabsContent value="creative-hub" className="space-y-8 mt-6">
        
        {/* NEW: AI Creative Coach */}
        <AICreativeCoach 
          improvisationId={imp.id}
        />

        {/* 1. Audio Upload (if needed) - Prominent CTA */}
        {!hasAudioFile && imp.is_improvisation !== null && (
          <div id="audio-upload-cta">
              <AudioUploadForImprovisation 
                improvisationId={imp.id}
                isImprovisationTypeImprovisation={imp.is_improvisation}
                onUploadSuccess={handleRefetch}
              />
          </div>
        )}

        {/* NEW: Tag Generator */}
        <TagGenerator improvisationId={imp.id} initialTags={imp.user_tags} />

        {/* 2. Improvisation Notes */}
        <div id="improvisation-notes">
          <ImprovisationNotes 
            improvisationId={imp.id} 
            initialNotes={imp.notes} 
          />
        </div>
      </TabsContent>
    );
  }

  if (currentTab === 'assets-downloads') {
    return (
      <TabsContent value="assets-downloads" className="space-y-8 mt-6">
        
        {/* Artwork Display & Actions Card */}
        <Card id="artwork-actions">
          <CardHeader>
            <CardTitle className="text-xl flex items-center">
                <ImageIcon className="w-5 h-5 mr-2" /> AI Artwork Prompt & External Generation
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            
            {/* Artwork Preview */}
            <div className={cn(
                "relative w-full aspect-square rounded-lg overflow-hidden border-2",
                hasArtwork ? "border-primary/50 shadow-inner" : "border-dashed border-destructive/40 bg-destructive/5 dark:bg-destructive/10"
            )}>
                {hasArtwork ? (
                    <img 
                        src={imp.artwork_url!} 
                        alt={imp.generated_name || "Generated Artwork"} 
                        className="w-full h-full object-cover" 
                    />
                ) : (
                    <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground p-4">
                        <ImageIcon className="w-12 h-12 mb-3 opacity-40" />
                        <p className="text-lg font-bold">No Artwork Yet</p>
                        <p className="text-sm mt-1">Generate a prompt below, use an external AI tool, then upload your artwork.</p>
                    </div>
                )}
                {isRegenerating && (
                    <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm">
                        <Loader2 className="h-12 w-12 animate-spin text-primary" />
                    </div>
                )}
            </div>

            {hasArtwork && (
                <div className="flex flex-wrap items-center gap-2 text-xs">
                    {artworkInfo && <span className="text-muted-foreground">{artworkInfo}</span>}
                    {artworkReady === true && (
                        <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 font-medium text-emerald-700 dark:text-emerald-400">
                            Release-ready (≥1600×1600, under 20 MB)
                        </span>
                    )}
                    {artworkReady === false && (
                        <span className="rounded-full bg-amber-500/15 px-2 py-0.5 font-medium text-amber-700 dark:text-amber-400">
                            Needs attention — download the 3000×3000 release art or re-upload
                        </span>
                    )}
                </div>
            )}

            {/* Saved prompt summary — the studio below owns editing */}
            <div className={cn(
                "p-4 rounded-lg border-2 border-dashed",
                imp.artwork_prompt ? "border-primary/40 bg-muted/50" : "border-destructive/40 bg-destructive/5 dark:bg-destructive/10"
            )}>
                <h3 className="font-semibold mb-2 flex items-center">
                    {imp.artwork_prompt ? 'Saved Artwork Prompt:' : 'No prompt saved yet'}
                </h3>
                <p className={cn("text-xs font-mono whitespace-pre-wrap", !imp.artwork_prompt && "text-muted-foreground")}>
                    {imp.artwork_prompt || "Build one in the Artwork Prompt Studio below — it can use every piece of song metadata, or go generic."}
                </p>
            </div>

            {/* Actions Column */}
            <div className="flex flex-col sm:flex-row gap-2">
                <Button
                    onClick={handleRegenerateArtwork}
                    variant="outline"
                    className="flex-1"
                    disabled={isRegenerating || isAnalyzing || !imp.generated_name}
                >
                    {isRegenerating ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                        <Sparkles className="h-4 w-4 mr-2" />
                    )}
                    {isRegenerating ? 'Regenerating…' : 'Quick regenerate prompt'}
                </Button>
                {hasArtwork && (
                    <Button
                        onClick={handleDownloadArtwork}
                        className="flex-1"
                    >
                        <Download className="h-4 w-4 mr-2" /> Download 3000×3000 release art
                    </Button>
                )}
            </div>
            
            <Separator />
            
            <h3 className="text-lg font-semibold">External Artwork Generation Tools</h3>
            <p className="text-sm text-muted-foreground">
                Copy a prompt from the studio below and use it with an external AI tool — then upload the result here.
            </p>
            <QuickLinkButton href={VISUALGPT_AI_IMAGE_EDITOR_URL} icon={ImageIcon} label="Open VisualGPT AI Image Editor" />
            <QuickLinkButton href={IMAGE_RESIZER_URL} icon={ImageIcon} label="Image Resizer Tool" />
            <a href={`/generative-art?improvisationId=${imp.id}`} className="block">
                <Button variant="outline" className="w-full justify-start text-sm h-8 px-3">
                    <Sparkles className="h-4 w-4 mr-2" />
                    Open Generative Art Studio (procedural, FLUX, Gemini)
                    <ExternalLink className="h-3 w-3 ml-auto" />
                </Button>
            </a>
            
            <Separator />
            
            {/* Manual Artwork Upload (Now functional) */}
            <ArtworkUpload 
                improvisationId={imp.id}
                onUploadSuccess={handleRefetch}
                currentArtworkUrl={imp.artwork_url}
            />
          </CardContent>
        </Card>
        
        {/* Prompt studio + inline generator */}
        <ArtPromptStudio imp={imp} onSaved={handleRefetch} />

        {/* File Path Suggestion remains here as it relates to local file assets */}
        <FilePathSuggestion 
            generatedName={imp.generated_name}
            primaryGenre={imp.primary_genre}
        />
        
      </TabsContent>
    );
  }

  if (currentTab === 'social') {
    return (
      <TabsContent value="social" className="space-y-8 mt-6">
        <SocialKitTab imp={imp} />
      </TabsContent>
    );
  }

  if (currentTab === 'analysis-distro') {
    return (
      <TabsContent value="analysis-distro" className="space-y-8 mt-6">
        
        {/* NEW: Pre-Flight Checklist (required tasks only, from the shared readiness model) */}
        {readiness && (
          <PreFlightChecklist
            readiness={readiness}
            isAnalyzing={isAnalyzing}
            onOpenTab={handleTabChange}
          />
        )}
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Technical Data Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
              <h3 className="text-lg font-semibold">User-Provided Technical Data</h3>
              <div className="space-y-3">
                  {/* Display Key */}
                  <div className="flex items-center">
                      <span className="font-semibold w-32 flex-shrink-0">Key:</span> 
                      <span className="ml-2 text-sm">{imp.analysis_data?.simulated_key || 'N/A'}</span>
                  </div>
                  {/* Display Tempo */}
                  <div className="flex items-center">
                      <span className="font-semibold w-32 flex-shrink-0">Tempo (BPM):</span> 
                      <span className="ml-2 text-sm">{imp.analysis_data?.simulated_tempo || 'N/A'}</span>
                  </div>
                  {/* Display Mood */}
                  <div className="flex items-center">
                      <span className="font-semibold w-32 flex-shrink-0">Mood:</span> 
                      <span className="ml-2 text-sm">{imp.analysis_data?.mood || 'N/A'}</span>
                  </div>
              </div>
              
              <Separator />
              <p className="text-sm text-muted-foreground">
                  To edit this data, click the <Info className="h-4 w-4 inline-block text-primary" /> icon next to the title on the Creative Hub tab.
              </p>
          </CardContent>
        </Card>
        
        {/* Distribution Toggles Card (Moved here from Metadata Dialog for better visibility) */}
        <DistributionTogglesCard
            improvisationId={imp.id}
            isPiano={imp.is_piano}
            isInstrumental={imp.is_instrumental}
            isOriginalSong={imp.is_original_song}
            hasExplicitLyrics={imp.has_explicit_lyrics}
            isPending={isPending}
            handleUpdateIsPiano={handleUpdateIsPiano}
            handleUpdateIsInstrumental={handleUpdateIsInstrumental}
            handleUpdateIsOriginalSong={handleUpdateIsOriginalSong}
            handleUpdateHasExplicitLyrics={handleUpdateHasExplicitLyrics}
        />

        {/* External Tools Card */}
        <Card>
          <CardHeader>
            <CardTitle>External Tools & Submission Links</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <QuickLinkButton href={DISTROKID_URL} icon={Music} label="DistroKid Submission" />
                  <QuickLinkButton href={INSIGHT_TIMER_URL} icon={Clock} label="Insight Timer Upload" />
              </div>
          </CardContent>
        </Card>

        {isCompleted && (
          <Tabs defaultValue="distrokid" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="distrokid">DistroKid Prep</TabsTrigger>
              <TabsTrigger value="insight-timer">Insight Timer Prep</TabsTrigger>
            </TabsList>
            <TabsContent value="distrokid">
              <DistroKidTab 
                imp={imp} 
                isReady={!isAnalyzing && !isBlocked} 
                handleUpdateIsSubmittedToDistroKid={handleUpdateIsSubmittedToDistroKid}
              />
            </TabsContent>
            <TabsContent value="insight-timer">
              <InsightTimerTab 
                  imp={imp} 
                  aiGeneratedDescription={aiGeneratedDescription}
                  isPopulating={isPopulating}
                  handleAIPopulateMetadata={handleAIPopulateMetadata}
                  setAiGeneratedDescription={setAiGeneratedDescription}
                  handleUpdateIsMetadataConfirmed={handleUpdateIsMetadataConfirmed}
                  handleUpdateIsSubmittedToInsightTimer={handleUpdateIsSubmittedToInsightTimer}
                  isPending={isPending}
                  handleUpdateDescription={handleUpdateDescription}
                  handleUpdateInsightContentType={handleUpdateInsightContentType}
                  handleUpdateInsightLanguage={handleUpdateInsightLanguage}
                  handleUpdateInsightPrimaryUse={handleUpdateInsightPrimaryUse}
                  handleUpdateInsightAudienceLevel={handleUpdateInsightAudienceLevel}
                  handleUpdateInsightAudienceAge={handleUpdateInsightAudienceAge}
                  handleUpdateInsightBenefits={handleUpdateInsightBenefits}
                  handleUpdateInsightPractices={handleUpdateInsightPractices}
                  handleUpdateInsightThemes={handleUpdateInsightThemes}
                  handleUpdateInsightVoice={handleUpdateInsightVoice}
              />
            </TabsContent>
          </Tabs>
        )}
        
        {!isCompleted && (
          <Card className="p-6 text-center border-dashed border-2 border-muted-foreground/50">
              <Loader2 className="h-8 w-8 mx-auto mb-3 animate-spin text-primary" />
              <p className="text-lg font-semibold">File Processing Pending</p>
              <p className="text-sm text-muted-foreground">
                  This section will populate once the audio file is uploaded and background processing (title/artwork generation) is complete.
              </p>
          </Card>
        )}
      </TabsContent>
    );
  }
  
  return null;
};

export default ImprovisationTabs;