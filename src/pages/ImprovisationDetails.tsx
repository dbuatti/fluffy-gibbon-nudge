import React from 'react';
import { useParams, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, getPublicAudioUrl as getPublicAudioUrlHelper } from '@/integrations/supabase/client';
import { Loader2, Music } from 'lucide-react';
import { showSuccess, showError } from '@/utils/toast';
import AudioPlayer from '@/components/AudioPlayer';
import { useUpdateImprovisation } from '@/hooks/useUpdateImprovisation';
import { useAIAugmentation } from '@/hooks/useAIAugmentation';
import CompositionHeader from '@/components/CompositionHeader';
import CompositionProgressCard from '@/components/CompositionProgressCard';
import CompositionTabs from '@/components/CompositionTabs';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'; // Import Tabs components

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

const fetchImprovisationDetails = async (id: string): Promise<Improvisation> => {
  const { data, error } = await supabase
    .from('improvisations')
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


const ImprovisationDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
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

  const { data: imp, isLoading, error } = useQuery<Improvisation>({
    queryKey: ['improvisation', id],
    queryFn: () => fetchImprovisationDetails(id!),
    enabled: !!id,
    refetchInterval: 5000,
  });

  const updateMutation = useUpdateImprovisation(id!);
  const { isPopulating, aiGeneratedDescription, handleAIPopulateMetadata, setAiGeneratedDescription } = useAIAugmentation(id!);
  
  // Determine if we are loading the initial data OR if the status is actively analyzing
  const isAnalyzing = imp?.status === 'analyzing';
  const showLoadingSpinner = isLoading || isAnalyzing;
  const hasAudioFile = !!imp?.storage_path;
  const isReadyForRelease = imp?.is_ready_for_release;
  
  // Get public URL for the audio file
  const audioPublicUrl = getPublicAudioUrl(imp?.storage_path || null);

  // NEW: Core Metadata Completion Check
  const isCoreMetadataComplete = !!imp?.primary_genre && !!imp?.analysis_data?.simulated_key && !!imp?.analysis_data?.simulated_tempo && !!imp?.analysis_data?.mood;

  // --- HANDLER DEFINITIONS ---

  const handleRefetch = () => {
    queryClient.invalidateQueries({ queryKey: ['improvisation', id] });
    queryClient.invalidateQueries({ queryKey: ['improvisations'] });
  };

  const handleRegenerateArtwork = async () => {
    if (!imp || !imp.generated_name || !imp.primary_genre || !imp.analysis_data?.mood) {
      showError("Cannot regenerate artwork prompt: Core metadata (name, genre, or mood) is missing. Please set these fields first.");
      return;
    }

    setIsRegenerating(true);
    showSuccess("Artwork prompt regeneration started...");

    try {
      const { error: functionError } = await supabase.functions.invoke('generate-artwork', {
        body: {
          improvisationId: imp.id,
          generatedName: imp.generated_name,
          primaryGenre: imp.primary_genre,
          secondaryGenre: imp.secondary_genre,
          mood: imp.analysis_data.mood,
        },
      });

      if (functionError) {
        throw functionError;
      }
      
      await new Promise(resolve => setTimeout(resolve, 1500)); 
      
      handleRefetch();
      showSuccess("New artwork prompt generated successfully! Check the Assets tab.");

    } catch (error) {
      console.error('Regeneration failed:', error);
      showError(`Failed to regenerate artwork prompt: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsRegenerating(false);
    }
  };

  const handleMarkReady = async () => {
    if (!imp) return;
    setIsMarkingReady(true);

    try {
      const { error: dbError } = await supabase
        .from('improvisations')
        .update({ is_ready_for_release: true })
        .eq('id', imp.id);

      if (dbError) throw dbError;

      showSuccess("Composition marked as Ready for Release! Time to submit.");
      handleRefetch();
    } catch (error) {
      console.error('Failed to mark ready:', error);
      showError(`Failed to mark composition ready: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsMarkingReady(false);
    }
  };

  const handleDelete = async () => {
    if (!imp) return;

    setIsDeleting(true);
    showSuccess("Deleting composition...");

    try {
      // 1. Delete file from Supabase Storage (only if a file exists)
      if (imp.storage_path) {
        const { error: storageError } = await supabase.storage
          .from('piano_improvisations')
          .remove([imp.storage_path]);

        if (storageError) {
          console.error("Failed to delete file from storage:", storageError);
        }
      }

      // 2. Delete record from database
      const { error: dbError } = await supabase
        .from('improvisations')
        .delete()
        .eq('id', imp.id);

      if (dbError) throw dbError;

      showSuccess(`Composition "${imp.generated_name || imp.file_name || 'Idea'}" deleted successfully.`);
      queryClient.invalidateQueries({ queryKey: ['improvisations'] });
      navigate('/'); // Redirect to dashboard

    } catch (error) {
      console.error('Deletion failed:', error);
      showError(`Failed to delete composition: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsDeleting(false);
    }
  };
  
  const handleClearFile = async () => {
    if (!imp) return;
    
    try {
        const { error: dbError } = await supabase
            .from('improvisations')
            .update({
                file_name: null,
                storage_path: null,
                status: 'uploaded',
            })
            .eq('id', imp.id);

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
    const currentData = imp!.analysis_data || {};
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

  if (imp) {
    // Base Step: Idea Captured (10%)
    progressValue = 10;
    progressMessage = "Idea captured. Now record and upload the audio file.";
    
    // Micro-Progress: Set Type (5%)
    if (imp.is_improvisation !== null) {
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
    const hasNotes = imp.notes?.some(n => n.content.trim().length > 0);
    
    if (hasAudioFile && isCoreMetadataComplete) {
      progressValue = 60;
      progressMessage = "Core metadata set. Add creative notes and tags.";
      
      // Action 2: Add Notes
      if (!hasNotes) {
          primaryAction = {
              label: "Add Creative Notes (10% Progress Boost)",
              onClick: () => {
                  document.getElementById('composition-notes')?.scrollIntoView({ behavior: 'smooth' });
              },
              variant: "secondary"
          };
      }
    }
    
    // Step 4: Notes Added (70%)
    if (hasAudioFile && isCoreMetadataComplete && hasNotes) {
        progressValue = 70;
        progressMessage = "Notes added. Generate artwork prompt and populate distribution fields.";
        
        // Action 3: Generate Artwork Prompt
        if (!imp.artwork_prompt) {
            primaryAction = {
                label: "Generate Artwork Prompt (10% Progress Boost)",
                onClick: handleRegenerateArtwork,
                variant: "outline"
            };
        }
    }

    // Step 5: Artwork Prompt Generated (80%)
    const hasInsightTimerPopulated = (imp.insight_benefits?.length || 0) > 0 && !!imp.insight_practices;
    
    if (hasAudioFile && isCoreMetadataComplete && hasNotes && imp.artwork_prompt) {
      progressValue = 80;
      progressMessage = "Artwork prompt generated. Use AI to populate distribution fields.";
      
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
    if (hasAudioFile && isCoreMetadataComplete && hasNotes && imp.artwork_prompt && hasInsightTimerPopulated) {
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
      progressMessage = "Composition is 100% ready for release! Time to submit.";
      primaryAction = {
          label: "Go to Distribution Prep",
          onClick: () => {
              handleTabChange('analysis-distro');
          },
          variant: "default"
      };
    }
  }
  // --- End Progress Logic ---


  if (!id) {
    return <Navigate to="/" replace />;
  }

  if (showLoadingSpinner) {
    const loadingMessage = isAnalyzing ? "Processing file..." : "Loading composition details...";
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-2">{loadingMessage}</p>
      </div>
    );
  }

  if (error) {
    return <div className="text-center p-8 text-red-500">Error loading details: {error.message}</div>;
  }

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-8 space-y-8">
      
      {/* 1. HEADER (Title, Metadata Dialog, Settings Sheet) */}
      <CompositionHeader
        imp={imp}
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
      <Tabs value={currentTab} onValueChange={handleTabChange} className="w-full mb-6"> {/* Added mb-6 here */}
        <TabsList className="grid w-full grid-cols-3 h-auto p-1">
          <TabsTrigger value="creative-hub" className="text-base py-2">Creative Hub</TabsTrigger>
          <TabsTrigger id="assets-tab-trigger" value="assets-downloads" className="text-base py-2">Assets & Downloads</TabsTrigger>
          <TabsTrigger id="analysis-distro-tab" value="analysis-distro" className="text-base py-2">
            Distribution Prep {isAnalyzing && <Loader2 className="h-4 w-4 ml-2 animate-spin" />}
          </TabsTrigger>
        </TabsList>
        
        {/* 3. AUDIO PLAYER (MOVED BELOW TABS) */}
        {audioPublicUrl && imp.file_name && imp.storage_path && (
          <AudioPlayer 
            publicUrl={audioPublicUrl} 
            fileName={imp.file_name} 
            storagePath={imp.storage_path} 
            onClearFile={handleClearFile}
          />
        )}

        {/* 4. PROGRESS CARD (MOVED BELOW AUDIO PLAYER) */}
        <CompositionProgressCard
          progressValue={progressValue}
          progressMessage={progressMessage}
          primaryAction={primaryAction}
          isAnalyzing={isAnalyzing}
          isMarkingReady={isMarkingReady}
          isPopulating={isPopulating}
          isReadyForRelease={isReadyForRelease}
        />
        
        {/* 5. Tab Content */}
        <CompositionTabs
          imp={imp}
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