import React from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Download, Music, CheckCircle, XCircle, Piano } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { format } from 'date-fns';

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

  const { data: imp, isLoading, error } = useQuery<Improvisation>({
    queryKey: ['improvisation', id],
    queryFn: () => fetchImprovisationDetails(id!),
    enabled: !!id,
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
      link.download = `${imp.generated_name || 'artwork'}_${imp.id}.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const isCompleted = imp.status === 'completed';

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
            {isCompleted && imp.artwork_url && (
              <Button onClick={handleDownload} className="w-full mt-4">
                <Download className="h-4 w-4 mr-2" /> Download Artwork (1600x1600)
              </Button>
            )}
          </div>

          <div className="w-full md:w-2/3 space-y-4">
            <p>
              <span className="font-semibold">File:</span> {imp.file_name}
            </p>
            <p>
              <span className="font-semibold">Status:</span> 
              <Badge className="ml-2">{imp.status.toUpperCase()}</Badge>
            </p>
            <p>
              <span className="font-semibold">Generated Name:</span> {imp.generated_name || 'N/A'}
            </p>
            <p>
              <span className="font-semibold">Upload Date:</span> {imp.created_at ? format(new Date(imp.created_at), 'MMM dd, yyyy HH:mm') : 'N/A'}
            </p>
            
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
                <p>
                    <span className="font-semibold">Primary Genre:</span> {imp.primary_genre || 'N/A'}
                </p>
                <p>
                    <span className="font-semibold">Secondary Genre:</span> {imp.secondary_genre || 'N/A'}
                </p>
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