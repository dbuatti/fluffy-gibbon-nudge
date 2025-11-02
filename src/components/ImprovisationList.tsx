import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Clock, CheckCircle, XCircle, Music, Button } from 'lucide-react';
import { format } from 'date-fns';

interface Improvisation {
  id: string;
  file_name: string;
  status: 'uploaded' | 'analyzing' | 'completed' | 'failed';
  generated_name: string | null;
  created_at: string;
}

const fetchImprovisations = async (): Promise<Improvisation[]> => {
  const { data, error } = await supabase
    .from('improvisations')
    .select('id, file_name, status, generated_name, created_at')
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return data as Improvisation[];
};

const getStatusBadge = (status: Improvisation['status']) => {
  switch (status) {
    case 'analyzing':
      return <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300"><Clock className="w-3 h-3 mr-1 animate-spin" /> Analyzing</Badge>;
    case 'completed':
      return <Badge className="bg-green-100 text-green-800 hover:bg-green-100 dark:bg-green-900 dark:text-green-300"><CheckCircle className="w-3 h-3 mr-1" /> Completed</Badge>;
    case 'failed':
      return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" /> Failed</Badge>;
    default:
      return <Badge variant="outline">Uploaded</Badge>;
  }
};

const ImprovisationList: React.FC = () => {
  const { data: improvisations, isLoading, error, refetch } = useQuery<Improvisation[]>({
    queryKey: ['improvisations'],
    queryFn: fetchImprovisations,
    refetchInterval: 5000, // Poll every 5 seconds to check analysis status
  });

  if (isLoading) {
    return <div className="text-center p-8">Loading improvisations...</div>;
  }

  if (error) {
    return <div className="text-center p-8 text-red-500">Error loading data: {error.message}</div>;
  }

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-2xl font-bold">My Improvisations</CardTitle>
        <Button variant="outline" onClick={() => refetch()}>Refresh</Button>
      </CardHeader>
      <CardContent>
        {improvisations && improvisations.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>File Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Generated Name</TableHead>
                <TableHead className="text-right">Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {improvisations.map((imp) => (
                <TableRow key={imp.id}>
                  <TableCell className="font-medium">{imp.file_name}</TableCell>
                  <TableCell>{getStatusBadge(imp.status)}</TableCell>
                  <TableCell>
                    {imp.generated_name || (imp.status === 'completed' ? 'No name generated' : 'Awaiting analysis...')}
                  </TableCell>
                  <TableCell className="text-right">
                    {format(new Date(imp.created_at), 'MMM dd, yyyy HH:mm')}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="text-center p-8 text-muted-foreground">
            <Music className="w-10 h-10 mx-auto mb-4" />
            <p>No improvisations uploaded yet. Upload a file to start the analysis!</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ImprovisationList;