import React, { useEffect } from 'react';
import { useParams, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, getPublicAudioUrl as getPublicAudioUrlHelper } from '@/integrations/supabase/client';
import { Loader2, AlertTriangle, RefreshCw, ImageIcon, Music } from 'lucide-react';
import { showSuccess, showError } from '@/utils/toast';
import AudioPlayer from '@/components/AudioPlayer';
import { useUpdateImprovisation } from '@/hooks/useUpdateImprovisation';
import { useAIAugmentation } from '@/hooks/useAIAugmentation';
import ImprovisationHeader from '@/components/ImprovisationHeader';
import ImprovisationTabs from '@/components/ImprovisationTabs';
import OverviewTab from '@/components/OverviewTab';
import { computeReleaseReadiness } from '@/lib/release-readiness';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useSession } from '@/integrations/supabase/session-context';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import type { Improvisation, AnalysisData } from '@/types/improvisation';

const fetchImprovisationDetails = async (id: string): Promise<Improvisation> => {
  const { data, error } = await supabase
    .from('improvisations')
    .select('id,user_id,file_name,storage_path,status,generated_name,analysis_data,created_at,artwork_url,artwork_prompt,is_piano,primary_genre,secondary_genre,is_improvisation,notes,is_ready_for_release,show_on_portfolio,user_tags,is_instrumental,is_original_song,has_explicit_lyrics,is_metadata_confirmed,insight_content_type,insight_language,insight_primary_use,insight_audience_level,insight_audience_age,insight_benefits,insight_practices,insight_themes,insight_voice,description,is_submitted_to_distrokid,is_submitted_to_insight_timer,logic_project_path,original_name,nas_folder_path,workflow_mode,video_path,template_used,sound_choice')
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
  const { session, isLoading: isSessionLoading } = useSession();
  const [isRegenerating, setIsRegenerating] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [isMarkingReady, setIsMarkingReady] = React.useState(false);
  const [isDraggingArtwork, setIsDraggingArtwork] = React.useState(false);
  const [isUploadingArtwork, setIsUploadingArtwork] = React.useState(false);
  const [isDraggingAudio, setIsDraggingAudio] = React.useState(false);
  const [isUploadingAudio, setIsUploadingAudio] = React.useState(false);

  // --- Tab State Management using URL Query Params ---
  const query = new URLSearchParams(location.search);
  const currentTab = query.get('tab') || 'overview';

  const handleTabChange = (newTab: string) => {
    navigate(`?tab=${newTab}`, { replace: true });
  };
  // --- End Tab State Management ---

  const { data: imp, isLoading, error } = useQuery<Improvisation>({
    queryKey: ['improvisation', id],
    queryFn: () => fetchImprovisationDetails(id!),
    enabled: !!id && !isSessionLoading && !!session?.user?.id,
    refetchInterval: (query) => {
      const data = query.state.data as Improvisation | undefined;
      // Only poll while analyzing
      return data?.status === 'analyzing' ? 5000 : false;
    },
  });

  const updateMutation = useUpdateImprovisation(id!);
  const { isPopulating, aiGeneratedDescription, handleAIPopulateMetadata, setAiGeneratedDescription } = useAIAugmentation(id!);
  
  // Determine if we are loading the initial data OR if the status is actively analyzing
  const isAnalyzing = imp?.status === 'analyzing';
  const showLoadingSpinner = isLoading || isSessionLoading || isAnalyzing;
  
  // Get public URL for the audio file
  const audioPublicUrl = getPublicAudioUrl(imp?.storage_path || null);

  const isCoreMetadataComplete = !!imp?.primary_genre && !!imp?.analysis_data?.simulated_key && !!imp?.analysis_data?.simulated_tempo && !!imp?.analysis_data?.mood;

  // --- HANDLER DEFINITIONS ---

  useEffect(() => {
    document.title = `${imp?.generated_name || 'Improvisation'} - AI Composer Hub`;
  }, [imp?.generated_name]);

  const handleRefetch = () => {
    queryClient.invalidateQueries({ queryKey: ['improvisation', id] });
    queryClient.invalidateQueries({ queryKey: ['improvisations'] });
  };

  const handleRegenerateArtwork = async () => {
    if (!imp || !imp.generated_name) {
      showError("Cannot generate artwork prompt: a title is required.");
      return;
    }

    setIsRegenerating(true);
    showSuccess("AI artwork prompt generation started...");

    try {
      const { data, error: functionError } = await supabase.functions.invoke('generate-art-prompt', {
        body: {
          improvisationId: imp.id,
          mode: 'metadata',
        },
      });

      if (functionError) {
        throw functionError;
      }
      if (data?.error) {
        throw new Error(data.error);
      }

      await handleRefetch();
      showSuccess(
        data?.source === 'fallback'
          ? "Artwork prompt generated (offline fallback used). Check the Assets tab."
          : "New AI artwork prompt generated successfully! Check the Assets tab.",
      );

    } catch (error) {
      console.error('Artwork prompt generation failed:', error);
      showError(`Failed to generate artwork prompt: ${error instanceof Error ? error.message : 'Unknown error'}`);
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

      showSuccess("Improvisation marked as Ready for Release! Time to submit.");
      handleRefetch();
    } catch (error) {
      console.error('Failed to mark ready:', error);
      showError(`Failed to mark improvisation ready: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsMarkingReady(false);
    }
  };

  // --- Drag-and-drop artwork upload ---
  const handleArtworkDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingArtwork(false);
    const file = e.dataTransfer.files?.[0];
    if (!file || !session?.user || !imp?.id) return;
    const accepted = ['image/jpeg', 'image/png'];
    if (!accepted.includes(file.type)) {
      showError('Drop a JPG or PNG image');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      showError('Image must be under 20 MB');
      return;
    }
    setIsUploadingArtwork(true);
    try {
      const { upscaleToMinSize, toSquareExport, RELEASE_EXPORT_SIZE } = await import('@/lib/image-compliance');
      const bucketName = 'piano_improvisations';
      const user = session.user;
      let blobToUpload: Blob = file;
      let uploadPath = `${user.id}/artwork/${imp.id}.${file.name.split('.').pop() || 'jpg'}`;
      try {
        blobToUpload = await toSquareExport(file, RELEASE_EXPORT_SIZE);
        uploadPath = `${user.id}/artwork/${imp.id}.jpg`;
      } catch {
        // upload as-is
      }
      const { error: uploadError } = await supabase.storage
        .from(bucketName)
        .upload(uploadPath, blobToUpload, { cacheControl: '3600', upsert: true });
      if (uploadError) throw uploadError;
      const { data: publicUrlData } = supabase.storage.from(bucketName).getPublicUrl(uploadPath);
      const newUrl = publicUrlData.publicUrl;
      const { error: dbError } = await supabase
        .from('improvisations')
        .update({ artwork_url: newUrl })
        .eq('id', imp.id);
      if (dbError) throw dbError;
      showSuccess('Artwork uploaded');
      handleRefetch();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setIsUploadingArtwork(false);
    }
  };

  // --- Drag-and-drop audio upload ---
  const handleAudioDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingAudio(false);
    const file = e.dataTransfer.files?.[0];
    if (!file || !session?.user || !imp?.id) return;
    const acceptedExtensions = ['.mp3', '.m4a'];
    const ext = '.' + (file.name.split('.').pop() || '').toLowerCase();
    if (!acceptedExtensions.includes(ext)) {
      showError('Drop an MP3 or M4A audio file');
      return;
    }
    if (file.size > 250 * 1024 * 1024) {
      showError('Audio must be under 250 MB');
      return;
    }
    // Confirm overwrite if audio already exists
    if (imp.storage_path) {
      const ok = window.confirm('This song already has audio. Replace it?');
      if (!ok) return;
    }
    setIsUploadingAudio(true);
    try {
      const user = session.user;
      const fileExtension = file.name.split('.').pop();
      const filePath = `${user.id}/${Date.now()}.${fileExtension}`;
      const bucketName = 'piano_improvisations';
      const { error: uploadError } = await supabase.storage
        .from(bucketName)
        .upload(filePath, file, { cacheControl: '3600', upsert: false });
      if (uploadError) throw uploadError;
      const { error: dbError } = await supabase
        .from('improvisations')
        .update({
          file_name: file.name,
          storage_path: filePath,
          status: 'analyzing',
        })
        .eq('id', imp.id);
      if (dbError) {
        await supabase.storage.from(bucketName).remove([filePath]);
        throw dbError;
      }
      const { error: functionError } = await supabase.functions.invoke('analyze-improvisation', {
        body: {
          improvisationId: imp.id,
          storagePath: filePath,
          fileName: file.name,
          isImprovisation: imp.is_improvisation,
        },
      });
      if (functionError) {
        logError('AudioUpload.analyze', functionError);
        showError('File uploaded, but failed to start background processing.');
      } else {
        showSuccess('Audio uploaded and processing started!');
      }
      handleRefetch();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setIsUploadingAudio(false);
    }
  };

  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = React.useState(false);

  const handleDelete = async () => {
    if (!imp) return;

    setIsDeleting(true);
    showSuccess("Deleting improvisation...");
    setIsDeleteDialogOpen(false);

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
      
      // 2. Artwork is no longer directly uploaded by AI, so no need to delete from 'artwork' bucket.
      //    If manual upload is implemented later, this logic would need to be revisited.
      //    For now, we assume artwork_url is just a URL and not a path in our storage.

      // 3. Delete record from database
      const { error: dbError } = await supabase
        .from('improvisations')
        .delete()
        .eq('id', imp.id);

      if (dbError) throw dbError;

      showSuccess(`Improvisation "${imp.generated_name || imp.file_name || 'Idea'}" deleted successfully.`);
      queryClient.invalidateQueries({ queryKey: ['improvisations'] });
      navigate('/composer'); // Redirect to Composer workspace

    } catch (error) {
      console.error('Deletion failed:', error);
      showError(`Failed to delete improvisation: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
  
  const handleUpdateInsightContentType = (value: string) => updateMutation.mutateAsync({ insight_content_type: value });
  const handleUpdateInsightLanguage = (value: string) => updateMutation.mutateAsync({ insight_language: value });
  const handleUpdateInsightPrimaryUse = (value: string) => updateMutation.mutateAsync({ insight_primary_use: value });
  const handleUpdateInsightAudienceLevel = (value: string) => updateMutation.mutateAsync({ insight_audience_level: value });
  const handleUpdateInsightAudienceAge = (value: string[]) => updateMutation.mutateAsync({ insight_audience_age: value });
  const handleUpdateInsightBenefits = (value: string[]) => updateMutation.mutateAsync({ insight_benefits: value });
  const handleUpdateInsightPractices = (value: string) => updateMutation.mutateAsync({ insight_practices: value });
  const handleUpdateInsightThemes = (value: string[]) => updateMutation.mutateAsync({ insight_themes: value });
  const handleUpdateInsightVoice = (value: string) => updateMutation.mutateAsync({ insight_voice: value });
  const handleUpdateIsMetadataConfirmed = (checked: boolean) => updateMutation.mutateAsync({ is_metadata_confirmed: checked });
  const handleUpdateDescription = (value: string) => updateMutation.mutateAsync({ description: value });
  
  const handleUpdateIsSubmittedToDistroKid = (checked: boolean) => updateMutation.mutateAsync({ is_submitted_to_distrokid: checked });
  const handleUpdateIsSubmittedToInsightTimer = (checked: boolean) => updateMutation.mutateAsync({ is_submitted_to_insight_timer: checked });

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
  
  // --- Progress Logic ---
  // One source of truth, shared with the Overview tab and every other surface
  // that used to invent its own answer. See src/lib/release-readiness.ts.
  const readiness = imp ? computeReleaseReadiness(imp) : null;

  if (!id) {
    return <Navigate to="/" replace />;
  }

  if (showLoadingSpinner) {
    return (
      <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-8">
        <div className="flex items-center space-x-4">
          <Skeleton className="h-8 w-8 rounded-full" />
          <div className="space-y-2 flex-grow">
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-4 w-1/3" />
          </div>
        </div>
        <Skeleton className="h-24 w-full rounded-lg" />
        <div className="flex space-x-2">
          <Skeleton className="h-10 flex-1 rounded-md" />
          <Skeleton className="h-10 flex-1 rounded-md" />
          <Skeleton className="h-10 flex-1 rounded-md" />
        </div>
        <Skeleton className="h-48 w-full rounded-lg" />
      </div>
    );
  }

  // If data fetching completed but imp is null (e.g., 404 or no data found)
  if (error || !imp) {
    return (
      <div className="max-w-7xl mx-auto p-4 md:p-8">
        <div className="text-center p-12">
          <AlertTriangle className="h-16 w-16 mx-auto mb-4 text-destructive" />
          <h2 className="text-2xl font-bold mb-2">Improvisation not found</h2>
          <p className="text-muted-foreground mb-6">{error?.message || "The improvisation you're looking for doesn't exist or has been deleted."}</p>
          <Button asChild>
            <a href="/composer">Return to Composer</a>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="max-w-7xl mx-auto p-4 md:p-8 space-y-8 relative"
      onDragOver={(e) => {
        e.preventDefault();
        const file = e.dataTransfer.files?.[0];
        if (file?.type.startsWith('image/')) setIsDraggingArtwork(true);
        else if (file?.type.startsWith('audio/') || file?.name.match(/\.(mp3|m4a)$/i)) setIsDraggingAudio(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        setIsDraggingArtwork(false);
        setIsDraggingAudio(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setIsDraggingArtwork(false);
        setIsDraggingAudio(false);
        const file = e.dataTransfer.files?.[0];
        if (!file) return;
        if (file.type.startsWith('image/')) handleArtworkDrop(e);
        else if (file.type.startsWith('audio/') || file.name.match(/\.(mp3|m4a)$/i)) handleAudioDrop(e);
      }}
    >
      {isDraggingArtwork && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary/10 backdrop-blur-sm border-4 border-dashed border-primary rounded-lg pointer-events-none">
          <div className="text-center">
            <ImageIcon className="h-16 w-16 mx-auto mb-2 text-primary" />
            <p className="text-lg font-semibold text-primary">Drop artwork here</p>
            <p className="text-sm text-muted-foreground">JPG or PNG, max 20 MB</p>
          </div>
        </div>
      )}
      {isDraggingAudio && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-emerald-500/10 backdrop-blur-sm border-4 border-dashed border-emerald-500 rounded-lg pointer-events-none">
          <div className="text-center">
            <Music className="h-16 w-16 mx-auto mb-2 text-emerald-500" />
            <p className="text-lg font-semibold text-emerald-600">Drop audio here</p>
            <p className="text-sm text-muted-foreground">MP3 or M4A, max 250 MB</p>
          </div>
        </div>
      )}
      {isUploadingArtwork && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <span className="text-sm font-medium">Uploading artwork…</span>
          </div>
        </div>
      )}
      {isUploadingAudio && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <Loader2 className="h-6 w-6 animate-spin text-emerald-500" />
            <span className="text-sm font-medium">Uploading audio…</span>
          </div>
        </div>
      )}
      
      {/* 1. HEADER (Title, Metadata Dialog, Settings Sheet) */}
      <ImprovisationHeader
        imp={imp}
        isCoreMetadataComplete={isCoreMetadataComplete}
        handleDelete={handleDelete}
        isDeleting={isDeleting}
        handleUpdatePrimaryGenre={handleUpdatePrimaryGenre}
        handleUpdateSecondaryGenre={handleUpdateSecondaryGenre}
        handleUpdateAnalysisData={handleUpdateAnalysisData}
        handleUpdateIsImprovisation={handleUpdateIsImprovisation}
      />
      
      {/* 2. TABS */}
      <Tabs value={currentTab} onValueChange={handleTabChange} className="w-full mb-6">
        <TabsList className="flex w-full h-auto p-1 overflow-x-auto md:grid md:grid-cols-5">
          <TabsTrigger value="overview" className="text-base py-2">Overview</TabsTrigger>
          <TabsTrigger value="creative-hub" className="text-base py-2">Creative Hub</TabsTrigger>
          <TabsTrigger id="assets-tab-trigger" value="assets-downloads" className="text-base py-2">Assets & Downloads</TabsTrigger>
          <TabsTrigger id="analysis-distro-tab" value="analysis-distro" className="text-base py-2">
            Distribution Prep {isAnalyzing && <Loader2 className="h-4 w-4 ml-2 animate-spin" />}
          </TabsTrigger>
          <TabsTrigger id="social-tab-trigger" value="social" className="text-base py-2">Social</TabsTrigger>
        </TabsList>

        {/* 3. AUDIO PLAYER — available on every tab, so it lives above them */}
        {audioPublicUrl && imp.file_name && imp.storage_path && (
          <AudioPlayer 
            publicUrl={audioPublicUrl} 
            fileName={imp.file_name}
            storagePath={imp.storage_path}
            onClearFile={handleClearFile}
          />
        )}

        {/* 4. Tab Content */}
        {readiness && currentTab === 'overview' && (
          <OverviewTab
            imp={imp}
            readiness={readiness}
            isAnalyzing={isAnalyzing}
            onOpenTab={handleTabChange}
            onMarkReady={handleMarkReady}
            isMarkingReady={isMarkingReady}
          />
        )}
        <ImprovisationTabs
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
          handleUpdateIsSubmittedToDistroKid={handleUpdateIsSubmittedToDistroKid}
          handleUpdateIsSubmittedToInsightTimer={handleUpdateIsSubmittedToInsightTimer}
          isAnalyzing={isAnalyzing}
          isRegenerating={isRegenerating}
          audioPublicUrl={audioPublicUrl}
          isPopulating={isPopulating}
          aiGeneratedDescription={aiGeneratedDescription}
          handleAIPopulateMetadata={handleAIPopulateMetadata}
          setAiGeneratedDescription={setAiGeneratedDescription}
          isPending={updateMutation.isPending}
          readiness={readiness}
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
          handleUpdateIsPiano={handleUpdateIsPiano}
          handleUpdateIsInstrumental={handleUpdateIsInstrumental}
          handleUpdateIsOriginalSong={handleUpdateIsOriginalSong}
          handleUpdateHasExplicitLyrics={handleUpdateHasExplicitLyrics}
        />
      </Tabs>
    </div>
  );
};

export default ImprovisationDetails;