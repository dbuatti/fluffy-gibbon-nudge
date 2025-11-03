import React from 'react';
import { useParams, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, getPublicAudioUrl as getPublicAudioUrlHelper } from '@/integrations/supabase/client';
import { Loader2, Music } from 'lucide-react';
import { showSuccess, showError } from '@/utils/toast';
import AudioPlayer from '@/components/AudioPlayer';
import { useUpdateImprovisation } from '@/hooks/useUpdateImprovisation'; // Renamed hook
import { useAIAugmentation } from '@/hooks/useAIAugmentation';
import ImprovisationHeader from '@/components/ImprovisationHeader';
import ImprovisationProgressCard from '@/components/ImprovisationProgressCard';
import ImprovisationTabs from '@/components/ImprovisationTabs';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useSession } from '@/integrations/supabase/session-context';

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

interface Improvisation { // Renamed interface
  id: string;
  file_name: string | null;
  status: 'uploaded' | 'analyzing' | 'completed' | 'failed';
  generated_name: string | null;
  artwork_url: string | null;
  artwork_prompt: string | null;
  is_piano: boolean | null;
  is_improvisation: boolean | null;
  primary_genre: string | null;
  secondary_genre: string | null;
  analysis_data: AnalysisData | null;
  created_at: string;
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

const fetchImprovisationDetails = async (id: string): Promise<Improvisation> => { // Renamed fetch function
  const { data, error } = await supabase
    .from('improvisations') // Updated table name
    .select('id,user_id,file_name,storage_path,status,generated_name,analysis_data,created_at,artwork_url,artwork_prompt,is_piano,primary_genre,secondary_genre,is_improvisation,notes,is_ready_for_release,user_tags,is_instrumental,is_original_song,has_explicit_lyrics,is_metadata_confirmed,insight_content_type,insight_language,insight_primary_use,insight_audience_level,insight_audience_age,insight_benefits,insight_practices,insight_themes,insight_voice')
    .eq('id', id)
    .single();

  if (error) throw new Error(error.message);
  return data as Improvisation;
};

const getPublicAudioUrl = (storagePath: string | null): string | null => {
    if (!storagePath) return null;
    return getPublicAudioUrlHelper(storagePath);
};

const getPublicArtworkDisplayUrl = (artworkUrl: string | null): string | null => {
    return artworkUrl;
};


const ImprovisationDetails: React.FC = () => { // Renamed component
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { session, isLoading: isSessionLoading } = useSession();
  const [isRegenerating, setIsRegenerating] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [isMarkingReady, setIsMarkingReady] = React.useState(false);

  // --- Tab State Management using URL Query Params ---
  const query = new URLSearchParams(location.search);
  const currentTab = query.get('tab') || 'creative-hub';

  const handleTabChange = (newTab: string) => {
    navigate(`?tab=${newTab}`, { replace: true });
  };
  // --- End Tab State Management ---

  const { data: imp, isLoading, error } = useQuery<Improvisation>({ // Renamed variable and type
    queryKey: ['improvisation', id], // Updated query key
    queryFn: () => fetchImprovisationDetails(id!), // Updated fetch function
    enabled: !!id && !isSessionLoading && !!session?.user?.id,
    refetchInterval: 5000,
  });

  const updateMutation = useUpdateImprovisation(id!); // Updated hook
  const { isPopulating, aiGeneratedDescription, handleAIPopulateMetadata, setAiGeneratedDescription } = useAIAugmentation(id!);
  
  // Determine if we are loading the initial data OR if the status is actively analyzing
  const isAnalyzing = imp?.status === 'analyzing'; // Updated variable
  const showLoadingSpinner = isLoading || isSessionLoading || isAnalyzing;
  const hasAudioFile = !!imp?.storage_path; // Updated variable
  const isReadyForRelease = imp?.is_ready_for_release; // Updated variable
  
  // Get public URL for the audio file
  const audioPublicUrl = getPublicAudioUrl(imp?.storage_path || null); // Updated variable
  // Get public URL for the artwork
  const artworkDisplayUrl = getPublicArtworkDisplayUrl(imp?.artwork_url || null); // Updated variable

  // NEW: Core Metadata Completion Check
  const isCoreMetadataComplete = !!imp?.primary_genre && !!imp?.analysis_data?.simulated_key && !!imp?.analysis_data?.simulated_tempo && !!imp?.analysis_data?.mood; // Updated variable

  // --- HANDLER DEFINITIONS ---

  const handleRefetch = () => {
    queryClient.invalidateQueries({ queryKey: ['improvisation', id] }); // Updated query key
    queryClient.invalidateQueries({ queryKey: ['improvisations'] }); // Updated query key
  };

  const handleRegenerateArtwork = async () => {
    if (!imp || !imp.generated_name || !imp.primary_genre || !imp.analysis_data?.mood) { // Updated variable
      showError("Cannot generate artwork prompt: Core metadata (name, genre, or mood) is missing. Please set these fields first.");
      return;
    }

    setIsRegenerating(true);
    showSuccess("AI artwork prompt generation started...");

    try {
      const { error: functionError } = await supabase.functions.invoke('generate-artwork', {
        body: {
          improvisationId: imp.id, // Updated parameter name
          generatedName: imp.generated_name, // Updated variable
          primaryGenre: imp.primary_genre, // Updated variable
          secondaryGenre: imp.secondary_genre, // Updated variable
          mood: imp.analysis_data.mood, // Updated variable
        },
      });

      if (functionError) {
        throw functionError;
      }
      
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      handleRefetch();
      showSuccess("New AI artwork prompt generated successfully! Check the Assets tab.");

    } catch (error) {
      console.error('Artwork prompt generation failed:', error);
      showError(`Failed to generate artwork prompt: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsRegenerating(false);
    }
  };

  const handleMarkReady = async () => {
    if (!imp) return; // Updated variable
    setIsMarkingReady(true);

    try {
      const { error: dbError } = await supabase
        .from('improvisations') // Updated table name
        .update({ is_ready_for_release: true })
        .eq('id', imp.id); // Updated variable

      if (dbError) throw dbError;

      showSuccess("Improvisation marked as Ready for Release! Time to submit.");
      handleRefetch();
    } catch (error) {
      console.error('Failed to mark ready:', error);
      showError(`Failed to mark improvisation ready: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsMarkingReady(false);
    }
  };

  const handleDelete = async () => {
    if (!imp) return; // Updated variable

    setIsDeleting(true);
    showSuccess("Deleting improvisation...");

    try {
      // 1. Delete file from Supabase Storage (only if a file exists)
      if (imp.storage_path) { // Updated variable
        const { error: storageError } = await supabase.storage
          .from('piano_improvisations') // Updated bucket name
          .remove([imp.storage_path]); // Updated variable

        if (storageError) {
          console.error("Failed to delete file from storage:", storageError);
        }
      }
      
      // 2. Artwork is no longer directly uploaded by AI, so no need to delete from 'artwork' bucket.
      //    If manual upload is implemented later, this logic would need to be revisited.
      //    For now, we assume artwork_url is just a URL and not a path in our storage.

      // 3. Delete record from database
      const { error: dbError } = await supabase
        .from('improvisations') // Updated table name
        .delete()
        .eq('id', imp.id); // Updated variable

      if (dbError) throw dbError;

      showSuccess(`Improvisation "${imp.generated_name || imp.file_name || 'Idea'}" deleted successfully.`); // Updated variable
      queryClient.invalidateQueries({ queryKey: ['improvisations'] }); // Updated query key
      navigate('/'); // Redirect to dashboard

    } catch (error) {
      console.error('Deletion failed:', error);
      showError(`Failed to delete improvisation: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsDeleting(false);
    }
  };
  
  const handleClearFile = async () => {
    if (!imp) return; // Updated variable
    
    try {
        const { error: dbError } = await supabase
            .from('improvisations') // Updated table name
            .update({
                file_name: null,
                storage_path: null,
                status: 'uploaded',
            })
            .eq('id', imp.id); // Updated variable

        if (dbError) throw dbError;
        
        showSuccess("Audio file path cleared. Please upload a new file.");
        handleRefetch();
    } catch (error) {
        console.error('Failed to clear file path:', error);
        showError(`Failed to clear file path: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  // Handlers for Editable Fields
  const handleUpdatePrimaryGenre = (newGenre: string) => updateMutation.mutateAsync({ primary_genre: newGenre });
  const handleUpdateSecondaryGenre = (newGenre: string) => updateMutation.mutateAsync({ secondary_genre: newGenre });
  const handleUpdateIsImprovisation = (value: string) => updateMutation.mutateAsync({ is_improvisation: value === 'true' });
  const handleUpdateIsPiano = (checked: boolean) => updateMutation.mutateAsync({ is_piano: checked });
  const handleUpdateIsInstrumental = (checked: boolean) => updateMutation.mutateAsync({ is_instrumental: checked });
  const handleUpdateIsOriginalSong = (checked: boolean) => updateMutation.mutateAsync({ is_original_song: checked });
  const handleUpdateHasExplicitLyrics = (checked: boolean) => updateMutation.mutateAsync({ has_explicit_lyrics: checked });
  
  // NEW HANDLERS FOR INSIGHT TIMER FIELDS
  const handleUpdateInsightContentType = (value: string) => updateMutation.mutateAsync({ insight_content_type: value });
  const handleUpdateInsightLanguage = (value: string) => updateMutation.mutateAsync({ insight_language: value });
  const handleUpdateInsightPrimaryUse = (value: string) => updateMutation.mutateAsync({ insight_primary_use: value });
  const handleUpdateInsightAudienceLevel = (value: string) => updateMutation.mutateAsync({ insight_audience_level: value });
  const handleUpdateInsightAudienceAge = (value: string[]) => updateMutation.mutateAsync({ insight_audience_age: value });
  const handleUpdateInsightVoice = (value: string) => updateMutation.mutateAsync({ insight_voice: value });
  const handleUpdateIsMetadataConfirmed = (checked: boolean) => updateMutation.mutateAsync({ is_metadata_confirmed: checked });
  
  // Handler for nested analysis_data updates
  const handleUpdateAnalysisData = (key: keyof AnalysisData, newValue: string) => {
    const currentData = imp!.analysis_data || {}; // Updated variable
    let updatedValue: string | number = newValue;

    if (key === 'simulated_tempo') {
        updatedValue = parseInt(newValue, 10);
        if (isNaN(updatedValue)) {
            showError("Tempo must be a valid number.");
            return Promise.reject(new Error("Invalid tempo value"));
        }
    }

    const newAnalysisData = {
        ...currentData,
        [key]: updatedValue,
    };

    return updateMutation.mutateAsync({ analysis_data: newAnalysisData });
  };
  
  // --- Progress Logic (Gamification) ---
  let progressValue = 0;
  let progressMessage = "Capture your idea first.";
  let primaryAction: { label: string, onClick: () => void, variant: "default" | "secondary" | "outline" } | null = null;

  if (imp) { // Updated variable
    // Base Step: Idea Captured (10%)
    progressValue = 10;
    progressMessage = "Idea captured. Now record and upload the audio file.";
    
    // Micro-Progress: Set Type (5%)
    if (imp.is_improvisation !== null) { // Updated variable
        progressValue += 5;
    }

    // Action 1: Upload Audio
    if (!hasAudioFile) {
        primaryAction = {
            label: "Upload Audio (30% Progress Boost)",
            onClick: () => {
                document.getElementById('audio-upload-cta')?.scrollIntoView({ behavior: 'smooth' });
            },
            variant: "default"
        };
    }

    // Step 2: Audio Uploaded (30% total)
    if (hasAudioFile) {
      progressValue = 30; 
      progressMessage = "Audio uploaded. Set core metadata and notes.";
      primaryAction = null; 
    }

    // Step 3: Core Metadata Set (60% total)
    const hasNotes = imp.notes?.some(n => n.content.trim().length > 0); // Updated variable
    
    if (hasAudioFile && isCoreMetadataComplete) {
      progressValue = 60;
      progressMessage = "Core metadata set. Add creative notes and tags.";
      
      // Action 2: Add Notes
      if (!hasNotes) {
          primaryAction = {
              label: "Add Creative Notes (10% Progress Boost)",
              onClick: () => {
                  document.getElementById('improvisation-notes')?.scrollIntoView({ behavior: 'smooth' });
              },
              variant: "secondary"
          };
      }
    }
    
    // Step 4: Artwork Prompt Generated (70%)
    if (hasAudioFile && isCoreMetadataComplete && hasNotes && imp.artwork_prompt) { // Updated variable
        progressValue = 70;
        progressMessage = "Notes added. Generate artwork prompt and populate distribution fields.";
        
        // Action 3: Generate Artwork Prompt
        if (!imp.artwork_prompt) { // Updated variable
            primaryAction = {
                label: "Generate AI Artwork Prompt (10% Progress Boost)",
                onClick: handleRegenerateArtwork,
                variant: "outline"
            };
        }
    }

    // Step 5: AI Augmentation Complete (80%)
    const hasInsightTimerPopulated = (imp.insight_benefits?.length || 0) > 0 && !!imp.insight_practices; // Updated variable
    
    if (hasAudioFile && isCoreMetadataComplete && hasNotes && imp.artwork_prompt && hasInsightTimerPopulated) { // Updated variable
      progressValue = 80;
      progressMessage = "AI artwork prompt generated. Use AI to populate distribution fields.";
      
      // Action 4: AI Populate Metadata
      if (!hasInsightTimerPopulated) {
          primaryAction = {
              label: "AI Populate Distribution Metadata (10% Boost)",
              onClick: handleAIPopulateMetadata,
              variant: "default"
          };
      }
    }
    
    // Step 6: AI Augmentation Complete (90%)
    if (hasAudioFile && isCoreMetadataComplete && hasNotes && imp.artwork_prompt && hasInsightTimerPopulated) { // Updated variable
        progressValue = 90;
        progressMessage = "AI augmentation complete. Final step: Mark as Ready for Release!";
        
        // Action 5: Mark Ready
        if (!isReadyForRelease) {
            primaryAction = {
                label: "Mark as Ready for Release (10% Progress Boost)",
                onClick: handleMarkReady,
                variant: "default"
            };
        }
    }

    // Step 7: Ready for Release (100%)
    if (isReadyForRelease) {
      progressValue = 100;
      progressMessage = "Improvisation is 100% ready for release! Time to submit.";
      primaryAction = {
          label: "Go to Distribution Prep",
          onClick: () => {
              handleTabChange('analysis-distro');
          },
          variant: "default"
      };
    }
  }


  if (!id) {
    return <Navigate to="/" replace />;
  }

  if (showLoadingSpinner) {
    const loadingMessage = isAnalyzing ? "Processing file..." : "Loading improvisation details...";
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-2">{loadingMessage}</p>
      </div>
    );
  }

  // If data fetching completed but imp is null (e.g., 404 or no data found)
  if (error || !imp) { // Updated variable
    return <div className="text-center p-8 text-red-500">Error loading details or improvisation not found: {error?.message || "No data."}</div>;
  }

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-8 space-y-8">
      
      {/* 1. HEADER (Title, Metadata Dialog, Settings Sheet) */}
      <ImprovisationHeader
        imp={imp} // Updated prop name
        isCoreMetadataComplete={isCoreMetadataComplete}
        handleDelete={handleDelete}
        isDeleting={isDeleting}
        handleUpdatePrimaryGenre={handleUpdatePrimaryGenre}
        handleUpdateSecondaryGenre={handleUpdateSecondaryGenre}
        handleUpdateAnalysisData={handleUpdateAnalysisData}
        handleUpdateIsImprovisation={handleUpdateIsImprovisation}
        handleUpdateIsPiano={handleUpdateIsPiano}
        handleUpdateIsInstrumental={handleUpdateIsInstrumental}
        handleUpdateIsOriginalSong={handleUpdateIsOriginalSong}
        handleUpdateHasExplicitLyrics={handleUpdateHasExplicitLyrics}
        handleUpdateInsightContentType={handleUpdateInsightContentType}
        handleUpdateInsightLanguage={handleUpdateInsightLanguage}
        handleUpdateInsightPrimaryUse={handleUpdateInsightPrimaryUse}
        handleUpdateInsightAudienceLevel={handleUpdateInsightAudienceLevel}
        handleUpdateInsightAudienceAge={handleUpdateInsightAudienceAge}
        handleUpdateInsightVoice={handleUpdateInsightVoice}
      />
      
      {/* 2. TABS (MOVED HERE) */}
      <Tabs value={currentTab} onValueChange={handleTabChange} className="w-full mb-6">
        <TabsList className="grid w-full grid-cols-3 h-auto p-1">
          <TabsTrigger value="creative-hub" className="text-base py-2">Creative Hub</TabsTrigger>
          <TabsTrigger id="assets-tab-trigger" value="assets-downloads" className="text-base py-2">Assets & Downloads</TabsTrigger>
          <TabsTrigger id="analysis-distro-tab" value="analysis-distro" className="text-base py-2">
            Distribution Prep {isAnalyzing && <Loader2 className="h-4 w-4 ml-2 animate-spin" />}
          </TabsTrigger>
        </TabsList>
        
        {/* 3. AUDIO PLAYER (MOVED BELOW TABS) */}
        {audioPublicUrl && imp.file_name && imp.storage_path && ( // Updated variable
          <AudioPlayer 
            publicUrl={audioPublicUrl} 
            fileName={imp.file_name} // Updated variable
            storagePath={imp.storage_path} // Updated variable
            onClearFile={handleClearFile}
          />
        )}

        {/* 4. PROGRESS CARD (MOVED BELOW AUDIO PLAYER) */}
        <ImprovisationProgressCard
          progressValue={progressValue}
          progressMessage={progressMessage}
          primaryAction={primaryAction}
          isAnalyzing={isAnalyzing}
          isMarkingReady={isMarkingReady}
          isPopulating={isPopulating}
          isReadyForRelease={isReadyForRelease}
        />
        
        {/* 5. Tab Content */}
        <ImprovisationTabs
          imp={imp} // Updated prop name
          currentTab={currentTab}
          handleTabChange={handleTabChange}
          handleRefetch={handleRefetch}
          handleRegenerateArtwork={handleRegenerateArtwork}
          handleClearFile={handleClearFile}
          handleUpdatePrimaryGenre={handleUpdatePrimaryGenre}
          handleUpdateSecondaryGenre={handleUpdateSecondaryGenre}
          handleUpdateIsImprovisation={handleUpdateIsImprovisation}
          handleUpdateIsMetadataConfirmed={handleUpdateIsMetadataConfirmed}
          isAnalyzing={isAnalyzing}
          isRegenerating={isRegenerating}
          audioPublicUrl={audioPublicUrl}
          isPopulating={isPopulating}
          aiGeneratedDescription={aiGeneratedDescription}
          handleAIPopulateMetadata={handleAIPopulateMetadata}
          setAiGeneratedDescription={setAiGeneratedDescription}
        />
      </Tabs>
    </div>
  );
};

export default ImprovisationDetails;