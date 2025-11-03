import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient, queryOptions } from '@tanstack/react-query'; // Changed import to queryOptions
import { supabase, getPublicAudioUrl } from '@/integrations/supabase/client';
import { useSession } from '@/integrations/supabase/session-context';
import { MadeWithDyad } from '@/components/made-with-dyad';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Music, ArrowLeft, Upload, Trash2, Palette, Sparkles, Copy, CheckCircle, AlertTriangle, Clock, Settings, Info, RefreshCw } from 'lucide-react';
import { showSuccess, showError } from '@/utils/toast';
import { format } from 'date-fns';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import CompositionTabs from '@/components/CompositionTabs';
import { useUpdateComposition } from '@/hooks/useUpdateComposition';
import { Input } from '@/components/ui/input';
import AudioPlayer from '@/components/AudioPlayer';
import AudioUploadForIdea from '@/components/AudioUploadForIdea';
import CompositionMetadataDialog from '@/components/CompositionMetadataDialog';
import CompositionSettingsSheet from '@/components/CompositionSettingsSheet';
import EditableField from '@/components/EditableField';
import { useTitleGenerator } from '@/hooks/useTitleGenerator';
import { useAIAugmentation } from '@/hooks/useAIAugmentation';

// Define the Composition interface (must match the one in CompositionTabs.tsx and useUpdateComposition.ts)
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

const fetchCompositionDetails = async (supabaseClient: any, compositionId: string): Promise<Composition> => {
  const { data, error } = await supabaseClient
    .from('compositions')
    .select('*')
    .eq('id', compositionId)
    .single();

  if (error) throw new Error(error.message);
  return data as Composition;
};

const CompositionDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { session, isLoading: isSessionLoading } = useSession();
  const queryClient = useQueryClient();
  const { mutateAsync: updateCompositionMutation, isPending: isUpdatingComposition } = useUpdateComposition(id || '');

  const [currentTab, setCurrentTab] = useState('details');
  const [aiGeneratedDescription, setAiGeneratedDescription] = useState<string | null>(null);
  const [isDeletingComposition, setIsDeletingComposition] = useState(false);

  const compositionQueryOptions = queryOptions({
    queryKey: ['composition', id!] as const,
    queryFn: () => fetchCompositionDetails(supabase, id!),
    enabled: !!id && !isSessionLoading && !!session?.user,
    onSuccess: (data) => {
      setAiGeneratedDescription(data.ai_generated_description);
    },
    refetchInterval: (query) => {
      // Refetch every 5 seconds if status is 'analyzing', otherwise no refetch
      return query.state.data?.status === 'analyzing' ? 5000 : false;
    },
  });

  const { data: comp, isLoading, error, refetch } = useQuery(compositionQueryOptions);

  const { isPopulating, handleAIPopulateMetadata } = useAIAugmentation(id || '');

  const handleRefetch = useCallback(() => {
    refetch();
    queryClient.invalidateQueries({ queryKey: ['compositions'] });
    queryClient.invalidateQueries({ queryKey: ['compositionStatusCounts'] }); // Invalidate pipeline counts
  }, [refetch, queryClient]);

  const handleUpdateComposition = useCallback(async (updates: Partial<Composition>) => {
    if (!comp?.id) return;
    try {
      await updateCompositionMutation({ updates });
      handleRefetch();
    } catch (err) {
      console.error('Failed to update composition:', err);
      showError(`Failed to update composition: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }, [comp?.id, updateCompositionMutation, handleRefetch]);

  // --- Handlers for Editable Fields & Toggles (passed to Metadata Dialog) ---
  const handleUpdatePrimaryGenre = useCallback((value: string) => handleUpdateComposition({ primary_genre: value }), [handleUpdateComposition]);
  const handleUpdateSecondaryGenre = useCallback((value: string) => handleUpdateComposition({ secondary_genre: value }), [handleUpdateComposition]);
  const handleUpdateAnalysisData = useCallback((key: keyof Composition['analysis_data'], newValue: string) => {
    if (!comp) return Promise.resolve();
    const updatedAnalysisData = { ...comp.analysis_data, [key]: newValue };
    return handleUpdateComposition({ analysis_data: updatedAnalysisData });
  }, [comp, handleUpdateComposition]);
  const handleUpdateIsImprovisation = useCallback((value: string) => handleUpdateComposition({ is_improvisation: value === 'true' }), [handleUpdateComposition]);
  const handleUpdateIsPiano = useCallback((checked: boolean) => handleUpdateComposition({ is_piano: checked }), [handleUpdateComposition]);
  const handleUpdateIsInstrumental = useCallback((checked: boolean) => handleUpdateComposition({ is_instrumental: checked }), [handleUpdateComposition]);
  const handleUpdateIsOriginalSong = useCallback((checked: boolean) => handleUpdateComposition({ is_original_song: checked }), [handleUpdateComposition]);
  const handleUpdateHasExplicitLyrics = useCallback((checked: boolean) => handleUpdateComposition({ has_explicit_lyrics: checked }), [handleUpdateComposition]);
  const handleUpdateInsightContentType = useCallback((value: string) => handleUpdateComposition({ insight_content_type: value }), [handleUpdateComposition]);
  const handleUpdateInsightLanguage = useCallback((value: string) => handleUpdateComposition({ insight_language: value }), [handleUpdateComposition]);
  const handleUpdateInsightPrimaryUse = useCallback((value: string) => handleUpdateComposition({ insight_primary_use: value }), [handleUpdateComposition]);
  const handleUpdateInsightAudienceLevel = useCallback((value: string) => handleUpdateComposition({ insight_audience_level: value }), [handleUpdateComposition]);
  const handleUpdateInsightAudienceAge = useCallback((value: string[]) => handleUpdateComposition({ insight_audience_age: value }), [handleUpdateComposition]);
  const handleUpdateInsightVoice = useCallback((value: string) => handleUpdateComposition({ insight_voice: value }), [handleUpdateComposition]);
  const handleUpdateIsMetadataConfirmed = useCallback((checked: boolean) => handleUpdateComposition({ is_metadata_confirmed: checked }), [handleUpdateComposition]);

  // Check if core metadata for Insight Timer is complete
  const isCoreMetadataComplete = !!comp?.insight_content_type &&
                                 !!comp?.insight_language &&
                                 !!comp?.insight_primary_use &&
                                 !!comp?.insight_audience_level &&
                                 (comp?.insight_audience_age?.length || 0) > 0 &&
                                 !!comp?.insight_voice &&
                                 (comp?.insight_benefits?.length || 0) > 0 &&
                                 !!comp?.insight_practices &&
                                 (comp?.insight_themes?.length || 0) > 0 &&
                                 !!aiGeneratedDescription; // Also check if description is generated

  // --- Title Generation ---
  const handleUpdateName = (newName: string) => handleUpdateComposition({ generated_name: newName });
  const { isGenerating: isGeneratingTitle, handleRandomGenerate, handleAIGenerate } = useTitleGenerator(id || '', handleUpdateName);

  const handleClearFile = useCallback(async () => {
    if (!comp?.id || !comp.storage_path) return;

    if (!window.confirm("Are you sure you want to clear the audio file? This cannot be undone.")) {
      return;
    }

    try {
      // Delete from storage
      const { error: storageError } = await supabase.storage
        .from('piano_improvisations') // Use the correct bucket name
        .remove([comp.storage_path]);

      if (storageError) throw storageError;

      // Update database record
      await handleUpdateComposition({
        storage_path: null,
        status: 'uploaded', // Reset status to 'uploaded' (needs audio)
        file_name: null,
        generated_name: null, // Clear generated name as it's tied to the file
        artwork_url: null,
        artwork_prompt: null,
        analysis_data: null,
        user_tags: null,
        ai_generated_description: null,
        primary_genre: null,
        secondary_genre: null,
        is_ready_for_release: false,
        is_metadata_confirmed: false,
        insight_content_type: null,
        insight_language: null,
        insight_primary_use: null,
        insight_audience_level: null,
        insight_audience_age: null,
        insight_benefits: null,
        insight_practices: null,
        insight_themes: null,
        insight_voice: null,
      });

      showSuccess("Audio file cleared successfully.");
    } catch (err) {
      console.error('Error clearing file:', err);
      showError(`Failed to clear file: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }, [comp, handleUpdateComposition]);

  const handleUploadArtwork = useCallback(async (file: File) => {
    if (!comp?.id || !session?.user.id) return;

    showSuccess("Uploading artwork...");
    try {
      const fileExtension = file.name.split('.').pop();
      const filePath = `${session.user.id}/${comp.id}/artwork.${fileExtension}`; // Consistent path

      const { error: uploadError } = await supabase.storage
        .from('artwork_compositions') // Assuming a separate bucket for artwork
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: true,
        });

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from('artwork_compositions')
        .getPublicUrl(filePath);

      await handleUpdateComposition({ artwork_url: publicUrlData.publicUrl });
      showSuccess("Artwork uploaded successfully!");
    } catch (err) {
      console.error('Error uploading artwork:', err);
      showError(`Failed to upload artwork: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }, [comp, session, handleUpdateComposition]);

  const handleDeleteArtwork = useCallback(async () => {
    if (!comp?.id || !comp.artwork_url || !session?.user.id) return;

    if (!window.confirm("Are you sure you want to delete the artwork?")) {
      return;
    }

    showSuccess("Deleting artwork...");
    try {
      // Derive storage path from public URL
      const filePath = `${session.user.id}/${comp.id}/artwork.${comp.artwork_url.split('.').pop()}`;

      const { error: storageError } = await supabase.storage
        .from('artwork_compositions')
        .remove([filePath]);

      if (storageError) throw storageError;

      await handleUpdateComposition({ artwork_url: null, artwork_prompt: null });
      showSuccess("Artwork deleted successfully!");
    } catch (err) {
      console.error('Error deleting artwork:', err);
      showError(`Failed to delete artwork: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }, [comp, session, handleUpdateComposition]);

  const handleGenerateArtworkPrompt = useCallback(async () => {
    if (!comp?.id || !comp.generated_name || !comp.primary_genre || !comp.analysis_data?.mood) {
      showError("Missing composition name, primary genre, or mood to generate artwork prompt.");
      return;
    }

    showSuccess("Generating artwork prompt with AI...");
    try {
      const { data, error } = await supabase.functions.invoke('generate-artwork', {
        body: {
          improvisationId: comp.id,
          generatedName: comp.generated_name,
          primaryGenre: comp.primary_genre,
          secondaryGenre: comp.secondary_genre,
          mood: comp.analysis_data.mood,
        },
      });

      if (error) throw error;
      if (data && data.artworkPrompt) {
        await handleUpdateComposition({ artwork_prompt: data.artworkPrompt, artwork_url: null });
        showSuccess("Artwork prompt generated!");
      } else {
        showError("AI did not return an artwork prompt.");
      }
    } catch (err) {
      console.error('Error generating artwork prompt:', err);
      showError(`Failed to generate artwork prompt: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }, [comp, handleUpdateComposition]);

  const handleRegenerateArtwork = useCallback(async () => {
    showError("Artwork regeneration not yet implemented.");
  }, []);

  const handleDeleteComposition = useCallback(async () => {
    if (!comp?.id || !session?.user.id) return;

    setIsDeletingComposition(true);
    showSuccess(`Deleting composition "${comp.generated_name || 'Untitled'}"...`);

    try {
      // 1. Delete audio file from Supabase Storage (if exists)
      if (comp.storage_path) {
        const { error: storageError } = await supabase.storage
          .from('piano_improvisations')
          .remove([comp.storage_path]);
        if (storageError) console.error(`Failed to delete audio file for ${comp.id}:`, storageError);
      }
      // 2. Delete artwork from Supabase Storage (if exists)
      if (comp.artwork_url) {
        const filePath = `${session.user.id}/${comp.id}/artwork.${comp.artwork_url.split('.').pop()}`;
        const { error: artworkStorageError } = await supabase.storage
          .from('artwork_compositions')
          .remove([filePath]);
        if (artworkStorageError) console.error(`Failed to delete artwork file for ${comp.id}:`, artworkStorageError);
      }

      // 3. Delete record from database
      const { error: dbError } = await supabase
        .from('compositions')
        .delete()
        .eq('id', comp.id);
      if (dbError) throw dbError;

      showSuccess(`Composition "${comp.generated_name || 'Untitled'}" deleted successfully.`);
      queryClient.invalidateQueries({ queryKey: ['compositions'] });
      queryClient.invalidateQueries({ queryKey: ['compositionStatusCounts'] });
      navigate('/'); // Redirect to dashboard after deletion
    } catch (error) {
      console.error('Deletion failed:', error);
      showError(`Failed to delete composition: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsDeletingComposition(false);
    }
  }, [comp, session, queryClient, navigate]);


  if (isLoading || isSessionLoading) {
    return (
      <div className="text-center p-8">
        <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
        <p className="mt-4 text-muted-foreground">Loading composition details...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center p-8 text-error dark:text-error-foreground">
        Error loading composition: {error.message}
        <Button onClick={() => navigate('/')} className="mt-4">
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Dashboard
        </Button>
      </div>
    );
  }

  if (!comp) {
    return (
      <div className="text-center p-8 text-muted-foreground">
        <AlertTriangle className="h-8 w-8 mx-auto mb-4" />
        <p className="text-lg font-medium">Composition not found.</p>
        <Button onClick={() => navigate('/')} className="mt-4">
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Dashboard
        </Button>
      </div>
    );
  }

  const hasFile = !!comp.storage_path;
  const publicAudioUrl = hasFile ? getPublicAudioUrl(comp.storage_path!) : '';

  const statusBadge = () => {
    switch (comp.status) {
      case 'uploaded':
        return <span className="text-info dark:text-info-foreground">Uploaded (Needs Audio)</span>;
      case 'analyzing':
        return <span className="text-warning dark:text-warning-foreground flex items-center"><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Analyzing...</span>;
      case 'completed':
        return <span className="text-success dark:text-success-foreground">Completed</span>;
      case 'failed':
        return <span className="text-destructive dark:text-destructive-foreground">Failed</span>;
      default:
        return <span className="text-muted-foreground">Unknown</span>;
    }
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <header className="mb-8 max-w-6xl mx-auto flex justify-between items-center">
        <Button variant="ghost" onClick={() => navigate('/')}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Dashboard
        </Button>
        {/* Spacer for alignment, or could add global actions here */}
        <div></div> 
      </header>

      <main className="max-w-6xl mx-auto space-y-8">
        <Card className="shadow-card-light dark:shadow-card-dark">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-2xl font-semibold">Composition Overview</CardTitle>
            <div className="flex items-center space-x-2">
              {isUpdatingComposition && (
                <span className="flex items-center text-sm text-primary">
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving...
                </span>
              )}
              <Button variant="outline" size="sm" onClick={handleRefetch}>Refresh</Button>
              <CompositionMetadataDialog
                imp={comp}
                isPending={isUpdatingComposition}
                isCoreMetadataComplete={isCoreMetadataComplete}
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
              <CompositionSettingsSheet
                impId={comp.id}
                impName={comp.generated_name || comp.file_name || 'Untitled Idea'}
                handleDelete={handleDeleteComposition}
                isDeleting={isDeletingComposition}
              />
            </div>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Left Column: Artwork and Actions */}
            <div className="flex flex-col items-center space-y-4">
              <Avatar className="h-40 w-40 rounded-md border border-border/50 shadow-sm">
                <AvatarImage src={comp.artwork_url || undefined} alt={comp.generated_name || "Artwork"} />
                <AvatarFallback className="rounded-md bg-secondary dark:bg-accent">
                  <Palette className="h-20 w-20 text-muted-foreground" />
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col space-y-2 w-full max-w-[200px]">
                <Button variant="outline" size="sm" onClick={handleGenerateArtworkPrompt} disabled={isUpdatingComposition || !comp.generated_name || !comp.primary_genre || !comp.analysis_data?.mood}>
                  <Sparkles className="h-4 w-4 mr-2" /> Generate Artwork Prompt
                </Button>
                <Button variant="outline" size="sm" onClick={handleRegenerateArtwork} disabled={isUpdatingComposition || !comp.artwork_prompt}>
                  <Palette className="h-4 w-4 mr-2" /> Regenerate Artwork
                </Button>
                <Input
                  id="artwork-upload-input"
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
                {comp.artwork_url && (
                  <Button variant="destructive" size="sm" onClick={handleDeleteArtwork} disabled={isUpdatingComposition}>
                    <Trash2 className="h-4 w-4 mr-2" /> Delete Artwork
                  </Button>
                )}
              </div>
            </div>

            {/* Right Column: Title, Date, Status, Audio Player */}
            <div className="md:col-span-2 space-y-4">
              <div className="flex items-center space-x-2">
                <EditableField
                  value={comp.generated_name}
                  label="Composition Title"
                  onSave={handleUpdateName}
                  className="text-3xl font-bold p-0"
                  placeholder="Click to set title"
                  disabled={isGeneratingTitle || isUpdatingComposition}
                />
                <Button
                  onClick={handleRandomGenerate}
                  size="icon"
                  variant="outline"
                  title="Generate Random Title"
                  disabled={isGeneratingTitle || isUpdatingComposition}
                  className="h-8 w-8"
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
                <Button
                  onClick={handleAIGenerate}
                  size="icon"
                  variant="outline"
                  title="Generate AI Title (Based on Analysis & Notes)"
                  disabled={isGeneratingTitle || isUpdatingComposition}
                  className="h-8 w-8"
                >
                  <Sparkles className="h-4 w-4 text-purple-500" />
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">Created: {format(new Date(comp.created_at), 'MMM dd, yyyy hh:mm a')}</p>
              <p className="text-lg">Status: <span className="font-semibold">{statusBadge()}</span></p>

              {/* Audio Player / Uploader */}
              {hasFile ? (
                <AudioPlayer
                  publicUrl={publicAudioUrl}
                  fileName={comp.file_name || 'Unknown File'}
                  storagePath={comp.storage_path!}
                  onClearFile={handleClearFile}
                />
              ) : (
                <AudioUploadForIdea
                  improvisationId={comp.id}
                  isImprovisation={!!comp.is_improvisation}
                  onUploadSuccess={handleRefetch}
                />
              )}

              {comp.artwork_prompt && (
                <div className="space-y-2">
                  <h3 className="text-lg font-semibold">Artwork Prompt:</h3>
                  <p className="text-muted-foreground italic">{comp.artwork_prompt}</p>
                  <Button variant="outline" size="sm" onClick={() => navigator.clipboard.writeText(comp.artwork_prompt || '')}>
                    <Copy className="h-4 w-4 mr-2" /> Copy Prompt
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <CompositionTabs
          composition={comp}
          currentTab={currentTab}
          handleTabChange={setCurrentTab}
          handleRefetch={handleRefetch}
          handleRegenerateArtwork={handleRegenerateArtwork}
          handleClearFile={handleClearFile}
          handleGenerateArtworkPrompt={handleGenerateArtworkPrompt}
          handleUploadArtwork={handleUploadArtwork}
          handleDeleteArtwork={handleDeleteArtwork}
          handleUpdateComposition={handleUpdateComposition}
          // Pass AI Augmentation handlers
          handleAIPopulateMetadata={handleAIPopulateMetadata}
          isPopulating={isPopulating}
          aiGeneratedDescription={aiGeneratedDescription}
          setAiGeneratedDescription={setAiGeneratedDescription}
          // Pass specific update handlers for metadata dialog
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
          handleUpdateIsMetadataConfirmed={handleUpdateIsMetadataConfirmed}
          isCoreMetadataComplete={isCoreMetadataComplete}
        />
      </main>

      <MadeWithDyad />
    </div>
  );
};

export default CompositionDetails;