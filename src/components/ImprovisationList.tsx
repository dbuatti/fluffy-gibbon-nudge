import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Clock, CheckCircle, Music, Image as ImageIcon, AlertTriangle, ArrowRight, Upload, NotebookText, Palette, Send, Sparkles, User } from 'lucide-react';
import { format, differenceInHours } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';

interface NoteTab {
  id: string;
  title: string;
  color: string;
  content: string;
}

interface Improvisation {
  id: string;
  file_name: string | null;
  status: 'uploaded' | 'analyzing' | 'completed' | 'failed';
  generated_name: string | null;
  artwork_url: string | null;
  artwork_prompt: string | null; // NEW FIELD
  created_at: string;
  notes: NoteTab[] | null;
  storage_path: string | null;
  is_ready_for_release: boolean | null;
}

const STALLED_THRESHOLD_HOURS = 48;

const fetchImprovisations = async (): Promise<Improvisation[]> => {
  const { data, error } = await supabase
    .from('improvisations')
    .select('id, file_name, status, generated_name, artwork_url, artwork_prompt, created_at, notes, storage_path, is_ready_for_release')
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return data as Improvisation[];
};

const getStatusBadge = (status: Improvisation['status'], hasFile: boolean) => {
  if (!hasFile && status === 'uploaded') {
    return <Badge className="bg-blue-500 hover:bg-blue-500 text-white dark:bg-blue-700 dark:hover:bg-blue-700">💡 Needs Audio</Badge>;
  }
  
  switch (status) {
    case 'analyzing':
      return <Badge variant="secondary" className="bg-yellow-400 text-gray-900 dark:bg-yellow-600 dark:text-gray-900"><Clock className="w-3 h-3 mr-1 animate-spin" /> Analyzing</Badge>;
    case 'completed':
      return <Badge className="bg-success hover:bg-success/90 text-success-foreground">✅ Ready</Badge>;
    case 'failed':
      return <Badge variant="destructive">❌ Failed</Badge>;
    default:
      return <Badge variant="outline">Uploaded</Badge>;
  }
};

const getNotesStatus = (notes: NoteTab[] | null) => {
  const hasContent = notes?.some(n => n.content && n.content.trim().length > 0);
  
  if (hasContent) {
    return <Badge variant="default" className="bg-purple-500 hover:bg-purple-500 dark:bg-purple-700 dark:hover:bg-purple-700">✍️ Notes Added</Badge>;
  }
  return <Badge variant="outline" className="text-muted-foreground border-dashed">📝 Needs Notes</Badge>;
};

const getNextAction = (imp: Improvisation) => {
  const hasFile = !!imp.storage_path;
  const hasNotes = imp.notes?.some(n => n.content && n.content.trim().length > 0);
  const hasArtworkPrompt = !!imp.artwork_prompt; // Check for prompt
  const hasArtworkUrl = !!imp.artwork_url; // Check for uploaded image
  const isReady = !!imp.is_ready_for_release;

  if (!hasFile) {
    return { label: 'Upload Audio', icon: Upload, color: 'text-blue-500', type: 'manual' };
  }
  if (imp.status === 'analyzing') {
    return { label: 'AI Analyzing...', icon: Clock, color: 'text-yellow-500', type: 'ai' };
  }
  if (imp.status === 'completed') {
    if (!hasNotes) {
      return { label: 'Add Creative Notes', icon: NotebookText, color: 'text-purple-500', type: 'manual' };
    }
    if (!hasArtworkPrompt) {
      return { label: 'Generate Artwork Prompt', icon: Palette, color: 'text-orange-500', type: 'ai' };
    }
    if (!hasArtworkUrl) {
      return { label: 'Upload Artwork', icon: ImageIcon, color: 'text-orange-500', type: 'manual' };
    }
    if (!isReady) {
      return { label: 'Mark Ready for Release', icon: CheckCircle, color: 'text-success', type: 'manual' };
    }
    return { label: 'Submit to DistroKid', icon: Send, color: 'text-success', type: 'manual' };
  }
  
  return { label: 'View Details', icon: ArrowRight, color: 'text-muted-foreground', type: 'manual' };
};

const ImprovisationList: React.FC = () => {
  const navigate = useNavigate();
  const { data: improvisations, isLoading, error, refetch } = useQuery<Improvisation[]>({
    queryKey: ['improvisations'],
    queryFn: fetchImprovisations,
    refetchInterval: 5000,
  });

  if (isLoading) {
    return <div className="text-center p-8">Loading compositions...</div>;
  }

  if (error) {
    return <div className="text-center p-8 text-red-500">Error loading data: {error.message}</div>;
  }

  return (
    <Card className="w-full shadow-card-light dark:shadow-card-dark">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-2xl font-bold">My Ideas & Compositions</CardTitle>
        <Button variant="outline" onClick={() => refetch()}>Refresh List</Button>
      </CardHeader>
      <CardContent>
        {improvisations && improvisations.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[60px]">Art</TableHead>
                <TableHead>Title</TableHead>
                <TableHead className="hidden md:table-cell">Status</TableHead>
                <TableHead className="hidden lg:table-cell">Notes</TableHead>
                <TableHead className="text-right w-[200px]">Next Step</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {improvisations.map((imp) => {
                const hasFile = !!imp.file_name;
                const isStalled = imp.status === 'uploaded' && differenceInHours(new Date(), new Date(imp.created_at)) >= STALLED_THRESHOLD_HOURS;
                const nextAction = getNextAction(imp);
                const Icon = nextAction.icon;
                
                return (
                  <TableRow 
                    key={imp.id} 
                    className={cn(
                      "cursor-pointer transition-colors group",
                      isStalled ? 'bg-red-50/50 hover:bg-red-100/70 dark:bg-red-950/50 dark:hover:bg-red-900/70 border-l-4 border-red-500' : 'hover:bg-muted/50'
                    )}
                    onClick={() => navigate(`/improvisation/${imp.id}`)}
                  >
                    <TableCell>
                      <Avatar className="h-10 w-10 rounded-md border border-border/50 shadow-sm">
                        <AvatarImage src={imp.artwork_url || undefined} alt={imp.generated_name || "Artwork"} />
                        <AvatarFallback className="rounded-md bg-secondary dark:bg-accent">
                          <ImageIcon className="h-5 w-5 text-muted-foreground" />
                        </AvatarFallback>
                      </Avatar>
                    </TableCell>
                    <TableCell className="font-medium flex flex-col items-start">
                        <span className="flex items-center">
                            {isStalled && <AlertTriangle className="w-4 h-4 mr-2 text-red-500 flex-shrink-0" />}
                            {imp.generated_name || imp.file_name || 'Untitled Idea'}
                        </span>
                        <span className="text-xs text-muted-foreground mt-0.5">
                            {format(new Date(imp.created_at), 'MMM dd, yyyy')}
                        </span>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">{getStatusBadge(imp.status, hasFile)}</TableCell>
                    <TableCell className="hidden lg:table-cell">{getNotesStatus(imp.notes)}</TableCell>
                    <TableCell className="text-right">
                        <Badge 
                            variant="secondary" 
                            className={cn(
                                "font-semibold text-xs px-3 py-1.5 flex items-center justify-end ml-auto w-fit",
                                nextAction.color,
                                nextAction.label.includes('Analyzing') && 'bg-yellow-100 dark:bg-yellow-900/50',
                                nextAction.label.includes('Upload Audio') && 'bg-blue-100 dark:bg-blue-900/50',
                                nextAction.label.includes('Ready') && 'bg-success/10 dark:bg-success/20',
                                nextAction.label.includes('Submit') && 'bg-success/10 dark:bg-success/20',
                            )}
                        >
                            {nextAction.type === 'ai' ? (
                                <Sparkles className={cn("w-3 h-3 mr-1.5", nextAction.label.includes('Analyzing') && 'animate-spin')} />
                            ) : (
                                <User className="w-3 h-3 mr-1.5" />
                            )}
                            {nextAction.label}
                        </Badge>
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