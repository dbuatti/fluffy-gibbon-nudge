import React from 'react';
import { useParams, Navigate, useNavigate, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, getPublicAudioUrl as getPublicAudioUrlHelper } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Download, Music, CheckCircle, XCircle, Piano, RefreshCw, Trash2, ExternalLink, Clock, Image as ImageIcon, Zap, ArrowLeft, Send, Edit2, Sparkles, Hash, Gauge, Palette, Info, Copy } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { format } from 'date-fns';
import { showSuccess, showError } from '@/utils/toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import DistroKidTab from '@/components/DistroKidTab';
import InsightTimerTab from '@/components/InsightTimerTab';
import AudioUploadForIdea from '@/components/AudioUploadForIdea';
import CompositionNotes from '@/components/CompositionNotes';
import { Progress } from '@/components/ui/progress';
import FilePathSuggestion from '@/components/FilePathSuggestion';
import TagGenerator from '@/components/TagGenerator';
import CompositionSettingsSheet from '@/components/CompositionSettingsSheet';
import EditableField from '@/components/EditableField';
import { useUpdateImprovisation } from '@/hooks/useUpdateImprovisation';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useTitleGenerator } from '@/hooks/useTitleGenerator';
import GenreSelect from '@/components/GenreSelect';
import AudioPlayer from '@/components/AudioPlayer';
import CompositionMetadataDialog from '@/components/CompositionMetadataDialog';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input'; // Import Input
import { useAIAugmentation } from '@/hooks/useAIAugmentation'; // Import new hook
import PreFlightChecklist from '@/components/PreFlightChecklist'; // Import new component

// External Links for Quick Access
const DISTROKID_URL = "https://distrokid.com/new/";
const INSIGHT_TIMER_URL = "https://teacher.insighttimer.com/tracks/create?type=audio";
const IMAGE_RESIZER_URL = "https://biteable.com/tools/image-resizer/";

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
  file_name: string | null; // Now nullable
  status: 'uploaded' | 'analyzing' | 'completed' | 'failed';
  generated_name: string | null;
  artwork_url: string | null;
  is_piano: boolean | null;
  is_improvisation: boolean | null;
  primary_genre: string | null;
  secondary_genre: string | null;
  analysis_data: AnalysisData | null;
  created_at: string;
  storage_path: string | null; // Now nullable
  notes: NoteTab[] | null; // New field
  is_ready_for_release: boolean | null; // New field
  user_tags: string[] | null; // New field
  is_instrumental: boolean | null; // NEW FIELD
  is_original_song: boolean | null; // NEW FIELD
  has_explicit_lyrics: boolean | null; // NEW FIELD
  is_metadata_confirmed: boolean | null; // NEW FIELD
  
  // NEW INSIGHT TIMER FIELDS
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
  // Explicitly list all columns including the new Insight Timer fields
  const { data, error } = await supabase
    .from('improvisations')
    .select('id,user_id,file_name,storage_path,status,generated_name,analysis_data,created_at,artwork_url,is_piano,primary_genre,secondary_genre,is_improvisation,notes,is_ready_for_release,user_tags,is_instrumental,is_original_song,has_explicit_lyrics,is_metadata_confirmed,insight_content_type,insight_language,insight_primary_use,insight_audience_level,insight_audience_age,insight_benefits,insight_practices,insight_themes,insight_voice')
    .eq('id', id)
    .single();

  if (error) throw new Error(error.message);
  return data as Improvisation;
};

// Function to get the public URL for the audio file
const getPublicAudioUrl = (storagePath: string | null): string | null => {
    if (!storagePath) return null;
    
    // Use the helper function from the client integration
    return getPublicAudioUrlHelper(storagePath);
};


const QuickLinkButton: React.FC<{ href: string, icon: React.ElementType, label: string }> = ({ href, icon: Icon, label }) => (
  <a href={href} target="_blank" rel="noopener noreferrer" className="w-full">
    <Button variant="outline" className="w-full justify-start text-sm h-8 px-3">
      <Icon className="h-4 w-4 mr-2" />
      {label}
      <ExternalLink className="h-3 w-3 ml-auto" />
    </Button>
  </a>
);

const ImprovisationDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isRegenerating, setIsRegenerating] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [isMarkingReady, setIsMarkingReady] = React.useState(false);

  const { data: imp, isLoading, error } = useQuery<Improvisation>({
    queryKey: ['improvisation', id],
    queryFn: () => fetchImprovisationDetails(id!),
    enabled: !!id,
    refetchInterval: 5000, // Keep polling in case analysis or artwork is still running
  });

  const updateMutation = useUpdateImprovisation(id!);
  const { isPopulating, aiGeneratedDescription, handleAIPopulateMetadata, setAiGeneratedDescription } = useAIAugmentation(id!); // Use new hook
  
  // Handler for Editable Fields (used by useTitleGenerator)
  const handleUpdateName = (newName: string) => updateMutation.mutateAsync({ generated_name: newName });
  
  const { isGenerating, handleRandomGenerate, handleAIGenerate } = useTitleGenerator(id!, handleUpdateName);

  // Determine if we are loading the initial data OR if the status is actively analyzing
  const isAnalyzing = imp?.status === 'analyzing';
  const showLoadingSpinner = isLoading || isAnalyzing;
  const hasAudioFile = !!imp?.storage_path;
  const isCompleted = imp?.status === 'completed';
  const isReadyForRelease = imp?.is_ready_for_release;
  
  // Get public URL for the audio file
  const audioPublicUrl = getPublicAudioUrl(imp?.storage_path || null);

  // --- CALCULATE READINESS STATUS FOR DISTROKID TAB ---
  const hasInsightTimerCategorization = (imp?.insight_benefits?.length || 0) > 0 && !!imp?.insight_practices && (imp?.insight_themes?.length || 0) > 0;
  
  // A composition is blocked if any critical asset or confirmation is missing.
  const isBlocked = !hasAudioFile || !imp?.artwork_url || !hasInsightTimerCategorization || !imp?.is_metadata_confirmed;
  // --- END CALCULATE READINESS STATUS ---

  // --- HANDLER DEFINITIONS ---

  const handleRefetch = () => {
    queryClient.invalidateQueries({ queryKey: ['improvisation', id] });
    queryClient.invalidateQueries({ queryKey: ['improvisations'] });
  };

  const handleDownload = () => {
    if (imp?.artwork_url) {
      const link = document.createElement('a');
      link.href = imp.artwork_url;
      // Ensure the downloaded file name reflects the high resolution
      link.download = `${imp.generated_name || 'artwork'}_3000x3000.jpg`; 
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };
  
  const handleRegenerateArtwork = async () => {
    if (!imp || !imp.generated_name || !imp.primary_genre || !imp.analysis_data?.mood) {
      showError("Cannot regenerate artwork: Core metadata (name, genre, or mood) is missing. Please set these fields first.");
      return;
    }

    setIsRegenerating(true);
    showSuccess("Artwork regeneration started...");

    try {
      const { error: functionError } = await supabase.functions.invoke('generate-artwork', {
        body: {
          improvisationId: imp.id,
          generatedName: imp.generated_name,
          primaryGenre: imp.primary_genre, // Pass required parameter
          secondaryGenre: imp.secondary_genre, // Pass required parameter
          mood: imp.analysis_data.mood, // Pass required parameter
        },
      });

      if (functionError) {
        throw functionError;
      }
      
      // Wait a moment for the backend update to complete before refetching
      await new Promise(resolve => setTimeout(resolve, 1500)); 
      
      handleRefetch();
      showSuccess("New artwork generated successfully!");

    } catch (error) {
      console.error('Regeneration failed:', error);
      showError(`Failed to regenerate artwork: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
    
    // 1. Reset file-related fields and status to 'uploaded' (Needs Audio)
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
    // NOTE: We do NOT attempt to delete the file from storage here, as we assume it was already missing/failed.
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
  
  // Handler for nested analysis_data updates
  const handleUpdateAnalysisData = (key: keyof AnalysisData, newValue: string) => {
    const currentData = imp.analysis_data || {};
    let updatedValue: string | number = newValue;

    // Special handling for tempo (ensure it's a number)
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
  
  // Handler for metadata confirmation
  const handleUpdateIsMetadataConfirmed = (checked: boolean) => updateMutation.mutateAsync({ is_metadata_confirmed: checked });


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
                // Scroll to the AudioUploadForIdea component
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
    const hasCoreMetadata = !!imp.primary_genre && !!imp.analysis_data?.simulated_key && !!imp.analysis_data?.simulated_tempo;
    
    if (hasAudioFile && hasCoreMetadata) {
      progressValue = 60;
      progressMessage = "Core metadata set. Add creative notes and tags.";
      
      // Action 2: Add Notes
      if (!hasNotes) {
          primaryAction = {
              label: "Add Creative Notes (10% Progress Boost)",
              onClick: () => {
                  // Scroll to the CompositionNotes component
                  document.getElementById('composition-notes')?.scrollIntoView({ behavior: 'smooth' });
              },
              variant: "secondary"
          };
      }
    }
    
    // Step 4: Notes Added (70%)
    if (hasAudioFile && hasCoreMetadata && hasNotes) {
        progressValue = 70;
        progressMessage = "Notes added. Generate artwork and populate distribution fields.";
        
        // Action 3: Generate Artwork
        if (!imp.artwork_url) {
            primaryAction = {
                label: "Generate Artwork (10% Progress Boost)",
                onClick: () => {
                    // Switch to Assets tab
                    document.getElementById('assets-tab-trigger')?.click();
                },
                variant: "outline"
            };
        }
    }

    // Step 5: Artwork Generated (80%)
    const hasInsightTimerPopulated = (imp.insight_benefits?.length || 0) > 0 && !!imp.insight_practices;
    
    if (hasAudioFile && hasCoreMetadata && hasNotes && imp.artwork_url) {
      progressValue = 80;
      progressMessage = "Artwork generated. Use AI to populate distribution fields.";
      
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
    if (hasAudioFile && hasCoreMetadata && hasNotes && imp.artwork_url && hasInsightTimerPopulated) {
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
              // Switch to the Analysis tab
              document.getElementById('analysis-distro-tab')?.click();
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

  const compositionName = imp.generated_name || imp.file_name || 'Untitled Idea';
  
  const handleCopyUrl = () => {
    if (audioPublicUrl) {
      navigator.clipboard.writeText(audioPublicUrl);
      showSuccess('Public audio URL copied to clipboard!');
    } else {
      showError('No public URL available.');
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-8 space-y-8">
      {/* NEW: Back Button */}
      <Link to="/" className="flex items-center text-sm text-muted-foreground hover:text-primary transition-colors">
        <ArrowLeft className="w-4 h-4 mr-1" /> Back to Dashboard
      </Link>
      
      <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4 mb-6">
        <div className="flex-grow">
          <div className="flex items-center space-x-2">
            {/* EDITABLE TITLE */}
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">
              <EditableField
                  value={imp.generated_name}
                  label="Composition Title"
                  onSave={handleUpdateName}
                  className="text-3xl font-bold p-0"
                  placeholder="Click to set title"
              />
            </h1>
            
            {/* Title Generation Buttons */}
            <div className="flex space-x-1">
                <Button 
                    onClick={handleRandomGenerate} 
                    size="icon" 
                    variant="ghost" 
                    title="Generate Random Title"
                    disabled={isGenerating || updateMutation.isPending}
                >
                    {isGenerating && updateMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                        <RefreshCw className="h-4 w-4" />
                    )}
                </Button>
                <Button 
                    onClick={handleAIGenerate} 
                    size="icon" 
                    variant="ghost" 
                    title="Generate AI Title (Based on Analysis & Notes)"
                    disabled={isGenerating || updateMutation.isPending}
                >
                    {isGenerating && updateMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                        <Sparkles className="h-4 w-4 text-purple-500" />
                    )}
                </Button>
            </div>
            
            {/* NEW: Metadata Dialog Trigger */}
            {imp && (
                <CompositionMetadataDialog
                    imp={imp}
                    isPending={updateMutation.isPending}
                    handleUpdatePrimaryGenre={handleUpdatePrimaryGenre}
                    handleUpdateSecondaryGenre={handleUpdateSecondaryGenre}
                    handleUpdateAnalysisData={handleUpdateAnalysisData}
                    handleUpdateIsImprovisation={handleUpdateIsImprovisation}
                    handleUpdateIsPiano={handleUpdateIsPiano}
                    handleUpdateIsInstrumental={handleUpdateIsInstrumental}
                    handleUpdateIsOriginalSong={handleUpdateIsOriginalSong}
                    handleUpdateHasExplicitLyrics={handleUpdateHasExplicitLyrics}
                    // NEW HANDLERS
                    handleUpdateInsightContentType={handleUpdateInsightContentType}
                    handleUpdateInsightLanguage={handleUpdateInsightLanguage}
                    handleUpdateInsightPrimaryUse={handleUpdateInsightPrimaryUse}
                    handleUpdateInsightAudienceLevel={handleUpdateInsightAudienceLevel}
                    handleUpdateInsightAudienceAge={handleUpdateInsightAudienceAge}
                    handleUpdateInsightVoice={handleUpdateInsightVoice}
                />
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Created: {imp.created_at ? format(new Date(imp.created_at), 'MMM dd, yyyy HH:mm') : 'N/A'}
          </p>
        </div>
        
        <div className="flex-shrink-0">
          <CompositionSettingsSheet 
            impId={imp.id}
            impName={compositionName}
            handleDelete={handleDelete}
            isDeleting={isDeleting}
          />
        </div>
      </div>
      
      {/* AUDIO PLAYER (New Component) */}
      {audioPublicUrl && imp.file_name && imp.storage_path && (
        <AudioPlayer 
          publicUrl={audioPublicUrl} 
          fileName={imp.file_name} 
          storagePath={imp.storage_path} 
          onClearFile={handleClearFile} // Pass the new handler
        />
      )}

      <Tabs defaultValue="creative-hub" className="w-full">
        <TabsList className="grid w-full grid-cols-3 h-auto p-1">
          <TabsTrigger value="creative-hub" className="text-base py-2">Creative Hub</TabsTrigger>
          <TabsTrigger id="assets-tab-trigger" value="assets-downloads" className="text-base py-2">Assets & Downloads</TabsTrigger>
          <TabsTrigger id="analysis-distro-tab" value="analysis-distro" className="text-base py-2">
            Distribution Prep {isAnalyzing && <Loader2 className="h-4 w-4 ml-2 animate-spin" />}
          </TabsTrigger>
        </TabsList>

        {/* --- CREATIVE HUB TAB --- */}
        <TabsContent value="creative-hub" className="space-y-8 mt-6">
          
          {/* Progress Bar (Gamification) */}
          <Card className={cn(
            "p-4 border-2 shadow-xl dark:shadow-3xl",
            isReadyForRelease ? "border-green-500/50 bg-green-50/50 dark:bg-green-950/50" : "border-primary/50 bg-primary/5 dark:bg-primary/10"
          )}>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-semibold flex items-center">
                <Zap className="h-5 w-5 mr-2 text-yellow-500" /> Composition Readiness
              </h3>
              <span className="text-sm font-bold text-primary">{progressValue}%</span>
            </div>
            <Progress value={progressValue} className="h-2 mb-4" />
            
            {/* Primary Action Button */}
            {primaryAction ? (
                <Button 
                    onClick={primaryAction.onClick} 
                    variant={primaryAction.variant} 
                    className="w-full h-10 text-base"
                    disabled={isAnalyzing || isMarkingReady || isPopulating} // Use isPopulating
                >
                    {isMarkingReady || isPopulating ? ( // Use isPopulating
                        <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" /> {isPopulating ? 'Populating Metadata...' : 'Marking Ready...'}
                        </>
                    ) : (
                        primaryAction.label
                    )}
                </Button>
            ) : (
                <p className="text-sm text-muted-foreground">{progressMessage}</p>
            )}
          </Card>

          {/* NEW: Core Metadata Card (Exposed for quick editing) */}
          <Card>
            <CardHeader>
              <CardTitle className="text-xl flex items-center">
                <Music className="h-5 w-5 mr-2" /> Core Metadata
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="space-y-2 border-b pb-4">
                    <Label className="font-semibold flex items-center"><Piano className="h-4 w-4 mr-2" /> Composition Type</Label>
                    <RadioGroup 
                        value={String(imp.is_improvisation)} 
                        onValueChange={handleUpdateIsImprovisation}
                        disabled={updateMutation.isPending}
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
                                disabled={updateMutation.isPending}
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
                                disabled={updateMutation.isPending}
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
          
          {/* Artwork & Actions Card */}
          <Card id="artwork-actions">
            <CardHeader>
              <CardTitle>Artwork & Asset Actions</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* Artwork Column */}
              <div className="space-y-4">
                {imp.artwork_url ? (
                  <img 
                    src={imp.artwork_url} 
                    alt="Generated Artwork" 
                    className="w-full aspect-square object-cover rounded-lg shadow-lg"
                  />
                ) : (
                  <div className="w-full aspect-square bg-muted rounded-lg flex flex-col items-center justify-center text-muted-foreground">
                    <Music className="h-12 w-12" />
                    <p className="mt-2">
                      {hasAudioFile ? 'Artwork generating...' : 'Upload audio to generate artwork.'}
                    </p>
                  </div>
                )}
              </div>

              {/* Actions Column */}
              <div className="space-y-4 pt-4 md:pt-0">
                <h3 className="text-lg font-semibold">Asset Management</h3>
                <div className="space-y-2">
                    {isCompleted && imp.artwork_url && (
                      <Button onClick={handleDownload} className="w-full">
                        <Download className="h-4 w-4 mr-2" /> Download Artwork (3000x3000)
                      </Button>
                    )}
                    {isCompleted && (
                      <Button 
                        onClick={handleRegenerateArtwork} 
                        variant="outline" 
                        className="w-full"
                        disabled={isRegenerating || isAnalyzing}
                      >
                        {isRegenerating ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <RefreshCw className="h-4 w-4 mr-2" />
                        )}
                        {isRegenerating ? 'Regenerate Artwork' : 'Regenerate Artwork'}
                      </Button>
                    )}
                </div>
                
                <Separator />
                
                <h3 className="text-lg font-semibold">External Tools</h3>
                <QuickLinkButton href={IMAGE_RESIZER_URL} icon={ImageIcon} label="Image Resizer Tool" />
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
          {imp && (
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
          
          {/* External Tools Card (MOVED HERE) */}
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
    </div>
  );
};

export default ImprovisationDetails;