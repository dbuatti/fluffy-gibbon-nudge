import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Clock, CheckCircle, Music, Image as ImageIcon, AlertTriangle, ArrowRight, Upload, NotebookText, Palette, Send, Loader2, ListOrdered, Grid3X3, Trash2, Download } from 'lucide-react';
import { format, differenceInHours } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { useSession } from '@/integrations/supabase/session-context'; // Import useSession
import { showSuccess, showError } from '@/utils/toast';

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
  // Include all fields for export
  user_id: string;
  is_piano: boolean | null;
  is_improvisation: boolean | null;
  primary_genre: string | null;
  secondary_genre: string | null;
  analysis_data: any | null;
  user_tags: string[] | null;
  is_instrumental: boolean | null;
  is_original_song: boolean | null;
  has_explicit_lyrics: boolean | null;
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
}

const STALLED_THRESHOLD_HOURS = 48;

const fetchImprovisations = async (supabase: any, sessionUserId: string): Promise<Improvisation[]> => {
  console.log("fetchImprovisations: Attempting to fetch improvisations for user:", sessionUserId);
  const { data, error } = await supabase
    .from('improvisations')
    .select('*') // Select all fields for potential export
    .eq('user_id', sessionUserId) // Filter by user_id
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  console.log("fetchImprovisations: Fetched data:", data);
  return data as Improvisation[];
};

// Unified Status Badge Function
const getStatusBadge = (status: Improvisation['status'], hasFile: boolean) => {
  if (!hasFile && status === 'uploaded') {
    return <Badge variant="outline" className="bg-info text-info-foreground border-info">💡 Needs Audio</Badge>;
  }
  
  switch (status) {
    case 'analyzing':
      return <Badge variant="outline" className="bg-warning text-warning-foreground border-warning"><Clock className="w-3 h-3 mr-1 animate-spin" /> Analyzing</Badge>;
    case 'completed':
      return <Badge variant="default" className="bg-success text-success-foreground">✅ Ready</Badge>;
    case 'failed':
      return <Badge variant="destructive" className="bg-error text-error-foreground">❌ Failed</Badge>;
    default:
      return <Badge variant="outline" className="text-muted-foreground">Uploaded</Badge>;
  }
};

// Notes Status Badge - less prominent
const getNotesStatusBadge = (notes: NoteTab[] | null) => {
  const hasContent = notes?.some(n => n.content && n.content.trim().length > 0);
  
  if (hasContent) {
    return <Badge variant="secondary" className="text-neutral-foreground">✍️ Notes</Badge>; // Neutral color
  }
  return null; // Don't show if no notes
};

const getNextAction = (imp: Improvisation) => {
  const hasFile = !!imp.storage_path;
  const hasNotes = imp.notes?.some(n => n.content && n.content.trim().length > 0);
  const hasArtworkPrompt = !!imp.artwork_prompt;
  const hasArtworkUrl = !!imp.artwork_url; // This will be null unless manually uploaded
  const isReady = !!imp.is_ready_for_release;

  if (!hasFile) {
    return { label: 'Upload Audio', icon: Upload, color: 'text-primary', type: 'manual' };
  }
  if (imp.status === 'analyzing') {
    return { label: 'AI Analyzing...', icon: Clock, color: 'text-warning', type: 'ai' };
  }
  if (imp.status === 'completed') {
    if (!hasNotes) {
      return { label: 'Add Creative Notes', icon: NotebookText, color: 'text-primary', type: 'manual' };
    }
    if (!hasArtworkPrompt) {
      return { label: 'Generate Artwork Prompt', icon: Palette, color: 'text-primary', type: 'ai' };
    }
    // If artwork_prompt exists but artwork_url is null, it means artwork needs manual upload
    if (hasArtworkPrompt && !hasArtworkUrl) {
      return { label: 'Upload Artwork', icon: ImageIcon, color: 'text-primary', type: 'manual' };
    }
    if (!isReady) {
      return { label: 'Mark Ready for Release', icon: CheckCircle, color: 'text-success', type: 'manual' };
    }
    return { label: 'Submit to DistroKid', icon: Send, color: 'text-success', type: 'manual' };
  }
  
  return { label: 'View Details', icon: ArrowRight, color: 'text-muted-foreground', type: 'manual' };
};

interface ImprovisationListProps {
  viewMode: 'grid' | 'list';
  setViewMode: (mode: 'grid' | 'list') => void; // Added setViewMode prop
  searchTerm: string;
  filterStatus: string;
  sortOption: string;
}

const ImprovisationList: React.FC<ImprovisationListProps> = ({ viewMode, setViewMode, searchTerm, filterStatus, sortOption }) => {
  const navigate = useNavigate();
  const { session, isLoading: isSessionLoading, supabase } = useSession(); // Use useSession
  const queryClient = useQueryClient();
  const [selectedCompositions, setSelectedCompositions] = useState<Set<string>>(new Set());
  const [isDeletingBulk, setIsDeletingBulk] = useState(false);
  const [isExportingBulk, setIsExportingBulk] = useState(false);

  console.log("ImprovisationList: Render. Session:", session, "isSessionLoading:", isSessionLoading);

  const { data: improvisations, isLoading, error, refetch } = useQuery<Improvisation[]>({
    queryKey: ['improvisations'],
    queryFn: () => fetchImprovisations(supabase, session!.user.id), // Pass supabase client and user ID to fetcher
    enabled: !isSessionLoading && !!session?.user, // Only enable if session is loaded and user exists
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

  const handleBulkDelete = async () => {
    if (selectedCompositions.size === 0 || !window.confirm(`Are you sure you want to delete ${selectedCompositions.size} compositions? This action cannot be undone.`)) {
      return;
    }

    setIsDeletingBulk(true);
    showSuccess(`Deleting ${selectedCompositions.size} compositions...`);

    try {
      for (const id of selectedCompositions) {
        const impToDelete = improvisations?.find(imp => imp.id === id);
        if (impToDelete) {
          // 1. Delete audio file from Supabase Storage (if exists)
          if (impToDelete.storage_path) {
            const { error: storageError } = await supabase.storage
              .from('piano_improvisations')
              .remove([impToDelete.storage_path]);
            if (storageError) console.error(`Failed to delete audio file for ${id}:`, storageError);
          }
          // 2. Delete artwork from Supabase Storage (if manually uploaded and artwork_url is a path)
          //    Currently, artwork_url is just a URL, so this part is effectively skipped.
          //    If manual artwork upload is implemented to a Supabase bucket, this logic would need to be updated.

          // 3. Delete record from database
          const { error: dbError } = await supabase
            .from('improvisations')
            .delete()
            .eq('id', id);
          if (dbError) throw dbError;
        }
      }
      showSuccess(`${selectedCompositions.size} compositions deleted successfully.`);
      setSelectedCompositions(new Set()); // Clear selection
      queryClient.invalidateQueries({ queryKey: ['improvisations'] });
      queryClient.invalidateQueries({ queryKey: ['compositionStatusCounts'] });
    } catch (error) {
      console.error('Bulk deletion failed:', error);
      showError(`Failed to delete compositions: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsDeletingBulk(false);
    }
  };

  const handleBulkExport = async () => {
    if (selectedCompositions.size === 0) {
      showError("No compositions selected for export.");
      return;
    }

    setIsExportingBulk(true);
    showSuccess(`Exporting ${selectedCompositions.size} compositions' metadata...`);

    try {
      const { data, error: fetchError } = await supabase
        .from('improvisations')
        .select('*') // Fetch all details for selected compositions
        .in('id', Array.from(selectedCompositions));

      if (fetchError) throw fetchError;

      const exportData = JSON.stringify(data, null, 2);
      const blob = new Blob([exportData], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `compositions_export_${format(new Date(), 'yyyyMMdd_HHmmss')}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      showSuccess(`${selectedCompositions.size} compositions exported successfully.`);
    } catch (error) {
      console.error('Bulk export failed:', error);
      showError(`Failed to export compositions: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsExportingBulk(false);
    }
  };

  if (isLoading) {
    return <div className="text-center p-8"><Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" /><p className="mt-2 text-muted-foreground">Loading compositions...</p></div>;
  }

  if (error) {
    return <div className="text-center p-8 text-error dark:text-error-foreground">Error loading data: {error.message}</div>;
  }

  const hasSelectedItems = selectedCompositions.size > 0;

  // --- Filtering Logic ---
  const filteredImprovisations = improvisations?.filter(imp => {
    const matchesSearch = searchTerm === '' || 
                          imp.generated_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          imp.file_name?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesFilterStatus = filterStatus === 'all' || 
                                (filterStatus === 'uploaded' && imp.status === 'uploaded' && !imp.storage_path) || // "Needs Audio"
                                (filterStatus === 'analyzing' && imp.status === 'analyzing') ||
                                (filterStatus === 'completed' && imp.status === 'completed') ||
                                (filterStatus === 'failed' && imp.status === 'failed');
    
    return matchesSearch && matchesFilterStatus;
  }) || [];

  // --- Sorting Logic ---
  const sortedImprovisations = [...filteredImprovisations].sort((a, b) => {
    if (sortOption === 'created_at_desc') {
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    }
    if (sortOption === 'created_at_asc') {
      return new Date(a.created_at).getTime() - new Date(a.created_at).getTime();
    }
    if (sortOption === 'name_asc') {
      const nameA = (a.generated_name || a.file_name || '').toLowerCase();
      const nameB = (b.generated_name || b.file_name || '').toLowerCase();
      return nameA.localeCompare(nameB);
    }
    if (sortOption === 'name_desc') {
      const nameA = (a.generated_name || a.file_name || '').toLowerCase();
      const nameB = (b.generated_name || b.file_name || '').toLowerCase();
      return nameB.localeCompare(nameA);
    }
    return 0;
  });


  return (
    <Card className="w-full shadow-card-light dark:shadow-card-dark">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-2xl font-semibold">Active Compositions</CardTitle>
        <div className="flex items-center space-x-2">
            <Button variant="outline" size="sm" onClick={() => setViewMode('grid')} className={cn(viewMode === 'grid' && 'bg-accent text-accent-foreground')}>
                <Grid3X3 className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setViewMode('list')} className={cn(viewMode === 'list' && 'bg-accent text-accent-foreground')}>
                <ListOrdered className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => refetch()}>Refresh</Button>
        </div>
      </CardHeader>
      <CardContent>
        {sortedImprovisations && sortedImprovisations.length > 0 ? (
          <>
            {/* Bulk Action Toolbar */}
            {hasSelectedItems && (
                <div className="flex items-center justify-between p-3 mb-4 bg-primary/10 dark:bg-primary/20 border border-primary/30 rounded-lg">
                    <div className="flex items-center space-x-2">
                        <Checkbox 
                            id="select-all-toolbar"
                            checked={selectedCompositions.size === sortedImprovisations.length}
                            onCheckedChange={(checked) => handleSelectAll(!!checked)}
                            className="h-5 w-5"
                        />
                        <label htmlFor="select-all-toolbar" className="text-sm font-medium leading-none text-primary-foreground">
                            {selectedCompositions.size} selected
                        </label>
                    </div>
                    <div className="flex space-x-2">
                        <Button 
                            variant="destructive" 
                            size="sm" 
                            onClick={handleBulkDelete} 
                            disabled={isDeletingBulk}
                        >
                            {isDeletingBulk ? (
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                                <Trash2 className="h-4 w-4 mr-2" />
                            )}
                            Delete
                        </Button>
                        <Button 
                            variant="secondary" 
                            size="sm" 
                            onClick={handleBulkExport} 
                            disabled={isExportingBulk}
                        >
                            {isExportingBulk ? (
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                                <Download className="h-4 w-4 mr-2" />
                            )}
                            Export
                        </Button>
                        <Button variant="secondary" size="sm" disabled>Move</Button>
                        {/* Add more bulk actions here */}
                    </div>
                </div>
            )}

            {/* Main Select All Checkbox (only if no items selected for toolbar) */}
            {!hasSelectedItems && (
                <div className="flex items-center space-x-2 mb-4 px-2">
                    <Checkbox 
                        id="select-all"
                        checked={selectedCompositions.size === sortedImprovisations.length && sortedImprovisations.length > 0}
                        onCheckedChange={(checked) => handleSelectAll(!!checked)}
                        className="h-5 w-5"
                    />
                    <label htmlFor="select-all" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                        Select All
                    </label>
                </div>
            )}

            <div className={cn(
                "grid gap-4",
                viewMode === 'grid' ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3" : "grid-cols-1"
            )}>
              {sortedImprovisations.map((imp) => {
                const hasFile = !!imp.storage_path;
                const isStalled = imp.status === 'uploaded' && differenceInHours(new Date(), new Date(imp.created_at)) >= STALLED_THRESHOLD_HOURS;
                const nextAction = getNextAction(imp);
                const Icon = nextAction.icon;
                const isSelected = selectedCompositions.has(imp.id);
                const notesBadge = getNotesStatusBadge(imp.notes);
                
                return (
                  <Card 
                    key={imp.id} 
                    className={cn(
                      "relative group cursor-pointer transition-all hover:shadow-lg dark:hover:shadow-xl",
                      isStalled ? 'border-l-4 border-error dark:border-error-foreground bg-error/5 dark:bg-error/10' : 'border-l-4 border-transparent',
                      isSelected && 'border-2 border-primary ring-2 ring-primary/50',
                      viewMode === 'list' && 'flex items-center p-4'
                    )}
                    onClick={() => navigate(`/improvisation/${imp.id}`)}
                  >
                    <CardContent className={cn(
                        "p-4 flex items-center space-x-4",
                        viewMode === 'list' && 'w-full'
                    )}>
                      <div className="flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                        <Checkbox 
                            id={`select-${imp.id}`}
                            checked={isSelected}
                            onCheckedChange={(checked) => handleSelectComposition(imp.id, !!checked)}
                            className="h-5 w-5"
                        />
                      </div>
                      
                      <Avatar className="h-20 w-20 rounded-md border border-border/50 shadow-sm flex-shrink-0">
                        <AvatarImage src={imp.artwork_url || undefined} alt={imp.generated_name || "Artwork"} />
                        <AvatarFallback className="rounded-md bg-secondary dark:bg-accent">
                          <ImageIcon className="h-10 w-10 text-muted-foreground" />
                        </AvatarFallback>
                      </Avatar>
                      
                      <div className="flex-grow space-y-1">
                        <h3 className="font-semibold text-lg leading-tight flex items-center">
                            {isStalled && <AlertTriangle className="w-4 h-4 mr-2 text-error flex-shrink-0" />}
                            {imp.generated_name || imp.file_name || 'Untitled Idea'}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                            {format(new Date(imp.created_at), 'MMM dd, yyyy')}
                        </p>
                        <div className="flex flex-wrap gap-2 mt-2">
                            {getStatusBadge(imp.status, hasFile)}
                            {notesBadge}
                        </div>
                        <Button 
                            variant="ghost" 
                            size="sm" 
                            className={cn("mt-3 h-8 px-3 text-sm justify-start w-fit", nextAction.color)} 
                            onClick={(e) => { e.stopPropagation(); navigate(`/improvisation/${imp.id}`); }}
                        >
                            <Icon className={cn(
                                "w-4 h-4 mr-2", 
                                nextAction.label.includes('Analyzing') && 'text-warning dark:text-warning-foreground',
                                nextAction.label.includes('Upload Audio') && 'text-primary dark:text-primary-foreground',
                                nextAction.label.includes('Ready') && 'text-success dark:text-success-foreground',
                                nextAction.label.includes('Submit') && 'text-success dark:text-success-foreground',
                                nextAction.label.includes('Notes') && 'text-primary dark:text-primary-foreground',
                                nextAction.label.includes('Artwork') && 'text-primary dark:text-primary-foreground',
                            )} />
                            <span className={cn(
                                nextAction.label.includes('Analyzing') && 'text-warning dark:text-warning-foreground',
                                nextAction.label.includes('Upload Audio') && 'text-primary dark:text-primary-foreground',
                                nextAction.label.includes('Ready') && 'text-success dark:text-success-foreground',
                                nextAction.label.includes('Submit') && 'text-success dark:text-success-foreground',
                                nextAction.label.includes('Notes') && 'text-primary dark:text-primary-foreground',
                                nextAction.label.includes('Artwork') && 'text-primary dark:text-primary-foreground',
                            )}>
                                {nextAction.label}
                            </span>
                            <ArrowRight className="w-3 h-3 ml-2" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </>
        ) : (
          <div className="text-center p-8 text-muted-foreground">
            <Music className="w-12 h-12 mx-auto mb-4" />
            <p className="text-lg font-medium">No ideas captured yet.</p>
            <p className="text-sm mt-2">Use the "Capture New Idea" button above to start your creative journey!</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ImprovisationList;