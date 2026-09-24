import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Clock, CheckCircle, Music, Image as ImageIcon, AlertTriangle, ArrowRight, NotebookText, Palette, Send, Loader2, Trash2, Download, RefreshCw, PartyPopper, CloudUpload, XCircle, FilePen } from 'lucide-react';
import { format, differenceInHours } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { useSession } from '@/integrations/supabase/session-context';
import { supabase } from '@/integrations/supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';
import { showSuccess, showError } from '@/utils/toast';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import type { Improvisation, NoteTab } from '@/types/improvisation';

const STALLED_THRESHOLD_HOURS = 24;
const PAGE_SIZE = 20;

const fetchImprovisations = async (supabaseClient: SupabaseClient, sessionUserId: string, page: number): Promise<{ data: Improvisation[]; total: number }> => {
  const from = page * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const { data, error, count } = await supabaseClient
    .from('improvisations')
    .select('*', { count: 'exact' })
    .eq('user_id', sessionUserId)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) throw new Error(error.message);
  return { data: data as Improvisation[], total: count ?? 0 };
};

// Unified Status Badge Function
const getStatusBadge = (imp: Improvisation) => {
  const isSubmitted = !!imp.is_submitted_to_distrokid && !!imp.is_submitted_to_insight_timer;

  if (isSubmitted) {
    return (
      <Badge variant="default" className="bg-success text-success-foreground border-success">
        <PartyPopper className="w-3 h-3 mr-1" /> Submitted!
      </Badge>
    );
  }

  switch (imp.status) {
    case 'analyzing':
      return <Badge variant="outline" className="bg-warning/15 text-warning-foreground border-warning/40"><Clock className="w-3 h-3 mr-1 animate-spin" /> Analyzing</Badge>;
    case 'completed':
      if (imp.is_ready_for_release) {
        return <Badge variant="default" className="bg-success/15 text-success border-success/40"><CheckCircle className="w-3 h-3 mr-1" /> Ready</Badge>;
      }
      return <Badge variant="outline" className="text-muted-foreground"><CloudUpload className="w-3 h-3 mr-1" /> Uploaded</Badge>;
    case 'failed':
      return <Badge variant="destructive" className="bg-destructive/15 text-destructive border-destructive/40"><XCircle className="w-3 h-3 mr-1" /> Failed</Badge>;
    default:
      return <Badge variant="outline" className="text-muted-foreground"><CloudUpload className="w-3 h-3 mr-1" /> Uploaded</Badge>;
  }
};

// Notes Status Badge - less prominent
const getNotesStatusBadge = (notes: NoteTab[] | null) => {
  const hasContent = notes?.some(n => n.content && n.content.trim().length > 0);

  if (hasContent) {
    return <Badge variant="secondary" className="text-neutral-foreground"><FilePen className="w-3 h-3 mr-1" /> Notes</Badge>;
  }
  return null;
};

const getStatusAccent = (imp: Improvisation, isStalled: boolean) => {
  if (isStalled) return 'border-l-destructive bg-destructive/5 dark:bg-destructive/10';
  const isSubmitted = !!imp.is_submitted_to_distrokid && !!imp.is_submitted_to_insight_timer;
  if (isSubmitted || (imp.status === 'completed' && imp.is_ready_for_release)) return 'border-l-success bg-success/5 dark:bg-success/10';
  if (imp.status === 'analyzing') return 'border-l-warning bg-warning/5 dark:bg-warning/10';
  if (imp.status === 'failed') return 'border-l-destructive bg-destructive/5 dark:bg-destructive/10';
  return 'border-l-primary/25';
};

const getNextAction = (imp: Improvisation) => {
  const hasNotes = imp.notes?.some(n => n.content && n.content.trim().length > 0);
  const hasArtworkPrompt = !!imp.artwork_prompt;
  const hasArtworkUrl = !!imp.artwork_url;
  const isReady = !!imp.is_ready_for_release;
  const isSubmitted = !!imp.is_submitted_to_distrokid && !!imp.is_submitted_to_insight_timer;

  if (isSubmitted) {
    return { label: 'View Submissions', icon: CheckCircle, color: 'text-success', type: 'manual' };
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
  setViewMode: (mode: 'grid' | 'list') => void;
  searchTerm: string;
  filterStatus: string;
  sortOption: string;
}

const ImprovisationList: React.FC<ImprovisationListProps> = ({ viewMode, setViewMode, searchTerm, filterStatus, sortOption }) => {
  const navigate = useNavigate();
  const { session, isLoading: isSessionLoading } = useSession();
  const queryClient = useQueryClient();
  const [selectedImprovisations, setSelectedImprovisations] = useState<Set<string>>(new Set());
  const [isDeletingBulk, setIsDeletingBulk] = useState(false);
  const [isExportingBulk, setIsExportingBulk] = useState(false);
  const [page, setPage] = useState(0);
  const [allImprovisations, setAllImprovisations] = useState<Improvisation[]>([]);

  const { data: pageData, isLoading, error, refetch } = useQuery<{ data: Improvisation[]; total: number }>({
    queryKey: ['improvisations', page],
    queryFn: () => fetchImprovisations(supabase, session!.user.id, page),
    enabled: !isSessionLoading && !!session?.user,
    refetchInterval: 15000,
  });

  const improvisations = pageData?.data;
  const totalCount = pageData?.total ?? 0;
  const hasMore = allImprovisations.length + (improvisations?.length ?? 0) < totalCount;

  React.useEffect(() => {
    if (improvisations) {
      setAllImprovisations(prev => {
        const existingIds = new Set(prev.map(i => i.id));
        const newItems = improvisations.filter(i => !existingIds.has(i.id));
        if (page === 0) return [...newItems];
        return [...prev, ...newItems];
      });
    }
  }, [improvisations, page]);

  const handleLoadMore = () => {
    setPage(prev => prev + 1);
  };

  const handleSelectImprovisation = (id: string, checked: boolean) => {
    setSelectedImprovisations(prev => {
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
      setSelectedImprovisations(allIds);
    } else {
      setSelectedImprovisations(new Set());
    }
  };

  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const handleBulkDelete = async () => {
    if (selectedImprovisations.size === 0) return;

    setIsDeletingBulk(true);
    showSuccess(`Deleting ${selectedImprovisations.size} improvisations...`);

    try {
      for (const id of selectedImprovisations) {
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
      showSuccess(`${selectedImprovisations.size} improvisations deleted successfully.`);
      setSelectedImprovisations(new Set());
      queryClient.invalidateQueries({ queryKey: ['improvisations'] });
      queryClient.invalidateQueries({ queryKey: ['improvisationStatusCounts'] });
    } catch (error) {
      console.error('Bulk deletion failed:', error);
      showError(`Failed to delete improvisations: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsDeletingBulk(false);
    }
  };

  const handleBulkExport = async () => {
    if (selectedImprovisations.size === 0) {
      showError("No improvisations selected for export.");
      return;
    }

    setIsExportingBulk(true);
    showSuccess(`Exporting ${selectedImprovisations.size} improvisations' metadata...`);

    try {
      const { data, error: fetchError } = await supabase
        .from('improvisations')
        .select('*')
        .in('id', Array.from(selectedImprovisations));

      if (fetchError) throw fetchError;

      const exportData = JSON.stringify(data, null, 2);
      const blob = new Blob([exportData], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `improvisations_export_${format(new Date(), 'yyyyMMdd_HHmmss')}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      showSuccess(`${selectedImprovisations.size} improvisations exported successfully.`);
    } catch (error) {
      console.error('Bulk export failed:', error);
      showError(`Failed to export improvisations: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsExportingBulk(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <Skeleton className="h-7 w-48" />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-start space-x-4 p-4 border rounded-lg">
                <Skeleton className="h-20 w-20 rounded-md flex-shrink-0" />
                <div className="flex-grow space-y-2">
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                  <div className="flex gap-2 mt-2">
                    <Skeleton className="h-5 w-16 rounded-full" />
                    <Skeleton className="h-5 w-16 rounded-full" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="text-center p-8">
          <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-destructive" />
          <p className="text-lg font-semibold text-destructive">Failed to load improvisations</p>
          <p className="text-sm text-muted-foreground mt-2 mb-4">{error.message}</p>
          <Button variant="outline" onClick={() => queryClient.invalidateQueries({ queryKey: ['improvisations'] })}>
            <RefreshCw className="h-4 w-4 mr-2" /> Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  const hasSelectedItems = selectedImprovisations.size > 0;

  const allItems = allImprovisations;

  // --- Filtering Logic ---
  const filteredImprovisations = allItems.filter(imp => {
    const matchesSearch = searchTerm === '' || 
                          imp.generated_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          imp.file_name?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesFilterStatus = filterStatus === 'all' || 
                                (filterStatus === 'uploaded' && imp.status === 'uploaded' && !imp.storage_path) ||
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
        <CardTitle className="text-2xl font-semibold flex items-center gap-3">
          Active Improvisations
          <span className="text-sm font-medium text-muted-foreground bg-muted rounded-full px-3 py-1">
            {totalCount} total
          </span>
        </CardTitle>
        <Button variant="ghost" size="sm" onClick={() => refetch()} title="Refresh improvisations" aria-label="Refresh improvisations">
          <RefreshCw className="h-4 w-4" />
        </Button>
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
                            checked={selectedImprovisations.size === sortedImprovisations.length}
                            onCheckedChange={(checked) => handleSelectAll(!!checked)}
                            className="h-5 w-5"
                            title="Select all visible improvisations"
                        />
                        <label htmlFor="select-all-toolbar" className="text-sm font-medium leading-none text-primary-foreground">
                            {selectedImprovisations.size} selected
                        </label>
                    </div>
                    <div className="flex space-x-2">
                        <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                            <AlertDialogTrigger asChild>
                                <Button variant="destructive" size="sm" disabled={isDeletingBulk}>
                                    {isDeletingBulk ? (
                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    ) : (
                                        <Trash2 className="h-4 w-4 mr-2" />
                                    )}
                                    Delete
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>Delete {selectedImprovisations.size} improvisations?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        This action cannot be undone. All audio files and metadata will be permanently deleted.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={handleBulkDelete} className="bg-destructive hover:bg-destructive/90">
                                        {isDeletingBulk ? 'Deleting...' : 'Delete All'}
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
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
                        checked={selectedImprovisations.size === sortedImprovisations.length && sortedImprovisations.length > 0}
                        onCheckedChange={(checked) => handleSelectAll(!!checked)}
                        className="h-5 w-5"
                        title="Select all visible improvisations"
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
                const isStalled = imp.status === 'uploaded' && differenceInHours(new Date(), new Date(imp.created_at)) >= STALLED_THRESHOLD_HOURS;
                const nextAction = getNextAction(imp);
                const Icon = nextAction.icon;
                const isSelected = selectedImprovisations.has(imp.id);
                const notesBadge = getNotesStatusBadge(imp.notes);

                return (
                  <Card
                    key={imp.id}
                    className={cn(
                      "relative group cursor-pointer transition-all duration-200 hover:shadow-xl dark:hover:shadow-none hover:-translate-y-0.5",
                      "border-l-4",
                      getStatusAccent(imp, isStalled),
                      isStalled && 'border-l-destructive',
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
                            onCheckedChange={(checked) => handleSelectImprovisation(imp.id, !!checked)}
                            className="h-5 w-5"
                            title={`Select improvisation: ${imp.generated_name || imp.file_name || 'Untitled Idea'}`}
                        />
                      </div>

                      <Avatar className="h-20 w-20 rounded-xl overflow-hidden border border-border/50 shadow-sm flex-shrink-0">
                        <AvatarImage src={imp.artwork_url || undefined} alt={imp.generated_name || "Artwork"} className="object-cover group-hover:scale-105 transition-transform duration-300" />
                        <AvatarFallback className="rounded-xl bg-gradient-to-br from-primary/10 to-violet-600/10">
                          <ImageIcon className="h-10 w-10 text-muted-foreground" />
                        </AvatarFallback>
                      </Avatar>

                      <div className="flex-grow space-y-1">
                        <h3 className="font-semibold text-lg leading-tight flex items-center text-foreground">
                            {isStalled && <AlertTriangle className="w-4 h-4 mr-2 text-destructive flex-shrink-0" />}
                            {imp.generated_name || imp.file_name || 'Untitled Idea'}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                            {format(new Date(imp.created_at), 'MMM dd, yyyy')}
                        </p>
                        <div className="flex flex-wrap gap-2 mt-2">
                            {getStatusBadge(imp)}
                            {notesBadge}
                        </div>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="mt-3 h-8 px-3 text-sm justify-start w-fit hover:bg-accent"
                            onClick={(e) => { e.stopPropagation(); navigate(`/improvisation/${imp.id}`); }}
                        >
                            <Icon className={cn("w-4 h-4 mr-2", nextAction.color)} />
                            <span className={cn("text-sm", nextAction.color)}>
                                {nextAction.label}
                            </span>
                            <ArrowRight className="w-3 h-3 ml-2 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {hasMore && (
              <div className="flex justify-center mt-6">
                <Button variant="outline" onClick={handleLoadMore}>
                  Load More ({allItems.length} / {totalCount})
                </Button>
              </div>
            )}
          </>
        ) : (
          <div className="text-center p-10 text-muted-foreground">
            <div className="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
              <Music className="w-8 h-8" />
            </div>
            <p className="text-lg font-medium text-foreground">No improvisations match</p>
            <p className="text-sm mt-1">Try adjusting your search or filter to see more ideas.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ImprovisationList;