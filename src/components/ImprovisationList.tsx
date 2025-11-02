import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Clock, CheckCircle, XCircle, Music, Image as ImageIcon, NotebookText } from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useNavigate } from 'react-router-dom'; // Import useNavigate

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
  artwork_url: string | null; // New field
  created_at: string;
  notes: NoteTab[] | null; // New field
}

const fetchImprovisations = async (): Promise<Improvisation[]> => {
  const { data, error } = await supabase
    .from('improvisations')
    .select('id, file_name, status, generated_name, artwork_url, created_at, notes') // Fetch notes
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return data as Improvisation[];
};

const getStatusBadge = (status: Improvisation['status'], hasFile: boolean) => {
  if (!hasFile && status === 'uploaded') {
    return <Badge variant="outline" className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300"><Music className="w-3 h-3 mr-1" /> Idea Captured</Badge>;
  }
  
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

const getNotesStatus = (notes: NoteTab[] | null) => {
  // Check if the notes array exists and if at least one note zone has content
  const hasContent = notes?.some(n => n.content && n.content.trim().length > 0);
  
  if (hasContent) {
    return <Badge variant="default" className="bg-blue-500 hover:bg-blue-500 dark:bg-blue-700 dark:hover:bg-blue-700"><NotebookText className="w-3 h-3 mr-1" /> Notes Added</Badge>;
  }
  return <Badge variant="outline" className="text-muted-foreground border-dashed"><NotebookText className="w-3 h-3 mr-1" /> Needs Notes</Badge>;
};

const ImprovisationList: React.FC = () => {
  const navigate = useNavigate(); // Initialize useNavigate
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
        <CardTitle className="text-2xl font-bold">My Ideas & Compositions</CardTitle>
        <Button variant="outline" onClick={() => refetch()}>Refresh</Button>
      </CardHeader>
      <CardContent>
        {improvisations && improvisations.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[60px]">Art</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Notes</TableHead> {/* New Column */}
                <TableHead>File Name</TableHead>
                <TableHead className="text-right">Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {improvisations.map((imp) => {
                const hasFile = !!imp.file_name;
                return (
                  <TableRow 
                    key={imp.id} 
                    className="cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => navigate(`/improvisation/${imp.id}`)} // Use programmatic navigation
                  >
                    <TableCell>
                      <Avatar className="h-10 w-10 rounded-md">
                        <AvatarImage src={imp.artwork_url || undefined} alt={imp.generated_name || "Artwork"} />
                        <AvatarFallback className="rounded-md">
                          <ImageIcon className="h-5 w-5 text-muted-foreground" />
                        </AvatarFallback>
                      </Avatar>
                    </TableCell>
                    <TableCell className="font-medium">{imp.generated_name || imp.file_name || 'Untitled Idea'}</TableCell>
                    <TableCell>{getStatusBadge(imp.status, hasFile)}</TableCell>
                    <TableCell>{getNotesStatus(imp.notes)}</TableCell> {/* New Cell */}
                    <TableCell className="text-sm text-muted-foreground">
                      {imp.file_name || 'No audio file attached'}
                    </TableCell>
                    <TableCell className="text-right">
                      {format(new Date(imp.created_at), 'MMM dd, yyyy HH:mm')}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        ) : (
          <div className="text-center p-8 text-muted-foreground">
            <Music className="w-10 h-10 mx-auto mb-4" />
            <p>No ideas captured yet. Use the "Capture New Idea" button above to start!</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ImprovisationList;