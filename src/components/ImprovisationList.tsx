import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Clock, CheckCircle, Music, Image as ImageIcon, AlertTriangle, ArrowRight, Upload, NotebookText, Palette, Send, Loader2 } from 'lucide-react';
import { format, differenceInHours } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox'; // Import Checkbox

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
  artwork_prompt: string | null;
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
  return <Badge variant="outline" className="text-muted-foreground border-dashed">📝 No Notes</Badge>;
};

const getNextAction = (imp: Improvisation) => {
  const hasFile = !!imp.storage_path;
  const hasNotes = imp.notes?.some(n => n.content && n.content.trim().length > 0);
  const hasArtworkPrompt = !!imp.artwork_prompt;
  const hasArtworkUrl = !!imp.artwork_url;
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
  const [selectedCompositions, setSelectedCompositions] = useState<Set<string>>(new Set());

  const { data: improvisations, isLoading, error, refetch } = useQuery<Improvisation[]>({
    queryKey: ['improvisations'],
    queryFn: fetchImprovisations,
    refetchInterval: 5000,
  });

  const handleSelectComposition = (id: string, checked: boolean) => {
    setSelectedCompositions(prev => {
      const newSet = new Set(prev);
      if (checked) {
        newSet.add(id);
      } else {
        newSet.delete(id);
      }
      return newSet;
    });
  };

  const handleSelectAll = (checked: boolean) => {
    if (!improvisations) return;
    if (checked) {
      const allIds = new Set(improvisations.map(imp => imp.id));
      setSelectedCompositions(allIds);
    } else {
      setSelectedCompositions(new Set());
    }
  };

  if (isLoading) {
    return <div className="text-center p-8"><Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" /><p className="mt-2 text-muted-foreground">Loading compositions...</p></div>;
  }

  if (error) {
    return <div className="text-center p-8 text-red-500">Error loading data: {error.message}</div>;
  }

  return (
    <Card className="w-full shadow-card-light dark:shadow-card-dark">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-xl font-bold">Active Compositions</CardTitle>
        <div className="flex items-center space-x-2">
            {selectedCompositions.size > 0 && (
                <Button variant="outline" disabled>
                    Bulk Actions ({selectedCompositions.size})
                </Button>
            )}
            <Button variant="outline" onClick={() => refetch()}>Refresh List</Button>
        </div>
      </CardHeader>
      <CardContent>
        {improvisations && improvisations.length > 0 ? (
          <>
            <div className="flex items-center space-x-2 mb-4 px-2">
                <Checkbox 
                    id="select-all"
                    checked={selectedCompositions.size === improvisations.length && improvisations.length > 0}
                    onCheckedChange={(checked) => handleSelectAll(!!checked)}
                />
                <label htmlFor="select-all" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                    Select All ({selectedCompositions.size} selected)
                </label>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {improvisations.map((imp) => {
                const hasFile = !!imp.storage_path;
                const isStalled = imp.status === 'uploaded' && differenceInHours(new Date(), new Date(imp.created_at)) >= STALLED_THRESHOLD_HOURS;
                const nextAction = getNextAction(imp);
                const Icon = nextAction.icon;
                const isSelected = selectedCompositions.has(imp.id);
                
                return (
                  <Card 
                    key={imp.id} 
                    className={cn(
                      "relative group cursor-pointer transition-all hover:shadow-lg dark:hover:shadow-xl",
                      isStalled ? 'border-l-4 border-red-500 bg-red-50/50 dark:bg-red-950/50' : 'border-l-4 border-transparent',
                      isSelected && 'border-2 border-primary ring-2 ring-primary/50'
                    )}
                    onClick={() => navigate(`/improvisation/${imp.id}`)}
                  >
                    <CardContent className="p-4 flex items-start space-x-4">
                      <div className="absolute top-2 left-2 z-10" onClick={(e) => e.stopPropagation()}>
                        <Checkbox 
                            id={`select-${imp.id}`}
                            checked={isSelected}
                            onCheckedChange={(checked) => handleSelectComposition(imp.id, !!checked)}
                        />
                      </div>
                      
                      <Avatar className="h-16 w-16 rounded-md border border-border/50 shadow-sm flex-shrink-0 mt-1">
                        <AvatarImage src={imp.artwork_url || undefined} alt={imp.generated_name || "Artwork"} />
                        <AvatarFallback className="rounded-md bg-secondary dark:bg-accent">
                          <ImageIcon className="h-8 w-8 text-muted-foreground" />
                        </AvatarFallback>
                      </Avatar>
                      
                      <div className="flex-grow space-y-1">
                        <h3 className="font-semibold text-lg leading-tight flex items-center">
                            {isStalled && <AlertTriangle className="w-4 h-4 mr-2 text-red-500 flex-shrink-0" />}
                            {imp.generated_name || imp.file_name || 'Untitled Idea'}
                        </h3>
                        <p className="text-xs text-muted-foreground">
                            {format(new Date(imp.created_at), 'MMM dd, yyyy')}
                        </p>
                        <div className="flex flex-wrap gap-2 mt-2">
                            {getStatusBadge(imp.status, hasFile)}
                            {getNotesStatus(imp.notes)}
                        </div>
                        <div className="mt-3 flex items-center text-sm font-medium">
                            <Icon className={cn("w-4 h-4 mr-2", nextAction.color)} />
                            <span className={cn(
                                nextAction.label.includes('Analyzing') && 'text-yellow-600 dark:text-yellow-400',
                                nextAction.label.includes('Upload Audio') && 'text-blue-600 dark:text-blue-400',
                                nextAction.label.includes('Ready') && 'text-green-600 dark:text-green-400',
                                nextAction.label.includes('Submit') && 'text-green-600 dark:text-green-400',
                            )}>
                                {nextAction.label}
                            </span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </>
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