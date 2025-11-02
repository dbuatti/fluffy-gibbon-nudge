import React from 'react';
import { useParams, Navigate, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Download, Music, CheckCircle, XCircle, Piano, RefreshCw, Trash2, ExternalLink, Clock, Image as ImageIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { format } from 'date-fns';
import { showSuccess, showError } from '@/utils/toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import DistroKidTab from '@/components/DistroKidTab';
import InsightTimerTab from '@/components/InsightTimerTab';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';

// External Links for Quick Access
const DISTROKID_URL = "https://distrokid.com/new/";
const INSIGHT_TIMER_URL = "https://teacher.insighttimer.com/tracks/create?type=audio";
const IMAGE_RESIZER_URL = "https://biteable.com/tools/image-resizer/";

interface Improvisation {
  id: string;
  file_name: string;
  status: 'uploaded' | 'analyzing' | 'completed' | 'failed';
  generated_name: string | null;
  artwork_url: string | null;
  is_piano: boolean | null;
  is_improvisation: boolean | null;
  primary_genre: string | null;
  secondary_genre: string | null;
  analysis_data: { [key: string]: any } | null;
  created_at: string;
  storage_path: string; // Need storage path to trigger analysis function
}

const fetchImprovisationDetails = async (id: string): Promise<Improvisation> => {
  const { data, error } = await supabase
    .from('improvisations')
    .select('*')
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

  const { data: imp, isLoading, error } = useQuery<Improvisation>({
    queryKey: ['improvisation', id],
    queryFn: () => fetchImprovisationDetails(id!),
    enabled: !!id,
    refetchInterval: 5000, // Keep polling in case analysis or artwork is still running
  });

  // Determine if we are loading the initial data OR if the status is actively analyzing
  const isAnalyzing = imp?.status === 'analyzing';
  const showLoadingSpinner = isLoading || isAnalyzing;

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
      
      queryClient.invalidateQueries({ queryKey: ['improvisation', id] });
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
      showError("Cannot rescan: File path is missing.");
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
          generated_name: null,
          artwork_url: null,
          primary_genre: null,
          secondary_genre: null,
          analysis_data: null,
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
      queryClient.invalidateQueries({ queryKey: ['improvisation', id] });
      queryClient.invalidateQueries({ queryKey: ['improvisations'] });

    } catch (error) {
      console.error('Rescan failed:', error);
      showError(`Failed to rescan analysis: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsRescanning(false);
    }
  };

  const handleDelete = async () => {
    if (!imp) return;

    setIsDeleting(true);
    showSuccess("Deleting composition...");

    try {
      // 1. Delete file from Supabase Storage
      const { error: storageError } = await supabase.storage
        .from('piano_improvisations')
        .remove([imp.storage_path]);

      if (storageError) {
        // Log storage error but continue to delete DB record
        console.error("Failed to delete file from storage:", storageError);
      }

      // 2. Delete record from database (this should cascade if RLS is set up correctly)
      const { error: dbError } = await supabase
        .from('improvisations')
        .delete()
        .eq('id', imp.id);

      if (dbError) throw dbError;

      showSuccess(`Composition "${imp.file_name}" deleted successfully.`);
      queryClient.invalidateQueries({ queryKey: ['improvisations'] });
      navigate('/'); // Redirect to dashboard

    } catch (error) {
      console.error('Deletion failed:', error);
      showError(`Failed to delete composition: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsDeleting(false);
    }
  };

  const isCompleted = imp.status === 'completed';
  // isAnalyzing is now defined outside the component body based on imp?.status

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-8 space-y-8">
      <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4">
        <div className="flex-grow">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">
            {imp.generated_name || imp.file_name}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Uploaded: {imp.created_at ? format(new Date(imp.created_at), 'MMM dd, yyyy HH:mm') : 'N/A'}
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
                  This action cannot be undone. This will permanently delete the composition record and the uploaded audio file from storage.
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

      <Card>
        <CardHeader>
          <CardTitle>Artwork & Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* Artwork Column */}
          <div className="col-span-1 space-y-4">
            {imp.artwork_url ? (
              <img 
                src={imp.artwork_url} 
                alt="Generated Artwork" 
                className="w-full aspect-square object-cover rounded-lg shadow-lg"
              />
            ) : (
              <div className="w-full aspect-square bg-muted rounded-lg flex flex-col items-center justify-center text-muted-foreground">
                <Music className="h-12 w-12" />
                <p className="mt-2">Artwork generating...</p>
              </div>
            )}
            
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
            </div>
          </div>

          {/* Quick Links Column */}
          <div className="col-span-1 space-y-4">
            <h3 className="text-lg font-semibold">Distribution Links</h3>
            <QuickLinkButton href={DISTROKID_URL} icon={Music} label="DistroKid Submission" />
            <QuickLinkButton href={INSIGHT_TIMER_URL} icon={Clock} label="Insight Timer Upload" />
            
            <Separator />

            <h3 className="text-lg font-semibold">Asset Tools</h3>
            <QuickLinkButton href={IMAGE_RESIZER_URL} icon={ImageIcon} label="Biteable Image Resizer" />
          </div>

          {/* Metadata Column */}
          <div className="col-span-1 space-y-4">
            <h3 className="text-lg font-semibold">Composition Metadata</h3>
            
            <div className="space-y-2">
                <div className="flex items-center">
                    <span className="font-semibold w-24">Status:</span> 
                    <Badge className="ml-2">{imp.status.toUpperCase()}</Badge>
                </div>
                <div className="flex items-center">
                    <span className="font-semibold w-24">File:</span> <span className="ml-2 truncate">{imp.file_name}</span>
                </div>
                <div className="flex items-center">
                    <Piano className="h-5 w-5 mr-2" />
                    <span className="font-semibold">Type:</span> 
                    <Badge variant={imp.is_improvisation ? 'default' : 'secondary'} className="ml-2">
                        {imp.is_improvisation ? 'Improvisation' : 'Composition'}
                    </Badge>
                </div>
                <div className="flex items-center">
                    <Piano className="h-5 w-5 mr-2" />
                    <span className="font-semibold">Is Piano:</span> 
                    <Badge variant={imp.is_piano ? 'default' : 'destructive'} className="ml-2">
                        {imp.is_piano ? <CheckCircle className="h-3 w-3 mr-1" /> : <XCircle className="h-3 w-3 mr-1" />}
                        {imp.is_piano ? 'Confirmed' : 'Unconfirmed'}
                    </Badge>
                </div>
                <div className="flex items-center">
                    <span className="font-semibold">Primary Genre:</span> <span className="ml-2">{imp.primary_genre || 'N/A'}</span>
                </div>
                <div className="flex items-center">
                    <span className="font-semibold">Secondary Genre:</span> <span className="ml-2">{imp.secondary_genre || 'N/A'}</span>
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
          </div>
        </CardContent>
      </Card>
      
      {imp.status === 'completed' && (
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
    </div>
  );
};

export default ImprovisationDetails;