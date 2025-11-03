import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Info, Music, Clock, Download } from 'lucide-react'; // <-- ADDED Music, Clock, Download
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import AudioUploadForIdea from './AudioUploadForIdea';
import CompositionNotes from './CompositionNotes';
import TagGenerator from './TagGenerator';
import AICreativeCoach from './AICreativeCoach';
import FilePathSuggestion from './FilePathSuggestion';
import AudioPlayer from './AudioPlayer';
import PreFlightChecklist from './PreFlightChecklist';
import DistroKidTab from './DistroKidTab';
import InsightTimerTab from './InsightTimerTab';
import { Input } from '@/components/ui/input';
import { Copy, ExternalLink, RefreshCw, Image as ImageIcon, AlertTriangle } from 'lucide-react';
import { showSuccess, showError } from '@/utils/toast';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import GenreSelect from './GenreSelect';
import { cn } from '@/lib/utils';

// External Links for Quick Access
const DISTROKID_URL = "https://distrokid.com/new/";
const INSIGHT_TIMER_URL = "https://teacher.insighttimer.com/tracks/create?type=audio";
const IMAGE_RESIZER_URL = "https://biteable.com/tools/image-resizer/";
const MIDJOURNEY_URL = "https://www.midjourney.com/";

interface NoteTab {
  id: string;
  title: string;
  color: string;
  content: string;
}

interface AnalysisData {
  simulated_key?: string;
  simulated_tempo?: number;
  mood?: string;
  [key: string]: any;
}

interface Improvisation {
  id: string;
  file_name: string | null;
  status: 'uploaded' | 'analyzing' | 'completed' | 'failed';
  generated_name: string | null;
  artwork_url: string | null;
  artwork_prompt: string | null; // NEW FIELD
  is_piano: boolean | null;
  is_improvisation: boolean | null;
  primary_genre: string | null;
  secondary_genre: string | null;
  analysis_data: AnalysisData | null;
  storage_path: string | null;
  notes: NoteTab[] | null;
  is_ready_for_release: boolean | null;
  user_tags: string[] | null;
  is_instrumental: boolean | null;
  is_original_song: boolean | null;
  has_explicit_lyrics: boolean | null;
  is_metadata_confirmed: boolean | null;
  insight_content_type: string | null;
  insight_language: string | null;
  insight_primary_use: string | null;
  insight_audience_level: string | null;
  insight_audience_age: string[] | null;
  insight_benefits: string[] | null;
  insight_practices: string | null;
  insight_themes: string[] | null;
  insight_voice: string | null;
}

interface CompositionTabsProps {
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
  isAnalyzing: boolean;
  isRegenerating: boolean;
  audioPublicUrl: string | null;
  // AI Augmentation Props
  isPopulating: boolean;
  aiGeneratedDescription: string;
  handleAIPopulateMetadata: () => Promise<void>;
  setAiGeneratedDescription: (description: string) => void;
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

const CompositionTabs: React.FC<CompositionTabsProps> = ({
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
  isAnalyzing,
  isRegenerating,
  audioPublicUrl,
  isPopulating,
  aiGeneratedDescription,
  handleAIPopulateMetadata,
  setAiGeneratedDescription,
}) => {
  const hasAudioFile = !!imp.storage_path;
  const isCompleted = imp.status === 'completed';
  
  const handleDownload = () => {
    if (imp.artwork_url) {
      const link = document.createElement('a');
      link.href = imp.artwork_url;
      link.download = `${imp.generated_name || 'artwork'}_3000x3000.jpg`; 
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
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
  
  const handleCopyPrompt = () => {
    if (imp.artwork_prompt) {
      navigator.clipboard.writeText(imp.artwork_prompt);
      showSuccess('AI Artwork Prompt copied to clipboard!');
    } else {
      showError('No prompt generated yet.');
    }
  };

  // A composition is blocked if any critical asset or confirmation is missing.
  const hasInsightTimerCategorization = (imp.insight_benefits?.length || 0) > 0 && !!imp.insight_practices && (imp.insight_themes?.length || 0) > 0;
  // Artwork check now relies on the user having uploaded an image (artwork_url is set)
  const isBlocked = !hasAudioFile || !imp.artwork_url || !hasInsightTimerCategorization || !imp.is_metadata_confirmed;


  return (
    <Tabs value={currentTab} onValueChange={handleTabChange} className="w-full">
      <TabsList className="grid w-full grid-cols-3 h-auto p-1">
        <TabsTrigger value="creative-hub" className="text-base py-2">Creative Hub</TabsTrigger>
        <TabsTrigger id="assets-tab-trigger" value="assets-downloads" className="text-base py-2">Assets & Downloads</TabsTrigger>
        <TabsTrigger id="analysis-distro-tab" value="analysis-distro" className="text-base py-2">
          Distribution Prep {isAnalyzing && <Loader2 className="h-4 w-4 ml-2 animate-spin" />}
        </TabsTrigger>
      </TabsList>

      {/* --- CREATIVE HUB TAB --- */}
      <TabsContent value="creative-hub" className="space-y-8 mt-6">
        
        {/* NEW: AI Creative Coach */}
        <AICreativeCoach 
          improvisationId={imp.id} 
          hasAudioFile={hasAudioFile} 
        />

        {/* NEW: Core Metadata Card (Exposed for quick editing) */}
        <Card>
          <CardHeader>
            <CardTitle className="text-xl flex items-center">
              <Music className="h-5 w-5 mr-2" /> Core Metadata
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
              <div className="space-y-2 border-b pb-4">
                  <Label className="font-semibold flex items-center"><Info className="h-4 w-4 mr-2" /> Composition Type</Label>
                  <RadioGroup 
                      value={String(imp.is_improvisation)} 
                      onValueChange={handleUpdateIsImprovisation}
                      disabled={isAnalyzing}
                      className="flex space-x-4 ml-4"
                  >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="true" id="main-improv" />
                        <Label htmlFor="main-improv">Improvisation</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="false" id="main-composition" />
                        <Label htmlFor="main-composition">Composition</Label>
                      </div>
                  </RadioGroup>
              </div>
              
              <div className="space-y-3">
                  <div className="flex items-center space-x-2">
                      <span className="text-sm font-medium text-muted-foreground w-20 flex-shrink-0">Primary Genre:</span>
                      <div className="flex-grow">
                          <GenreSelect
                              value={imp.primary_genre}
                              label="Primary Genre"
                              onSave={handleUpdatePrimaryGenre}
                              placeholder="Select or type genre"
                              disabled={isAnalyzing}
                          />
                      </div>
                  </div>
                  <div className="flex items-center space-x-2">
                      <span className="text-sm font-medium text-muted-foreground w-20 flex-shrink-0">Secondary Genre:</span>
                      <div className="flex-grow">
                          <GenreSelect
                              value={imp.secondary_genre}
                              label="Secondary Genre"
                              onSave={handleUpdateSecondaryGenre}
                              placeholder="Select or type genre"
                              disabled={isAnalyzing}
                          />
                      </div>
                  </div>
              </div>
          </CardContent>
        </Card>

        {/* 1. Audio Upload (if needed) - Prominent CTA */}
        {!hasAudioFile && imp.is_improvisation !== null && (
          <div id="audio-upload-cta">
              <AudioUploadForIdea 
                improvisationId={imp.id} 
                isImprovisation={imp.is_improvisation}
                onUploadSuccess={handleRefetch}
              />
          </div>
        )}

        {/* NEW: Tag Generator */}
        <TagGenerator improvisationId={imp.id} initialTags={imp.user_tags} />

        {/* 2. Composition Notes */}
        <div id="composition-notes">
          <CompositionNotes improvisationId={imp.id} initialNotes={imp.notes} hasAudioFile={hasAudioFile} />
        </div>
      </TabsContent>

      {/* --- ASSETS & DOWNLOADS TAB --- */}
      <TabsContent value="assets-downloads" className="space-y-8 mt-6">
        
        {/* Artwork Prompt & Actions Card */}
        <Card id="artwork-actions">
          <CardHeader>
            <CardTitle className="flex items-center text-xl">
                <ImageIcon className="w-5 h-5 mr-2" /> AI Artwork Prompt Generator
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            
            {/* Prompt Display */}
            <div className={cn(
                "p-4 rounded-lg border-2 border-dashed",
                imp.artwork_prompt ? "border-primary/50 bg-muted/50" : "border-red-500/50 bg-red-50/50 dark:bg-red-950/50"
            )}>
                <h3 className="font-semibold mb-2 flex items-center">
                    {imp.artwork_prompt ? 'Generated Prompt:' : 'Prompt Missing (Generate Below)'}
                </h3>
                <p className={cn("text-sm font-mono", !imp.artwork_prompt && "text-red-600 dark:text-red-400")}>
                    {imp.artwork_prompt || "Please ensure core metadata (Title, Genre, Mood) is set on the Creative Hub tab before generating the prompt."}
                </p>
            </div>

            {/* Actions Column */}
            <div className="space-y-2">
                <Button 
                    onClick={handleCopyPrompt} 
                    className="w-full"
                    disabled={!imp.artwork_prompt}
                >
                    <Copy className="h-4 w-4 mr-2" /> Copy Prompt to Clipboard
                </Button>
                <Button 
                    onClick={handleRegenerateArtwork} 
                    variant="outline" 
                    className="w-full"
                    disabled={isRegenerating || isAnalyzing || !imp.generated_name || !imp.primary_genre || !imp.analysis_data?.mood}
                >
                    {isRegenerating ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                        <RefreshCw className="h-4 w-4 mr-2" />
                    )}
                    {isRegenerating ? 'Regenerating Prompt...' : 'Regenerate Prompt'}
                </Button>
            </div>
            
            <Separator />
            
            <h3 className="text-lg font-semibold">External Artwork Generation</h3>
            <p className="text-sm text-muted-foreground">
                Use the generated prompt above with an external AI tool to create your unique 3000x3000 album cover.
            </p>
            <QuickLinkButton href={MIDJOURNEY_URL} icon={ImageIcon} label="Open Midjourney" />
            <QuickLinkButton href={IMAGE_RESIZER_URL} icon={ImageIcon} label="Image Resizer Tool" />
            
            <Separator />
            
            {/* Artwork Upload CTA */}
            <div className="p-4 border rounded-lg bg-yellow-50/50 dark:bg-yellow-950/50 space-y-2">
                <h3 className="text-lg font-semibold flex items-center text-yellow-700 dark:text-yellow-300">
                    <AlertTriangle className="h-5 w-5 mr-2" /> Manual Artwork Upload
                </h3>
                <p className="text-sm text-muted-foreground">
                    Once you have generated your 3000x3000 artwork externally, upload it here to link it to this composition.
                </p>
                {/* Placeholder for future manual upload component */}
                <Input type="file" accept=".jpg, .png" disabled={true} className="mt-2" />
                <Button variant="secondary" disabled className="w-full">
                    Upload Final Artwork (Coming Soon)
                </Button>
            </div>
          </CardContent>
        </Card>
        
        {/* File Path Suggestion remains here as it relates to local file assets */}
        <FilePathSuggestion 
            generatedName={imp.generated_name}
            primaryGenre={imp.primary_genre}
        />
        
        {/* Debugging: Public Audio URL */}
        {audioPublicUrl && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xl flex items-center">
                <ExternalLink className="w-5 h-5 mr-2 text-red-500" /> Audio URL (Debug)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                If the player above fails, copy this URL and check if the file loads directly in your browser.
              </p>
              <div className="flex space-x-2">
                <Input 
                  type="text" 
                  value={audioPublicUrl} 
                  readOnly 
                  className="flex-grow font-mono text-xs bg-muted"
                />
                <Button size="icon" onClick={handleCopyUrl} title="Copy Public URL">
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
        
      </TabsContent>

      {/* --- ANALYSIS & DISTRIBUTION TAB --- */}
      <TabsContent value="analysis-distro" className="space-y-8 mt-6">
        
        {/* NEW: Pre-Flight Checklist */}
        <PreFlightChecklist 
            imp={{
                id: imp.id,
                storage_path: imp.storage_path,
                artwork_url: imp.artwork_url,
                is_metadata_confirmed: imp.is_metadata_confirmed,
                insight_benefits: imp.insight_benefits,
                insight_practices: imp.insight_practices,
                insight_themes: imp.insight_themes,
            }}
            isAnalyzing={isAnalyzing}
        />
        
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
              <DistroKidTab imp={imp} isReady={!isAnalyzing && !isBlocked} />
            </TabsContent>
            <TabsContent value="insight-timer">
              <InsightTimerTab 
                  imp={imp} 
                  aiGeneratedDescription={aiGeneratedDescription}
                  isPopulating={isPopulating}
                  handleAIPopulateMetadata={handleAIPopulateMetadata}
                  setAiGeneratedDescription={setAiGeneratedDescription}
                  handleUpdateIsMetadataConfirmed={handleUpdateIsMetadataConfirmed}
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
    </Tabs>
  );
};

export default CompositionTabs;