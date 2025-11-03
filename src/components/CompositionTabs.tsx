import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import TagGenerator from '@/components/TagGenerator';
import { useUpdateComposition } from '@/hooks/useUpdateComposition'; // FIX: Corrected import path
import { showSuccess, showError } from '@/utils/toast'; // Assuming toast utilities exist
import { Textarea } from '@/components/ui/textarea'; // Assuming this is used for description
import { Button } from '@/components/ui/button'; // Assuming this is used for description
import { Sparkles, Copy } from 'lucide-react'; // Assuming these are used for description

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
  is_improvisation: boolean | null; // This might need to be renamed to is_composition
  primary_genre: string | null;
  secondary_genre: string | null;
  analysis_data: { mood?: string; [key: string]: any } | null; // Added mood to analysis_data
  user_tags: string[] | null;
  is_instrumental: boolean | null;
  is_original_song: boolean | null;
  has_explicit_lyrics: boolean | null;
  is_original_song_confirmed: boolean | null; // Added based on common patterns
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
  ai_generated_description: string | null; // Added based on error context
}

// FIX: Updated CompositionTabsProps to include all props passed from CompositionDetails.tsx
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
  handleGenerateName: () => Promise<void>;
  handleGenerateDescription: () => Promise<void>;
  handleGenerateMood: () => Promise<void>;
  handleGeneratePrimaryGenre: () => Promise<void>;
  handleGenerateSecondaryGenre: () => Promise<void>;
  handleGenerateIsInstrumental: () => Promise<void>;
  handleGenerateIsOriginalSong: () => Promise<void>;
  handleGenerateHasExplicitLyrics: () => Promise<void>;
  handleGenerateIsOriginalSongConfirmed: () => Promise<void>; // Added based on common patterns
  handleGenerateIsMetadataConfirmed: () => Promise<void>;
  handleGenerateInsightContentType: () => Promise<void>;
  handleGenerateInsightLanguage: () => Promise<void>;
  handleGenerateInsightPrimaryUse: () => Promise<void>;
  handleGenerateInsightAudienceLevel: () => Promise<void>;
  handleGenerateInsightAudienceAge: () => Promise<void>;
  handleGenerateInsightBenefits: () => Promise<void>;
  handleGenerateInsightPractices: () => Promise<void>;
  handleGenerateInsightThemes: () => Promise<void>;
  handleGenerateInsightVoice: () => Promise<void>;
  aiGeneratedDescription: string | null;
  setAiGeneratedDescription: React.Dispatch<React.SetStateAction<string | null>>;
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
  handleGenerateName,
  handleGenerateDescription,
  handleGenerateMood,
  handleGeneratePrimaryGenre,
  handleGenerateSecondaryGenre,
  handleGenerateIsInstrumental,
  handleGenerateIsOriginalSong,
  handleGenerateHasExplicitLyrics,
  handleGenerateIsOriginalSongConfirmed,
  handleGenerateIsMetadataConfirmed,
  handleGenerateInsightContentType,
  handleGenerateInsightLanguage,
  handleGenerateInsightPrimaryUse,
  handleGenerateInsightAudienceLevel,
  handleGenerateInsightAudienceAge,
  handleGenerateInsightBenefits,
  handleGenerateInsightPractices,
  handleGenerateInsightThemes,
  handleGenerateInsightVoice,
  aiGeneratedDescription,
  setAiGeneratedDescription,
}) => {
  // FIX for error 1: Pass compositionId to useUpdateComposition
  const { mutateAsync: updateTagsMutation } = useUpdateComposition(imp.id);

  const handleTagsUpdate = async (newTags: string[]) => {
    try {
      await updateTagsMutation({ // Use mutateAsync from the hook
        updates: { user_tags: newTags },
      });
      showSuccess("Tags updated successfully!");
      handleRefetch(); // Refetch parent data to update UI
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

  return (
    <Tabs value={currentTab} onValueChange={handleTabChange} className="w-full">
      <TabsList className="grid w-full grid-cols-3 md:grid-cols-6 lg:grid-cols-9"> {/* Adjusted grid-cols for more tabs */}
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
      <TabsContent value="details" className="mt-4">
        {/* Content for Details tab */}
        <p>Composition Name: {imp.generated_name || 'Untitled'}</p>
        <p>Primary Genre: {imp.primary_genre || 'N/A'}</p>
        {/* ... other details, using passed props as needed */}
      </TabsContent>
      <TabsContent value="notes" className="mt-4">
        {/* Content for Notes tab */}
        <p>Notes content goes here.</p>
      </TabsContent>
      <TabsContent value="tags" className="mt-4">
        {/* Tag Generator */}
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
      <TabsContent value="artwork" className="mt-4">
        {/* Artwork related content, using passed props */}
        <p>Artwork content goes here.</p>
        <Button onClick={handleGenerateArtworkPrompt}>Generate Artwork Prompt</Button>
        <Button onClick={handleRegenerateArtwork}>Regenerate Artwork</Button>
        <Button onClick={handleDeleteArtwork}>Delete Artwork</Button>
      </TabsContent>
      <TabsContent value="description" className="mt-4">
        {/* Description content */}
        <div className="space-y-4">
          <Textarea
            placeholder="AI Generated Description"
            value={aiGeneratedDescription || ''}
            onChange={(e) => setAiGeneratedDescription(e.target.value)}
            rows={6}
          />
          <div className="flex space-x-2">
            <Button onClick={handleGenerateDescription}>
              <Sparkles className="h-4 w-4 mr-2" /> Generate with AI
            </Button>
            <Button variant="outline" onClick={handleCopyDescription}>
              <Copy className="h-4 w-4 mr-2" /> Copy
            </Button>
          </div>
        </div>
      </TabsContent>
      <TabsContent value="genres" className="mt-4">
        {/* Genres content */}
        <p>Genres content goes here.</p>
        <Button onClick={handleGeneratePrimaryGenre}>Generate Primary Genre</Button>
        <Button onClick={handleGenerateSecondaryGenre}>Generate Secondary Genre</Button>
      </TabsContent>
      <TabsContent value="insights" className="mt-4">
        {/* Insights content */}
        <p>Insights content goes here.</p>
        <Button onClick={handleGenerateInsightContentType}>Generate Content Type</Button>
        {/* ... other insight buttons */}
      </TabsContent>
      <TabsContent value="flags" className="mt-4">
        {/* Flags content */}
        <p>Flags content goes here.</p>
        <Button onClick={handleGenerateIsInstrumental}>Generate Instrumental Flag</Button>
        {/* ... other flag buttons */}
      </TabsContent>
      <TabsContent value="release" className="mt-4">
        {/* Release content */}
        <p>Release content goes here.</p>
        <Button onClick={() => handleUpdateComposition({ is_ready_for_release: true })}>Mark Ready for Release</Button>
      </TabsContent>
    </Tabs>
  );
};

export default CompositionTabs;