import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import TagGenerator from '@/components/TagGenerator';
import { useUpdateComposition } from '@/hooks/useUpdateComposition';
import { showSuccess, showError } from '@/utils/toast';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Sparkles, Copy, Music, Palette, Info, BookOpen, Flag, Send, HardDrive, FolderOpen, Gauge, Piano, CheckCircle, XCircle, Users, Volume2, Globe, Loader2, RefreshCw, Trash2 } from 'lucide-react'; // Added Trash2
import AudioPlayer from './AudioPlayer'; // Import AudioPlayer
import AudioUploadForIdea from './AudioUploadForIdea'; // Import AudioUploadForIdea
import FilePathSuggestion from './FilePathSuggestion'; // Import FilePathSuggestion
import CompositionNotes from './CompositionNotes'; // Import CompositionNotes
import InsightTimerDescriptionGenerator from './InsightTimerDescriptionGenerator'; // Import InsightTimerDescriptionGenerator
import GenreSelect from './GenreSelect'; // Import GenreSelect
import SelectField from './SelectField'; // Import SelectField
import DistributionTogglesCard from './DistributionTogglesCard'; // Import DistributionTogglesCard
import AICreativeCoach from './AICreativeCoach'; // Import AICreativeCoach
import InsightTimerTab from './InsightTimerTab'; // Import InsightTimerTab
import PreFlightChecklist from './PreFlightChecklist'; // Import PreFlightChecklist
import DistroKidTab from './DistroKidTab'; // Import DistroKidTab
import EditableField from './EditableField'; // Import EditableField
import { useTitleGenerator } from '@/hooks/useTitleGenerator'; // Import useTitleGenerator
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'; // Import Card components
import { Separator } from '@/components/ui/separator'; // Import Separator
import { Switch } from '@/components/ui/switch'; // Import Switch
import { Label } from '@/components/ui/label'; // Import Label
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'; // Added Avatar imports
import { Input } from '@/components/ui/input'; // Added Input import
import CompositionProgressCard from './CompositionProgressCard'; // Added CompositionProgressCard import
import {
  INSIGHT_CONTENT_TYPES,
  INSIGHT_LANGUAGES,
  INSIGHT_PRIMARY_USES,
  INSIGHT_AUDIENCE_LEVELS,
  INSIGHT_AUDIENCE_AGES,
  INSIGHT_VOICES,
} from '@/lib/insight-constants';
import { getPublicAudioUrl } from '@/integrations/supabase/client'; // Import getPublicAudioUrl

// --- Constants for Select Fields ---
const MUSICAL_KEYS = [
  "C Major", "C# Major", "D Major", "Eb Major", "E Major", "F Major", "F# Major", "G Major", "Ab Major", "A Major", "Bb Major", "B Major",
  "C Minor", "C# Minor", "D Minor", "Eb Minor", "E Minor", "F Minor", "F# Minor", "G Minor", "Ab Minor", "A Minor", "Bb Minor", "B Minor",
];

const MOODS = [
  "Calm", "Energetic", "Melancholy", "Uplifting", "Mysterious", "Reflective", "Tense", "Joyful", 
  "Dreamy", "Aggressive", "Peaceful", "Hopeful", "Ambient", "Cinematic", "Epic", "Introspective"
];
// --- End Constants ---

// Define the Composition interface (or import it if it exists globally)
interface NoteTab {
  id: string;
  title: string;
  color: string;
  content: string;
}

interface Composition {
  id: string;
  file_name: string | null;
  status: 'uploaded' | 'analyzing' | 'completed' | 'failed';
  generated_name: string | null;
  artwork_url: string | null;
  artwork_prompt: string | null;
  created_at: string;
  notes: NoteTab[] | null;
  storage_path: string | null;
  is_ready_for_release: boolean | null;
  user_id: string;
  is_piano: boolean | null;
  is_improvisation: boolean | null;
  primary_genre: string | null;
  secondary_genre: string | null;
  analysis_data: { mood?: string; simulated_key?: string; simulated_tempo?: number; [key: string]: any } | null;
  user_tags: string[] | null;
  is_instrumental: boolean | null;
  is_original_song: boolean | null;
  has_explicit_lyrics: boolean | null;
  is_original_song_confirmed: boolean | null;
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
  ai_generated_description: string | null;
}

interface CompositionTabsProps {
  composition: Composition;
  currentTab: string;
  handleTabChange: (newTab: string) => void;
  handleRefetch: () => void;
  handleRegenerateArtwork: () => Promise<void>;
  handleClearFile: () => Promise<void>;
  handleGenerateArtworkPrompt: () => Promise<void>;
  handleUploadArtwork: (file: File) => Promise<void>;
  handleDeleteArtwork: () => Promise<void>;
  handleUpdateComposition: (updates: Partial<Composition>) => Promise<void>;
  // AI Augmentation handlers
  handleAIPopulateMetadata: () => Promise<void>;
  isPopulating: boolean;
  aiGeneratedDescription: string | null;
  setAiGeneratedDescription: React.Dispatch<React.SetStateAction<string | null>>;
  // Specific update handlers for metadata dialog
  handleUpdatePrimaryGenre: (v: string) => Promise<void>;
  handleUpdateSecondaryGenre: (v: string) => Promise<void>;
  handleUpdateAnalysisData: (key: keyof Composition['analysis_data'], newValue: string) => Promise<void>;
  handleUpdateIsImprovisation: (value: string) => Promise<void>;
  handleUpdateIsPiano: (checked: boolean) => Promise<void>;
  handleUpdateIsInstrumental: (checked: boolean) => Promise<void>;
  handleUpdateIsOriginalSong: (checked: boolean) => Promise<void>;
  handleUpdateHasExplicitLyrics: (checked: boolean) => Promise<void>;
  handleUpdateInsightContentType: (value: string) => Promise<void>;
  handleUpdateInsightLanguage: (value: string) => Promise<void>;
  handleUpdateInsightPrimaryUse: (value: string) => Promise<void>;
  handleUpdateInsightAudienceLevel: (value: string) => Promise<void>;
  handleUpdateInsightAudienceAge: (value: string[]) => Promise<void>;
  handleUpdateInsightVoice: (value: string) => Promise<void>;
  handleUpdateIsMetadataConfirmed: (checked: boolean) => Promise<void>;
  isCoreMetadataComplete: boolean;
}

const CompositionTabs: React.FC<CompositionTabsProps> = ({
  composition: imp,
  currentTab,
  handleTabChange,
  handleRefetch,
  handleRegenerateArtwork,
  handleClearFile,
  handleGenerateArtworkPrompt,
  handleUploadArtwork,
  handleDeleteArtwork,
  handleUpdateComposition,
  handleAIPopulateMetadata,
  isPopulating,
  aiGeneratedDescription,
  setAiGeneratedDescription,
  handleUpdatePrimaryGenre,
  handleUpdateSecondaryGenre,
  handleUpdateAnalysisData,
  handleUpdateIsImprovisation,
  handleUpdateIsPiano,
  handleUpdateIsInstrumental,
  handleUpdateIsOriginalSong,
  handleUpdateHasExplicitLyrics,
  handleUpdateInsightContentType,
  handleUpdateInsightLanguage,
  handleUpdateInsightPrimaryUse,
  handleUpdateInsightAudienceLevel,
  handleUpdateInsightAudienceAge,
  handleUpdateInsightVoice,
  handleUpdateIsMetadataConfirmed,
  isCoreMetadataComplete,
}) => {
  const { mutateAsync: updateTagsMutation, isPending: isUpdatingTags } = useUpdateComposition(imp.id);
  const { isPending: isUpdatingComposition } = useUpdateComposition(imp.id); // For general pending state

  const handleTagsUpdate = async (newTags: string[]) => {
    try {
      await updateTagsMutation({ updates: { user_tags: newTags } });
      showSuccess("Tags updated successfully!");
      handleRefetch();
    } catch (error) {
      showError(`Failed to update tags: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleCopyDescription = () => {
    if (aiGeneratedDescription) {
      navigator.clipboard.writeText(aiGeneratedDescription)
        .then(() => showSuccess("Description copied to clipboard!"))
        .catch(() => showError("Failed to copy description."));
    } else {
      showError("No description to copy.");
    }
  };

  const hasAudioFile = !!imp.storage_path;
  const publicAudioUrl = hasAudioFile ? getPublicAudioUrl(imp.storage_path!) : '';

  const renderGenreItem = (Icon: React.ElementType, label: string, value: string | null | undefined, onSave: (v: string) => Promise<void>) => (
    <div className="flex items-center space-x-2">
      <Icon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
      <span className="text-sm font-medium text-muted-foreground w-20 flex-shrink-0">{label}:</span>
      <div className="flex-grow">
        <GenreSelect
          value={value}
          label={label}
          onSave={onSave}
          placeholder="Select or type genre"
          disabled={isUpdatingComposition}
        />
      </div>
    </div>
  );

  const renderSelectAnalysisItem = (Icon: React.ElementType, label: string, value: string | null | undefined, options: string[], key: keyof Composition['analysis_data']) => (
    <div className="flex items-center space-x-2">
      <Icon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
      <span className="text-sm font-medium text-muted-foreground w-20 flex-shrink-0">{label}:</span>
      <div className="flex-grow">
        <SelectField
          value={value}
          label={label}
          options={options}
          onSave={(v) => handleUpdateAnalysisData(key, v)}
          placeholder={`Select ${label}`}
          disabled={isUpdatingComposition}
          allowCustom={label === 'Mood'}
          className="h-8" 
        />
      </div>
    </div>
  );

  const renderEditableItem = (Icon: React.ElementType, label: string, value: string | number | null | undefined, key: keyof Composition['analysis_data'], inputType: 'text' | 'number' = 'text') => (
    <div className="flex items-center space-x-2">
      <Icon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
      <span className="text-sm font-medium text-muted-foreground w-20 flex-shrink-0">{label}:</span>
      <EditableField
        value={String(value || '')}
        label={label}
        onSave={(v) => handleUpdateAnalysisData(key, v)}
        className="flex-grow"
        placeholder="Click to set"
        disabled={isUpdatingComposition}
      />
    </div>
  );

  return (
    <Tabs value={currentTab} onValueChange={handleTabChange} className="w-full">
      <TabsList className="grid w-full grid-cols-3 md:grid-cols-6 lg:grid-cols-9">
        <TabsTrigger value="details">Details</TabsTrigger>
        <TabsTrigger value="notes">Notes</TabsTrigger>
        <TabsTrigger value="tags">Tags</TabsTrigger>
        <TabsTrigger value="artwork">Artwork</TabsTrigger>
        <TabsTrigger value="description">Description</TabsTrigger>
        <TabsTrigger value="genres">Genres</TabsTrigger>
        <TabsTrigger value="insights">Insights</TabsTrigger>
        <TabsTrigger value="flags">Flags</TabsTrigger>
        <TabsTrigger value="release">Release</TabsTrigger>
      </TabsList>

      <TabsContent value="details" className="mt-4 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center text-xl">
              <Info className="h-5 w-5 mr-2" /> Basic Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Composition Type */}
              <div className="space-y-2">
                <Label className="font-semibold flex items-center"><Piano className="h-4 w-4 mr-2" /> Composition Type</Label>
                <div className="flex space-x-4 ml-4">
                  <Button 
                    variant={imp.is_improvisation ? "default" : "outline"} 
                    onClick={() => handleUpdateIsImprovisation('true')}
                    disabled={isUpdatingComposition}
                  >
                    Improvisation
                  </Button>
                  <Button 
                    variant={!imp.is_improvisation ? "default" : "outline"} 
                    onClick={() => handleUpdateIsImprovisation('false')}
                    disabled={isUpdatingComposition}
                  >
                    Fixed Composition
                  </Button>
                </div>
              </div>
              {/* File Path Suggestion */}
              <FilePathSuggestion 
                generatedName={imp.generated_name} 
                primaryGenre={imp.primary_genre} 
              />
            </div>
            <AICreativeCoach 
              improvisationId={imp.id} 
              hasAudioFile={hasAudioFile} 
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center text-xl">
              <Gauge className="h-5 w-5 mr-2" /> Technical Analysis
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {renderSelectAnalysisItem(Music, "Key", imp.analysis_data?.simulated_key, MUSICAL_KEYS, 'simulated_key')}
            {renderEditableItem(Gauge, "Tempo (BPM)", imp.analysis_data?.simulated_tempo, 'simulated_tempo', 'number')}
            {renderSelectAnalysisItem(Palette, "Mood", imp.analysis_data?.mood, MOODS, 'mood')}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="notes" className="mt-4">
        <CompositionNotes 
          improvisationId={imp.id} 
          initialNotes={imp.notes} 
          hasAudioFile={hasAudioFile} 
        />
      </TabsContent>

      <TabsContent value="tags" className="mt-4">
        <TagGenerator
          compositionId={imp.id}
          initialTags={imp.user_tags || []}
          onTagsUpdate={handleTagsUpdate}
          generatedName={imp.generated_name || ''}
          primaryGenre={imp.primary_genre || ''}
          secondaryGenre={imp.secondary_genre}
          mood={imp.analysis_data?.mood || ''}
        />
      </TabsContent>

      <TabsContent value="artwork" className="mt-4 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center text-xl">
              <Palette className="h-5 w-5 mr-2" /> Artwork Management
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col items-center space-y-4">
              <Avatar className="h-40 w-40 rounded-md border border-border/50 shadow-sm">
                <AvatarImage src={imp.artwork_url || undefined} alt={imp.generated_name || "Artwork"} />
                <AvatarFallback className="rounded-md bg-secondary dark:bg-accent">
                  <Palette className="h-20 w-20 text-muted-foreground" />
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col space-y-2 w-full max-w-[280px]">
                <Button variant="outline" size="sm" onClick={handleGenerateArtworkPrompt} disabled={isUpdatingComposition || !imp.generated_name || !imp.primary_genre || !imp.analysis_data?.mood}>
                  <Sparkles className="h-4 w-4 mr-2" /> Generate Artwork Prompt
                </Button>
                <Button variant="outline" size="sm" onClick={handleRegenerateArtwork} disabled={isUpdatingComposition || !imp.artwork_prompt}>
                  <RefreshCw className="h-4 w-4 mr-2" /> Regenerate Artwork
                </Button>
                <Input
                  id="artwork-upload-input-tab"
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      handleUploadArtwork(e.target.files[0]);
                    }
                  }}
                  className="w-full"
                  disabled={isUpdatingComposition}
                />
                {imp.artwork_url && (
                  <Button variant="destructive" size="sm" onClick={handleDeleteArtwork} disabled={isUpdatingComposition}>
                    <Trash2 className="h-4 w-4 mr-2" /> Delete Artwork
                  </Button>
                )}
              </div>
            </div>
            {imp.artwork_prompt && (
              <div className="space-y-2 p-4 bg-muted/50 rounded-md border">
                <h3 className="text-lg font-semibold flex items-center"><Info className="h-5 w-5 mr-2" /> Current Artwork Prompt:</h3>
                <p className="text-muted-foreground italic">{imp.artwork_prompt}</p>
                <Button variant="outline" size="sm" onClick={() => navigator.clipboard.writeText(imp.artwork_prompt || '')}>
                  <Copy className="h-4 w-4 mr-2" /> Copy Prompt
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="description" className="mt-4">
        <InsightTimerDescriptionGenerator improvisationId={imp.id} />
        <div className="space-y-4 mt-4">
          <Textarea
            placeholder="AI Generated Description"
            value={aiGeneratedDescription || ''}
            onChange={(e) => setAiGeneratedDescription(e.target.value)}
            rows={6}
            disabled={isPopulating}
          />
          <div className="flex space-x-2">
            <Button onClick={handleAIPopulateMetadata} disabled={isPopulating}>
              <Sparkles className="h-4 w-4 mr-2" /> Generate with AI
            </Button>
            <Button variant="outline" onClick={handleCopyDescription} disabled={!aiGeneratedDescription}>
              <Copy className="h-4 w-4 mr-2" /> Copy
            </Button>
          </div>
        </div>
      </TabsContent>

      <TabsContent value="genres" className="mt-4 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center text-xl">
              <Music className="h-5 w-5 mr-2" /> Genre Selection
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {renderGenreItem(Music, "Primary Genre", imp.primary_genre, handleUpdatePrimaryGenre)}
            {renderGenreItem(Music, "Secondary Genre", imp.secondary_genre, handleUpdateSecondaryGenre)}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="insights" className="mt-4">
        <InsightTimerTab
          imp={imp}
          aiGeneratedDescription={aiGeneratedDescription || ''}
          isPopulating={isPopulating}
          handleAIPopulateMetadata={handleAIPopulateMetadata}
          setAiGeneratedDescription={setAiGeneratedDescription}
          handleUpdateIsMetadataConfirmed={handleUpdateIsMetadataConfirmed}
        />
      </TabsContent>

      <TabsContent value="flags" className="mt-4">
        <DistributionTogglesCard
          improvisationId={imp.id}
          isPiano={imp.is_piano}
          isInstrumental={imp.is_instrumental}
          isOriginalSong={imp.is_original_song}
          hasExplicitLyrics={imp.has_explicit_lyrics}
        />
      </TabsContent>

      <TabsContent value="release" className="mt-4 space-y-6">
        <PreFlightChecklist 
          imp={imp} 
          isAnalyzing={imp.status === 'analyzing'} 
        />
        <CompositionProgressCard
          progressValue={imp.is_ready_for_release ? 100 : (isCoreMetadataComplete ? 75 : (hasAudioFile ? 50 : 25))}
          progressMessage={imp.is_ready_for_release ? "Composition is ready for release!" : "Complete the checklist to mark as ready."}
          primaryAction={imp.is_ready_for_release ? null : {
            label: "Mark Ready for Release",
            onClick: () => handleUpdateComposition({ is_ready_for_release: true, is_metadata_confirmed: true }),
            variant: "default",
          }}
          isAnalyzing={imp.status === 'analyzing'}
          isMarkingReady={isUpdatingComposition}
          isPopulating={isPopulating}
          isReadyForRelease={imp.is_ready_for_release}
        />
        <DistroKidTab 
          imp={imp} 
          isReady={!!imp.is_ready_for_release} 
        />
      </TabsContent>
    </Tabs>
  );
};

export default CompositionTabs;