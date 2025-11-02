import React from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Download, Music, CheckCircle, XCircle, Piano, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { format } from 'date-fns';
import { showSuccess, showError } from '@/utils/toast';

interface Improvisation {
  id: string;
  file_name: string;
  status: 'uploaded' | 'analyzing' | 'completed' | 'failed';
  generated_name: string | null;
  artwork_url: string | null;
  is_piano: boolean | null;
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

const ImprovisationDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [isRegenerating, setIsRegenerating] = React.useState(false);
  const [isRescanning, setIsRescanning] = React.useState(false);

  const { data: imp, isLoading, error } = useQuery<Improvisation>({
    queryKey: ['improvisation', id],
    queryFn: () => fetchImprovisationDetails(id!),
    enabled: !!id,
    refetchInterval: 5000, // Keep polling in case analysis or artwork is still running
  });

  if (!id) {
    return <Navigate to="/" replace />;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-2">Loading analysis details...</p>
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
    if (!imp || !imp.generated_name) {
      showError("Cannot regenerate artwork: Analysis name is missing.");
      return;
    }

    setIsRegenerating(true);
    showSuccess("Artwork regeneration started...");

    try {
      const { error: functionError } = await supabase.functions.invoke('generate-artwork', {
        body: {
          improvisationId: imp.id,
          generatedName: imp.generated_name,
        },
      });

      if (functionError) {
        throw functionError;
      }
      
      // Wait a moment for the backend update to complete before refetching
      await new Promise(resolve => setTimeout(resolve, 1000));
      
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

  const isCompleted = imp.status === 'completed';
  const isAnalyzing = imp.status === 'analyzing';

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-8 space-y-8">
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
        Analysis Details: {imp.generated_name || imp.file_name}
      </h1>

      <Card>
        <CardHeader>
          <CardTitle>Artwork & Status</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col md:flex-row gap-6">
          <div className="w-full md:w-1/3">
            {imp.artwork_url ? (
              <img 
                src={imp.artwork_url} 
                alt="Generated Artwork" 
                className="w-full aspect-square object-cover rounded-lg shadow-lg"
              />
            ) : (
              <div className="w-full aspect-square bg-muted rounded-lg flex items-center justify-center text-muted-foreground">
                <Music className="h-12 w-12" />
                <p className="mt-2">Artwork generating...</p>
              </div>
            )}
            
            <div className="space-y-2 mt-4">
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
                  {isRescanning || isAnalyzing ? 'Rescan Analysis' : 'Rescan Analysis'}
                </Button>
            </div>
          </div>

          <div className="w-full md:w-2/3 space-y-4">
            {/* Changed <p> to <div> */}
            <div className="flex items-center">
              <span className="font-semibold">File:</span> <span className="ml-2">{imp.file_name}</span>
            </div>
            
            {/* Changed <p> to <div> */}
            <div className="flex items-center">
              <span className="font-semibold">Status:</span> 
              <Badge className="ml-2">{imp.status.toUpperCase()}</Badge>
            </div>
            
            {/* Changed <p> to <div> */}
            <div className="flex items-center">
              <span className="font-semibold">Generated Name:</span> <span className="ml-2">{imp.generated_name || 'N/A'}</span>
            </div>
            
            {/* Changed <p> to <div> */}
            <div className="flex items-center">
              <span className="font-semibold">Upload Date:</span> <span className="ml-2">{imp.created_at ? format(new Date(imp.created_at), 'MMM dd, yyyy HH:mm') : 'N/A'}</span>
            </div>
            
            <Separator />

            <h3 className="text-xl font-semibold mt-4">Musical Analysis</h3>
            
            <div className="space-y-2">
                <div className="flex items-center">
                    <Piano className="h-5 w-5 mr-2" />
                    <span className="font-semibold">Is Piano Piece:</span> 
                    <Badge variant={imp.is_piano ? 'default' : 'destructive'} className="ml-2">
                        {imp.is_piano ? <CheckCircle className="h-3 w-3 mr-1" /> : <XCircle className="h-3 w-3 mr-1" />}
                        {imp.is_piano ? 'Confirmed' : 'Unconfirmed'}
                    </Badge>
                </div>
                {/* Changed <p> to <div> */}
                <div className="flex items-center">
                    <span className="font-semibold">Primary Genre:</span> <span className="ml-2">{imp.primary_genre || 'N/A'}</span>
                </div>
                {/* Changed <p> to <div> */}
                <div className="flex items-center">
                    <span className="font-semibold">Secondary Genre:</span> <span className="ml-2">{imp.secondary_genre || 'N/A'}</span>
                </div>
            </div>

            {imp.analysis_data && (
              <>
                <Separator />
                <h3 className="text-xl font-semibold">Technical Data</h3>
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
    </div>
  );
};

export default ImprovisationDetails;