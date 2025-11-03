import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient, UseQueryResult, UseQueryOptions } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSession } from '@/integrations/supabase/session-context';
import { MadeWithDyad } from '@/components/made-with-dyad';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Music, ArrowLeft, Upload, Trash2, Palette, Sparkles, Copy, CheckCircle, AlertTriangle, Clock } from 'lucide-react';
import { showSuccess, showError } from '@/utils/toast';
import { format } from 'date-fns';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import CompositionTabs from '@/components/CompositionTabs';
import { useUpdateComposition } from '@/hooks/useUpdateComposition'; // FIX: Corrected import path
import { Input } from '@/components/ui/input';

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
  analysis_data: { mood?: string; [key: string]: any } | null;
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
  const { mutateAsync: updateCompositionMutation } = useUpdateComposition(id || '');

  const [currentTab, setCurrentTab] = useState('details');
  const [aiGeneratedDescription, setAiGeneratedDescription] = useState<string | null>(null);

  // FIX: Explicitly define queryOptions to correctly type onSuccess
  const queryOptions: UseQueryOptions<Composition, Error, Composition, readonly ['composition', string | undefined]> = {
    queryKey: ['composition', id],
    queryFn: () => fetchCompositionDetails(supabase, id!),
    enabled: !!id && !isSessionLoading && !!session?.user,
    onSuccess: (data) => {
      setAiGeneratedDescription(data.ai_generated_description);
    },
  };

  const { data: comp, isLoading, error, refetch }: UseQueryResult<Composition, Error> = useQuery(queryOptions);

  const handleRefetch = useCallback(() => {
    refetch();
    queryClient.invalidateQueries({ queryKey: ['compositions'] });
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

  const handleClearFile = useCallback(async () => {
    if (!comp?.id || !comp.storage_path) return;

    if (!window.confirm("Are you sure you want to clear the audio file? This cannot be undone.")) {
      return;
    }

    try {
      // Delete from storage
      const { error: storageError } = await supabase.storage
        .from('audio_compositions') // Updated bucket name
        .remove([comp.storage_path]);

      if (storageError) throw storageError;

      // Update database record
      await handleUpdateComposition({
        storage_path: null,
        status: 'uploaded', // Reset status to 'uploaded' (needs audio)
        file_name: null,
        generated_name: null,
        artwork_url: null,
        artwork_prompt: null,
        analysis_data: null,
        user_tags: null,
        ai_generated_description: null,
        primary_genre: null,
        secondary_genre: null,
        // mood: null, // Assuming mood is directly on composition or part of analysis_data
      });

      showSuccess("Audio file cleared successfully.");
    } catch (err) {
      console.error('Error clearing file:', err);
      showError(`Failed to clear file: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }, [comp, handleUpdateComposition]);

  const handleUploadArtwork = useCallback(async (file: File) => {
    if (!comp?.id) return;

    showSuccess("Uploading artwork...");
    try {
      const fileExtension = file.name.split('.').pop();
      const filePath = `${comp.user_id}/${comp.id}/artwork.${fileExtension}`;

      const { data, error: uploadError } = await supabase.storage
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
  }, [comp, handleUpdateComposition]);

  const handleDeleteArtwork = useCallback(async () => {
    if (!comp?.id || !comp.artwork_url) return;

    if (!window.confirm("Are you sure you want to delete the artwork?")) {
      return;
    }

    showSuccess("Deleting artwork...");
    try {
      // Assuming artwork_url is a public URL and we need to derive the path
      const urlParts = comp.artwork_url.split('/');
      const filePath = urlParts.slice(urlParts.indexOf('artwork_compositions') + 1).join('/');

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
  }, [comp, handleUpdateComposition]);

  const handleGenerateArtworkPrompt = useCallback(async () => {
    if (!comp?.id || !comp.generated_name || !comp.primary_genre || !comp.analysis_data?.mood) {
      showError("Missing composition name, primary genre, or mood to generate artwork prompt.");
      return;
    }

    showSuccess("Generating artwork prompt with AI...");
    try {
      const { data, error } = await supabase.functions.invoke('generate-artwork', {
        body: JSON.stringify({
          compositionId: comp.id,
          generatedName: comp.generated_name,
          primaryGenre: comp.primary_genre,
          secondaryGenre: comp.secondary_genre,
          mood: comp.analysis_data.mood,
        }),
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
    // This function would typically call an external AI image generation service
    // and then update the artwork_url. For now, it's a placeholder.
    showError("Artwork regeneration not yet implemented.");
    // Example:
    // const imageUrl = await callDallEApi(comp.artwork_prompt);
    // await handleUpdateComposition({ artwork_url: imageUrl });
  }, []);

  const handleGenerateName = useCallback(async () => {
    if (!comp?.id) return;
    showError("Name generation not yet implemented.");
  }, [comp]);

  const handleGenerateDescription = useCallback(async () => {
    if (!comp?.id || !comp.generated_name || !comp.primary_genre) {
      showError("Missing composition name or primary genre to generate description.");
      return;
    }
    showSuccess("Generating description with AI...");
    try {
      const { data, error } = await supabase.functions.invoke('generate-description', {
        body: JSON.stringify({
          compositionId: comp.id,
          generatedName: comp.generated_name,
          primaryGenre: comp.primary_genre,
          secondaryGenre: comp.secondary_genre,
          mood: comp.analysis_data?.mood,
          userTags: comp.user_tags,
        }),
      });

      if (error) throw error;
      if (data && data.description) {
        setAiGeneratedDescription(data.description);
        await handleUpdateComposition({ ai_generated_description: data.description });
        showSuccess("Description generated!");
      } else {
        showError("AI did not return a description.");
      }
    } catch (err) {
      console.error('Error generating description:', err);
      showError(`Failed to generate description: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }, [comp, handleUpdateComposition]);

  const handleGenerateMood = useCallback(async () => {
    if (!comp?.id) return;
    showError("Mood generation not yet implemented.");
  }, [comp]);

  const handleGeneratePrimaryGenre = useCallback(async () => {
    if (!comp?.id) return;
    showError("Primary genre generation not yet implemented.");
  }, [comp]);

  const handleGenerateSecondaryGenre = useCallback(async () => {
    if (!comp?.id) return;
    showError("Secondary genre generation not yet implemented.");
  }, [comp]);

  const handleGenerateIsInstrumental = useCallback(async () => {
    if (!comp?.id) return;
    showError("Is Instrumental generation not yet implemented.");
  }, [comp]);

  const handleGenerateIsOriginalSong = useCallback(async () => {
    if (!comp?.id) return;
    showError("Is Original Song generation not yet implemented.");
  }, [comp]);

  const handleGenerateHasExplicitLyrics = useCallback(async () => {
    if (!comp?.id) return;
    showError("Has Explicit Lyrics generation not yet implemented.");
  }, [comp]);

  const handleGenerateIsOriginalSongConfirmed = useCallback(async () => {
    if (!comp?.id) return;
    showError("Is Original Song Confirmed generation not yet implemented.");
  }, [comp]);

  const handleGenerateIsMetadataConfirmed = useCallback(async () => {
    if (!comp?.id) return;
    showError("Is Metadata Confirmed generation not yet implemented.");
  }, [comp]);

  const handleGenerateInsightContentType = useCallback(async () => {
    if (!comp?.id) return;
    showError("Insight Content Type generation not yet implemented.");
  }, [comp]);

  const handleGenerateInsightLanguage = useCallback(async () => {
    if (!comp?.id) return;
    showError("Insight Language generation not yet implemented.");
  }, [comp]);

  const handleGenerateInsightPrimaryUse = useCallback(async () => {
    if (!comp?.id) return;
    showError("Insight Primary Use generation not yet implemented.");
  }, [comp]);

  const handleGenerateInsightAudienceLevel = useCallback(async () => {
    if (!comp?.id) return;
    showError("Insight Audience Level generation not yet implemented.");
  }, [comp]);

  const handleGenerateInsightAudienceAge = useCallback(async () => {
    if (!comp?.id) return;
    showError("Insight Audience Age generation not yet implemented.");
  }, [comp]);

  const handleGenerateInsightBenefits = useCallback(async () => {
    if (!comp?.id) return;
    showError("Insight Benefits generation not yet implemented.");
  }, [comp]);

  const handleGenerateInsightPractices = useCallback(async () => {
    if (!comp?.id) return;
    showError("Insight Practices generation not yet implemented.");
  }, [comp]);

  const handleGenerateInsightThemes = useCallback(async () => {
    if (!comp?.id) return;
    showError("Insight Themes generation not yet implemented.");
  }, [comp]);

  const handleGenerateInsightVoice = useCallback(async () => {
    if (!comp?.id) return;
    showError("Insight Voice generation not yet implemented.");
  }, [comp]);


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
        <Button onClick={() => navigate('/dashboard')} className="mt-4">
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
        <Button onClick={() => navigate('/dashboard')} className="mt-4">
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Dashboard
        </Button>
      </div>
    );
  }

  const hasFile = !!comp.storage_path;
  const isAnalyzing = comp.status === 'analyzing';
  const isCompleted = comp.status === 'completed';
  const isFailed = comp.status === 'failed';

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <header className="mb-8 max-w-6xl mx-auto flex justify-between items-center">
        <Button variant="ghost" onClick={() => navigate('/dashboard')}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Dashboard
        </Button>
        <h1 className="text-4xl font-bold tracking-tight text-foreground">
          {comp.generated_name || comp.file_name || 'Untitled Composition'}
        </h1>
        <div></div> {/* Spacer for alignment */}
      </header>

      <main className="max-w-6xl mx-auto space-y-8">
        <Card className="shadow-card-light dark:shadow-card-dark">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-2xl font-semibold">Composition Overview</CardTitle>
            <div className="flex items-center space-x-2">
              {isAnalyzing && <Loader2 className="h-5 w-5 animate-spin text-warning" />}
              {isCompleted && <CheckCircle className="h-5 w-5 text-success" />}
              {isFailed && <AlertTriangle className="h-5 w-5 text-error" />}
              <Button variant="outline" size="sm" onClick={handleRefetch}>Refresh</Button>
            </div>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="flex flex-col items-center space-y-4">
              <Avatar className="h-40 w-40 rounded-md border border-border/50 shadow-sm">
                <AvatarImage src={comp.artwork_url || undefined} alt={comp.generated_name || "Artwork"} />
                <AvatarFallback className="rounded-md bg-secondary dark:bg-accent">
                  <Palette className="h-20 w-20 text-muted-foreground" />
                </AvatarFallback>
              </Avatar>
              <div className="flex space-x-2">
                <Button variant="outline" size="sm" onClick={handleGenerateArtworkPrompt}>
                  <Sparkles className="h-4 w-4 mr-2" /> Generate Artwork Prompt
                </Button>
                <Button variant="outline" size="sm" onClick={handleRegenerateArtwork}>
                  <Palette className="h-4 w-4 mr-2" /> Regenerate Artwork
                </Button>
              </div>
              {/* File upload for artwork */}
              <Input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleUploadArtwork(e.target.files[0]);
                  }
                }}
                className="w-full max-w-[200px]"
              />
              {comp.artwork_url && (
                <Button variant="destructive" size="sm" onClick={handleDeleteArtwork}>
                  <Trash2 className="h-4 w-4 mr-2" /> Delete Artwork
                </Button>
              )}
            </div>

            <div className="md:col-span-2 space-y-4">
              <h2 className="text-3xl font-bold">{comp.generated_name || 'Untitled Composition'}</h2>
              <p className="text-muted-foreground">Created: {format(new Date(comp.created_at), 'MMM dd, yyyy hh:mm a')}</p>
              <p className="text-lg">Status: <span className="font-semibold">{comp.status.charAt(0).toUpperCase() + comp.status.slice(1)}</span></p>

              {hasFile ? (
                <div className="flex items-center space-x-2 text-success">
                  <CheckCircle className="h-5 w-5" />
                  <span>Audio file uploaded: {comp.file_name}</span>
                  <Button variant="destructive" size="sm" onClick={handleClearFile}>
                    <Trash2 className="h-4 w-4 mr-2" /> Clear File
                  </Button>
                </div>
              ) : (
                <div className="flex items-center space-x-2 text-info">
                  <Upload className="h-5 w-5" />
                  <span>No audio file uploaded.</span>
                  {/* Add file upload input here if needed */}
                </div>
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
          handleGenerateName={handleGenerateName}
          handleGenerateDescription={handleGenerateDescription}
          handleGenerateMood={handleGenerateMood}
          handleGeneratePrimaryGenre={handleGeneratePrimaryGenre}
          handleGenerateSecondaryGenre={handleGenerateSecondaryGenre}
          handleGenerateIsInstrumental={handleGenerateIsInstrumental}
          handleGenerateIsOriginalSong={handleGenerateIsOriginalSong}
          handleGenerateHasExplicitLyrics={handleGenerateHasExplicitLyrics}
          handleGenerateIsOriginalSongConfirmed={handleGenerateIsOriginalSongConfirmed}
          handleGenerateIsMetadataConfirmed={handleGenerateIsMetadataConfirmed}
          handleGenerateInsightContentType={handleGenerateInsightContentType}
          handleGenerateInsightLanguage={handleGenerateInsightLanguage}
          handleGenerateInsightPrimaryUse={handleGenerateInsightPrimaryUse}
          handleGenerateInsightAudienceLevel={handleGenerateInsightAudienceLevel}
          handleGenerateInsightAudienceAge={handleGenerateInsightAudienceAge}
          handleGenerateInsightBenefits={handleGenerateInsightBenefits}
          handleGenerateInsightPractices={handleGenerateInsightPractices}
          handleGenerateInsightThemes={handleGenerateInsightThemes}
          handleGenerateInsightVoice={handleGenerateInsightVoice}
          aiGeneratedDescription={aiGeneratedDescription}
          setAiGeneratedDescription={setAiGeneratedDescription}
        />
      </main>

      <MadeWithDyad />
    </div>
  );
};

export default CompositionDetails;