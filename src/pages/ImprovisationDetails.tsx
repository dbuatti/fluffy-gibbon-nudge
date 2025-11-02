import React from 'react';
import { useParams, Navigate, useNavigate, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Download, Music, CheckCircle, XCircle, Piano, RefreshCw, Trash2, ExternalLink, Clock, Image as ImageIcon, Zap, ArrowLeft, Send } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { format } from 'date-fns';
import { showSuccess, showError } from '@/utils/toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import DistroKidTab from '@/components/DistroKidTab';
import InsightTimerTab from '@/components/InsightTimerTab';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import AudioUploadForIdea from '@/components/AudioUploadForIdea';
import CompositionNotes from '@/components/CompositionNotes';
import { Progress } from '@/components/ui/progress';
import FilePathSuggestion from '@/components/FilePathSuggestion'; // Import new component
import TagGenerator from '@/components/TagGenerator'; // Import new component

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
  analysis_data: { [key: string]: any } | null;
  created_at: string;
  storage_path: string | null; // Now nullable
  notes: NoteTab[] | null; // New field
  is_ready_for_release: boolean | null; // New field
  user_tags: string[] | null; // New field
}

const fetchImprovisationDetails = async (id: string): Promise<Improvisation> => {
  const { data, error } = await supabase
    .from('improvisations')
    .select('*, is_ready_for_release, user_tags') // Select new columns
    .eq('id', id)
    .single();

  if (error) throw new Error(error.message);
  return data as Improvisation;
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
  const [isRescanning, setIsRescanning] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [isMarkingReady, setIsMarkingReady] = React.useState(false);

  const { data: imp, isLoading, error } = useQuery<Improvisation>({
    queryKey: ['improvisation', id],
    queryFn: () => fetchImprovisationDetails(id!),
    enabled: !!id,
    refetchInterval: 5000, // Keep polling in case analysis or artwork is still running
  });

  // Determine if we are loading the initial data OR if the status is actively analyzing
  const isAnalyzing = imp?.status === 'analyzing';
  const showLoadingSpinner = isLoading || isAnalyzing;
  const hasAudioFile = !!imp?.storage_path;
  const isCompleted = imp?.status === 'completed';
  const isReadyForRelease = imp?.is_ready_for_release;

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
      showError("Cannot regenerate artwork: Analysis data (name, genre, or mood) is missing. Please rescan analysis first.");
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

  const handleRescanAnalysis = async () => {
    if (!imp || !imp.storage_path) {
      showError("Cannot rescan: Audio file is missing. Please upload the audio first.");
      return;
    }

    setIsRescanning(true);
    showSuccess("Analysis rescan started...");

    try {
      // 1. Reset status in DB immediately to show 'analyzing'
      const { error: resetError } = await supabase
        .from('improvisations')
        .update({ 
          status: 'analyzing',
          generated_name: imp.generated_name, // Keep the user-provided name if it exists
          artwork_url: null,
          primary_genre: null,
          secondary_genre: null,
          analysis_data: null,
          is_ready_for_release: false, // Reset readiness flag
        })
        .eq('id', imp.id);

      if (resetError) throw resetError;

      // 2. Trigger the analysis Edge Function
      const { error: functionError } = await supabase.functions.invoke('analyze-improvisation', {
        body: {
          improvisationId: imp.id,
          storagePath: imp.storage_path,
          isImprovisation: imp.is_improvisation, // Pass existing user input
        },
      });

      if (functionError) {
        throw functionError;
      }
      
      // Force refetch to show the 'analyzing' status immediately
      handleRefetch();

    } catch (error) {
      console.error('Rescan failed:', error);
      showError(`Failed to rescan analysis: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsRescanning(false);
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

  // --- Progress Logic (Micro-Triggers Implemented) ---
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
      progressValue = 30; // Reset base to 30% for file upload
      progressMessage = "Audio uploaded. Analysis is running...";
      primaryAction = null; // No action needed while analyzing
    }

    // Step 3: Analysis Completed (60% total)
    const hasNotes = imp.notes?.some(n => n.content.trim().length > 0);
    if (isCompleted) {
      progressValue = 60;
      progressMessage = "Analysis complete! Review metadata and notes.";
      
      // Action 2: Add Notes
      if (!hasNotes) {
          primaryAction = {
              label: "Add Creative Notes (20% Progress Boost)",
              onClick: () => {
                  // Scroll to the CompositionNotes component
                  document.getElementById('composition-notes')?.scrollIntoView({ behavior: 'smooth' });
              },
              variant: "secondary"
          };
      }
    }
    
    // Micro-Progress: Notes Added (20%)
    if (isCompleted && hasNotes) {
        progressValue = 80;
        progressMessage = "Notes added. Ready for distribution prep!";
        
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

    // Step 4: Artwork Generated (90%)
    if (isCompleted && hasNotes && imp.artwork_url) {
      progressValue = 90;
      progressMessage = "Artwork generated. Final step: Mark as Ready for Release!";
      
      // Action 4: Mark Ready
      if (!isReadyForRelease) {
          primaryAction = {
              label: "Mark as Ready for Release (10% Progress Boost)",
              onClick: handleMarkReady,
              variant: "default"
          };
      }
    }

    // Step 5: Ready for Release (100%)
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
    const loadingMessage = isAnalyzing ? "Analysis in progress..." : "Loading composition details...";
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
      {/* NEW: Back Button */}
      <Link to="/" className="flex items-center text-sm text-muted-foreground hover:text-primary transition-colors">
        <ArrowLeft className="w-4 h-4 mr-1" /> Back to Dashboard
      </Link>
      
      <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4 mb-6">
        <div className="flex-grow">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">
            {imp.generated_name || imp.file_name || 'Untitled Idea'}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Created: {imp.created_at ? format(new Date(imp.created_at), 'MMM dd, yyyy HH:mm') : 'N/A'}
          </p>
        </div>
        
        <div className="flex-shrink-0">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" disabled={isDeleting}>
                {isDeleting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4 mr-2" />
                )}
                Delete Composition
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action cannot be undone. This will permanently delete the composition record and the uploaded audio file (if attached).
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
                  {isDeleting ? 'Deleting...' : 'Delete Composition'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <Tabs defaultValue="creative-hub" className="w-full">
        <TabsList className="grid w-full grid-cols-3 h-auto p-1">
          <TabsTrigger value="creative-hub" className="text-base py-2">Creative Hub</TabsTrigger>
          <TabsTrigger id="assets-tab-trigger" value="assets-downloads" className="text-base py-2" disabled={!hasAudioFile}>Assets & Downloads</TabsTrigger>
          <TabsTrigger id="analysis-distro-tab" value="analysis-distro" className="text-base py-2" disabled={!hasAudioFile}>
            Analysis & Distribution {isAnalyzing && <Loader2 className="h-4 w-4 ml-2 animate-spin" />}
          </TabsTrigger>
        </TabsList>

        {/* --- CREATIVE HUB TAB --- */}
        <TabsContent value="creative-hub" className="space-y-8 mt-6">
          
          {/* Progress Bar (Gamification) */}
          <Card className="p-4">
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
                    disabled={isAnalyzing || isMarkingReady}
                >
                    {isMarkingReady ? (
                        <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Marking Ready...
                        </>
                    ) : (
                        primaryAction.label
                    )}
                </Button>
            ) : (
                <p className="text-sm text-muted-foreground">{progressMessage}</p>
            )}
          </Card>

          {/* Composition Status Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">Composition Status</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <div className="flex items-center">
                        <span className="font-semibold w-24">Status:</span> 
                        <Badge className="ml-2">{imp.status.toUpperCase()}</Badge>
                    </div>
                    <div className="flex items-center">
                        <span className="font-semibold w-24">File:</span> <span className="ml-2 truncate">{imp.file_name || 'N/A'}</span>
                    </div>
                    <div className="flex items-center">
                        <Piano className="h-5 w-5 mr-2" />
                        <span className="font-semibold">Type:</span> 
                        <Badge variant={imp.is_improvisation ? 'default' : 'secondary'} className="ml-2">
                            {imp.is_improvisation ? 'Improvisation' : 'Composition'}
                        </Badge>
                    </div>
                </div>
                <div className="space-y-2">
                    <div className="flex items-center">
                        <Piano className="h-5 w-5 mr-2" />
                        <span className="font-semibold">Is Piano:</span> 
                        <Badge variant={imp.is_piano ? 'default' : 'destructive'} className="ml-2">
                            {imp.is_piano ? <CheckCircle className="h-3 w-3 mr-1" /> : <XCircle className="h-3 w-3 mr-1" />}
                            {imp.is_piano ? 'Confirmed' : 'Unconfirmed'}
                        </Badge>
                    </div>
                    <div className="flex items-center">
                        <Send className="h-5 w-5 mr-2" />
                        <span className="font-semibold">Ready:</span> 
                        <Badge variant={isReadyForRelease ? 'default' : 'outline'} className="ml-2 bg-green-500 hover:bg-green-500 text-white">
                            {isReadyForRelease ? <CheckCircle className="h-3 w-3 mr-1" /> : 'Pending'}
                        </Badge>
                    </div>
                    <div className="flex items-center">
                        <span className="font-semibold w-24">Created:</span> <span className="ml-2 text-sm">{imp.created_at ? format(new Date(imp.created_at), 'MMM dd, yyyy') : 'N/A'}</span>
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

        {/* --- ASSETS & DOWNLOADS TAB (NEW) --- */}
        <TabsContent value="assets-downloads" className="space-y-8 mt-6">
          
          {/* Artwork & Actions Card (Moved from Creative Hub) */}
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
                        {isRegenerating ? 'Regenerating...' : 'Regenerate Artwork'}
                      </Button>
                    )}
                    {hasAudioFile && (
                      <Button 
                        onClick={handleRescanAnalysis} 
                        variant="secondary" 
                        className="w-full"
                        disabled={isRescanning || isAnalyzing}
                      >
                        {isRescanning || isAnalyzing ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <RefreshCw className="h-4 w-4 mr-2" />
                        )}
                        {isRescanning || isAnalyzing ? 'Rescanning...' : 'Rescan Analysis'}
                      </Button>
                    )}
                </div>
              </div>
            </CardContent>
          </Card>
          
          {/* External Tools Card (Moved from Creative Hub) */}
          <Card>
            <CardHeader>
              <CardTitle>External Tools & Organization</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <FilePathSuggestion 
                    generatedName={imp.generated_name}
                    primaryGenre={imp.primary_genre}
                    isCompleted={isCompleted}
                />
                <Separator />
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <QuickLinkButton href={DISTROKID_URL} icon={Music} label="DistroKid Submission" />
                    <QuickLinkButton href={INSIGHT_TIMER_URL} icon={Clock} label="Insight Timer Upload" />
                    <QuickLinkButton href={IMAGE_RESIZER_URL} icon={ImageIcon} label="Image Resizer Tool" />
                </div>
            </CardContent>
          </Card>

        </TabsContent>

        {/* --- ANALYSIS & DISTRIBUTION TAB --- */}
        <TabsContent value="analysis-distro" className="space-y-8 mt-6">
          
          <Card>
            <CardHeader>
              <CardTitle>AI Analysis Results</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <h3 className="text-lg font-semibold">AI Generated Metadata</h3>
                <div className="space-y-2">
                    <div className="flex items-center">
                        <span className="font-semibold w-32">Primary Genre:</span> <span className="ml-2">{imp.primary_genre || 'N/A'}</span>
                    </div>
                    <div className="flex items-center">
                        <span className="font-semibold w-32">Secondary Genre:</span> <span className="ml-2">{imp.secondary_genre || 'N/A'}</span>
                    </div>
                </div>

                {imp.analysis_data && (
                  <>
                    <Separator />
                    <h3 className="text-lg font-semibold">Technical Data</h3>
                    <ul className="list-disc list-inside ml-4 space-y-1 text-sm text-muted-foreground">
                      {Object.entries(imp.analysis_data).map(([key, value]) => (
                        <li key={key}>
                          <span className="font-medium capitalize">{key.replace(/_/g, ' ')}:</span> {String(value)}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
            </CardContent>
          </Card>

          {isCompleted && (
            <Tabs defaultValue="distrokid" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="distrokid">DistroKid Prep</TabsTrigger>
                <TabsTrigger value="insight-timer">Insight Timer Prep</TabsTrigger>
              </TabsList>
              <TabsContent value="distrokid">
                <DistroKidTab imp={imp} />
              </TabsContent>
              <TabsContent value="insight-timer">
                <InsightTimerTab imp={imp} />
              </TabsContent>
            </Tabs>
          )}
          
          {!isCompleted && (
            <Card className="p-6 text-center border-dashed border-2 border-muted-foreground/50">
                <Loader2 className="h-8 w-8 mx-auto mb-3 animate-spin text-primary" />
                <p className="text-lg font-semibold">Analysis Pending</p>
                <p className="text-sm text-muted-foreground">
                    This section will populate once the audio file is uploaded and the AI analysis is complete.
                </p>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ImprovisationDetails;