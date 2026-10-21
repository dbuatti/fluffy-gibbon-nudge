import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Clock, CheckCircle, Music, Image as ImageIcon, AlertTriangle, ArrowRight, NotebookText, Palette, Send, Loader2, Trash2, Download, RefreshCw, PartyPopper, CloudUpload, XCircle, FolderOpen, ExternalLink, Sparkles } from 'lucide-react';
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
import { showSuccess, showError, logError } from '@/utils/toast';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import type { Improvisation } from '@/types/improvisation';
import { displayTitle } from '@/lib/display-title';
import FolderPathLine from '@/components/FolderPathLine';
import { openFolderInFinder } from '@/lib/local-bridge';
import { useLocalBridge } from '@/lib/local-bridge';

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

/**
 * Compact pipeline progress indicator — 5 dots showing where an idea sits:
 * captured → notes → artwork → ready → submitted. Replaces a stack of badges
 * with something scannable across a whole list. Tooltip lists each stage.
 */
const StageDots: React.FC<{ imp: Improvisation; className?: string }> = ({ imp, className }) => {
  if (imp.status === 'analyzing') {
    return (
      <span title="AI analyzing…" className={cn("flex items-center", className)}>
        <Loader2 className="h-3.5 w-3.5 animate-spin text-warning" />
      </span>
    );
  }
  if (imp.status === 'failed') {
    return (
      <span title="Processing failed" className={cn("flex items-center", className)}>
        <XCircle className="h-3.5 w-3.5 text-destructive" />
      </span>
    );
  }

  const hasNotes = !!imp.notes?.some(n => n.content && n.content.trim().length > 0);
  const submitted = !!imp.is_submitted_to_distrokid && !!imp.is_submitted_to_insight_timer;
  const stages: [string, boolean][] = [
    ['Idea captured', true],
    ['Notes added', hasNotes],
    ['Artwork ready', !!imp.artwork_url],
    ['Ready for release', !!imp.is_ready_for_release],
    ['Submitted to platforms', submitted],
  ];
  const doneCount = stages.filter(([, done]) => done).length;

  return (
    <div
      className={cn("flex items-center gap-1", className)}
      title={`Progress: ${doneCount}/5 stages — ${stages.map(([l, d]) => `${d ? '✓' : '○'} ${l}`).join('  ')}`}
      aria-label={`Progress ${doneCount} of 5 stages`}
    >
      {stages.map(([label, done]) => (
        <span
          key={label}
          className={cn(
            "h-1.5 w-1.5 rounded-full transition-colors",
            done ? "bg-primary" : "bg-muted-foreground/25",
          )}
        />
      ))}
    </div>
  );
};

const getStatusAccent = (imp: Improvisation, isStalled: boolean) => {
  if (isStalled) return 'border-l-destructive bg-destructive/5 dark:bg-destructive/10';
  const isSubmitted = !!imp.is_submitted_to_distrokid && !!imp.is_submitted_to_insight_timer;
  if (isSubmitted || (imp.status === 'completed' && imp.is_ready_for_release)) return 'border-l-success bg-success/5 dark:bg-success/10';
  if (imp.status === 'analyzing') return 'border-l-warning bg-warning/5 dark:bg-warning/10';
  if (imp.status === 'failed') return 'border-l-destructive bg-destructive/5 dark:bg-destructive/10';
  return 'border-l-primary/25';
};

/**
 * Computes the single most useful next step for an improvisation.
 * `tab` deep-links into the detail page so the button actually starts
 * the work instead of dumping you on the generic overview.
 */
const getNextAction = (imp: Improvisation): { label: string; icon: typeof CheckCircle; color: string; tab: string | null } => {
  const hasNotes = imp.notes?.some(n => n.content && n.content.trim().length > 0);
  const hasArtworkPrompt = !!imp.artwork_prompt;
  const hasArtworkUrl = !!imp.artwork_url;
  const isReady = !!imp.is_ready_for_release;
  const isSubmitted = !!imp.is_submitted_to_distrokid && !!imp.is_submitted_to_insight_timer;

  if (isSubmitted) {
    return { label: 'View Submissions', icon: CheckCircle, color: 'text-success', tab: 'analysis-distro' };
  }

  if (imp.status === 'analyzing') {
    return { label: 'AI Analyzing…', icon: Clock, color: 'text-warning', tab: null };
  }
  if (imp.status === 'completed') {
    if (!hasNotes) {
      return { label: 'Add Creative Notes', icon: NotebookText, color: 'text-primary', tab: 'creative-hub' };
    }
    if (!hasArtworkPrompt) {
      return { label: 'Generate Artwork Prompt', icon: Palette, color: 'text-primary', tab: 'assets-downloads' };
    }
    // If artwork_prompt exists but artwork_url is null, it means artwork needs manual upload
    if (hasArtworkPrompt && !hasArtworkUrl) {
      return { label: 'Upload Artwork', icon: ImageIcon, color: 'text-primary', tab: 'assets-downloads' };
    }
    if (!isReady) {
      return { label: 'Mark Ready for Release', icon: CheckCircle, color: 'text-success', tab: 'analysis-distro' };
    }
    return { label: 'Submit to DistroKid', icon: Send, color: 'text-success', tab: 'analysis-distro' };
  }
  if (imp.status === 'failed') {
    return { label: 'Inspect Failure', icon: AlertTriangle, color: 'text-destructive', tab: 'analysis-distro' };
  }

  // status === 'uploaded' — idea captured; open notes / next prep
  return { label: 'Open Workflow', icon: ArrowRight, color: 'text-muted-foreground', tab: 'creative-hub' };
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

  // Reset accumulated list when search/filter changes
  React.useEffect(() => {
    setPage(0);
    setAllImprovisations([]);
  }, [searchTerm, filterStatus, sortOption]);

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
  const [deleteTarget, setDeleteTarget] = useState<{ imp: Improvisation; deleteLocal: boolean } | null>(null);
  const [deleting, setDeleting] = useState(false);

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
            if (storageError) logError(`ImprovisationList.deleteAudio:${id}`, storageError);
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
      logError('ImprovisationList.bulkDelete', error);
      showError(`Failed to delete improvisations: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsDeletingBulk(false);
    }
  };

  const { deleteLocalFolder } = useLocalBridge();

  const handleDelete = async (imp: Improvisation) => {
    const folderPath = imp.logic_project_path || imp.nas_folder_path;
    const folderName = folderPath ? folderPath.split('/').filter(Boolean).pop() : null;
    
    // Custom dialog with three options: Cancel, Delete App Only, Delete App + Local Folder
    const choice = window.confirm(
      `Delete "${displayTitle(imp.generated_name || imp.file_name)}"?\n\n` +
      `This will delete the app record and audio file from Supabase.\n\n` +
      (folderPath
        ? `Local Logic folder found:\n${folderPath}\n\n` +
          `Click OK to ALSO delete the local Logic folder (moves to Trash, recoverable).\n` +
          `Click Cancel to keep the local folder and only delete the app record.`
        : `No local Logic folder linked. Only the app record will be deleted.`)
    );
    
    if (!choice && folderPath) {
      // User clicked Cancel but there's a folder - they want app-only delete
      return handleDeleteAppOnly(imp);
    }
    
    if (choice && folderPath) {
      // User clicked OK - delete both app and local folder
      return handleDeleteAppAndLocal(imp);
    }
    
    // If no folder path, just delete app
    if (!folderPath) {
      return handleDeleteAppOnly(imp);
    }
  };

  const handleDeleteAppOnly = async (imp: Improvisation) => {
    if (!window.confirm(`Delete app record for "${displayTitle(imp.generated_name || imp.file_name)}"?\n\nThis removes the entry from Composer Hub and deletes the audio file from Supabase. The local Logic folder (if any) will NOT be touched.`)) {
      return;
    }
    setDeleting(true);
    try {
      // Delete audio file from Supabase Storage
      if (imp.storage_path) {
        const { error: storageError } = await supabase.storage
          .from('piano_improvisations')
          .remove([imp.storage_path]);
        if (storageError) logError(`ImprovisationList.deleteAudio:${imp.id}`, storageError);
      }
      // Delete record from database
      const { error: dbError } = await supabase
        .from('improvisations')
        .delete()
        .eq('id', imp.id);
      if (dbError) throw dbError;
      showSuccess('Improvisation deleted from app.');
      queryClient.invalidateQueries({ queryKey: ['improvisations'] });
      queryClient.invalidateQueries({ queryKey: ['improvisationStatusCounts'] });
    } catch (error) {
      logError('ImprovisationList.deleteSingle', error);
      showError(`Failed to delete: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteAppAndLocal = async (imp: Improvisation) => {
    const folderPath = imp.logic_project_path || imp.nas_folder_path;
    if (!folderPath) return handleDeleteAppOnly(imp);
    
    setDeleting(true);
    try {
      // First, delete the local Logic folder via the bridge (moves to Trash)
      const res = await deleteLocalFolder(folderPath);
      if (!res.success) {
        const proceed = window.confirm(
          `Could not delete local folder via bridge: ${res.error}\n\n` +
          `Delete the app record anyway?`
        );
        if (!proceed) return;
      }
      
      // Delete audio file from Supabase Storage
      if (imp.storage_path) {
        const { error: storageError } = await supabase.storage
          .from('piano_improvisations')
          .remove([imp.storage_path]);
        if (storageError) logError(`ImprovisationList.deleteAudioAndLocal:${imp.id}`, storageError);
      }
      // Delete record from database
      const { error: dbError } = await supabase
        .from('improvisations')
        .delete()
        .eq('id', imp.id);
      if (dbError) throw dbError;
      showSuccess('Improvisation deleted from app and local folder moved to Trash.');
      queryClient.invalidateQueries({ queryKey: ['improvisations'] });
      queryClient.invalidateQueries({ queryKey: ['improvisationStatusCounts'] });
    } catch (error) {
      logError('ImprovisationList.deleteSingleAndLocal', error);
      showError(`Failed to delete: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setDeleting(false);
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
      logError('ImprovisationList.bulkExport', error);
      showError(`Failed to export improvisations: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsExportingBulk(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 rounded-lg border px-3 py-2">
              <Skeleton className="h-4 w-4 rounded" />
              <Skeleton className="h-9 w-9 rounded-md flex-shrink-0" />
              <div className="flex-grow min-w-0 space-y-1.5">
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-3 w-1/3" />
              </div>
              <Skeleton className="h-6 w-24 rounded-md flex-shrink-0" />
            </div>
          ))}
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
                          imp.file_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          imp.original_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          imp.logic_project_path?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesFilterStatus = filterStatus === 'all' || 
                                (filterStatus === 'uploaded' && imp.status === 'uploaded') ||
                                (filterStatus === 'needs-audio' && imp.status === 'uploaded' && !imp.storage_path) ||
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
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
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
      <CardHeader className="flex flex-row items-center justify-between space-y-0 gap-3 pb-3">
        <CardTitle className="text-xl font-semibold flex items-center gap-2.5 min-w-0">
          <span className="truncate">Active Improvisations</span>
          <span className="text-xs font-medium text-muted-foreground bg-muted rounded-full px-2.5 py-0.5 flex-shrink-0">
            {totalCount} total
          </span>
        </CardTitle>
        <div className="flex items-center gap-1 flex-shrink-0">
          <label
            htmlFor="select-all"
            className="flex items-center gap-2 text-sm text-muted-foreground mr-2 cursor-pointer select-none hover:text-foreground transition-colors"
            title="Select all visible improvisations"
          >
            <Checkbox
              id="select-all"
              checked={sortedImprovisations.length > 0 && selectedImprovisations.size === sortedImprovisations.length}
              onCheckedChange={(checked) => handleSelectAll(!!checked)}
              className="h-4 w-4"
            />
            <span className="hidden sm:inline">Select all</span>
          </label>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => refetch()} title="Refresh improvisations" aria-label="Refresh improvisations">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {sortedImprovisations && sortedImprovisations.length > 0 ? (
          <>
            {/* Bulk Action Toolbar */}
            {hasSelectedItems && (
                <div className="flex items-center justify-between gap-2 p-2 pl-3 mb-3 bg-primary/10 dark:bg-primary/20 border border-primary/30 rounded-lg">
                    <span className="text-sm font-medium text-primary">
                        {selectedImprovisations.size} selected
                    </span>
                    <div className="flex items-center gap-1.5">
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs text-muted-foreground"
                            onClick={() => setSelectedImprovisations(new Set())}
                        >
                            Clear
                        </Button>
                        <Separator orientation="vertical" className="h-5" />
                        <Button 
                            variant="secondary" 
                            size="sm" 
                            className="h-7 px-2.5 text-xs"
                            onClick={handleBulkExport} 
                            disabled={isExportingBulk}
                        >
                            {isExportingBulk ? (
                                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                            ) : (
                                <Download className="h-3.5 w-3.5 mr-1.5" />
                            )}
                            Export
                        </Button>
                        <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                            <AlertDialogTrigger asChild>
                                <Button variant="destructive" size="sm" className="h-7 px-2.5 text-xs" disabled={isDeletingBulk}>
                                    {isDeletingBulk ? (
                                        <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                                    ) : (
                                        <Trash2 className="h-3.5 w-3.5 mr-1.5" />
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
                    </div>
                </div>
            )}

            <div className={cn(
                viewMode === 'grid'
                  ? "grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
                  : "flex flex-col gap-1.5"
            )}>
              {sortedImprovisations.map((imp) => {
                const isStalled = imp.status === 'uploaded' && differenceInHours(new Date(), new Date(imp.created_at)) >= STALLED_THRESHOLD_HOURS;
                const nextAction = getNextAction(imp);
                const Icon = nextAction.icon;
                const isSelected = selectedImprovisations.has(imp.id);
                const title = displayTitle(imp.generated_name || imp.file_name);
                const dateLabel = format(new Date(imp.created_at), 'MMM d, yyyy');
                const openDetail = () => navigate(`/improvisation/${imp.id}${nextAction.tab ? `?tab=${nextAction.tab}` : ''}`);
                const openDefault = () => navigate(`/improvisation/${imp.id}`);

                if (viewMode === 'grid') {
                  return (
                    <Card
                      key={imp.id}
                      className={cn(
                        "group cursor-pointer transition-all duration-200 hover:shadow-lg dark:hover:shadow-none hover:-translate-y-0.5 overflow-hidden",
                        getStatusAccent(imp, isStalled),
                        isSelected && 'ring-2 ring-primary border-primary'
                      )}
                      onClick={openDefault}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDefault(); } }}
                    >
                      <CardContent className="p-3.5 flex flex-col gap-2.5">
                        <div className="flex items-start gap-2.5 min-w-0">
                          <div onClick={(e) => e.stopPropagation()} className="pt-0.5">
                            <Checkbox
                              id={`select-g-${imp.id}`}
                              checked={isSelected}
                              onCheckedChange={(checked) => handleSelectImprovisation(imp.id, !!checked)}
                              className="h-4 w-4"
                              title={`Select: ${title}`}
                            />
                          </div>
                          <Avatar className="h-9 w-9 rounded-md overflow-hidden border border-border/60 flex-shrink-0">
                            <AvatarImage src={imp.artwork_url || undefined} alt="" className="object-cover" />
                            <AvatarFallback className="rounded-md bg-muted">
                              <ImageIcon className="h-4 w-4 text-muted-foreground" />
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 flex-1">
                            <h3 className="text-sm font-semibold leading-snug line-clamp-2 flex items-start gap-1.5">
                              {isStalled && <span title="Stalled — captured but untouched"><AlertTriangle className="w-3.5 h-3.5 mt-0.5 text-destructive flex-shrink-0" /></span>}
                              <span className="min-w-0 break-words">{title}</span>
                            </h3>
                            <FolderPathLine imp={imp} className="mt-1" />
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-2 pl-8">
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 text-muted-foreground border-border/60">
                            {dateLabel}
                          </Badge>
                          <StageDots imp={imp} />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-destructive/70 hover:text-destructive hover:bg-destructive/10"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(imp);
                            }}
                            disabled={deleting}
                            title="Delete this improvisation (option to also delete local folder)"
                            aria-label="Delete improvisation"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (nextAction.tab) {
                              openDetail();
                            } else {
                              openDefault();
                            }
                          }}
                          disabled={!nextAction.tab}
                          className={cn(
                            "ml-8 flex items-center gap-1.5 text-xs font-medium rounded-md px-2 py-1.5 -mx-2 transition-colors",
                            nextAction.tab
                              ? "hover:bg-accent cursor-pointer"
                              : "opacity-60 cursor-default"
                          )}
                        >
                          <Icon className={cn("h-3.5 w-3.5", nextAction.color)} />
                          <span className={nextAction.color}>{nextAction.label}</span>
                          {nextAction.tab && <ArrowRight className="h-3 w-3 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />}
                        </button>
                      </CardContent>
                    </Card>
                  );
                }

                // List view — dense single-row layout
                return (
                  <div
                    key={imp.id}
                    className={cn(
                      "group flex items-center gap-3 rounded-lg border px-3 py-2 cursor-pointer transition-colors",
                      getStatusAccent(imp, isStalled),
                      isSelected && 'ring-1 ring-primary border-primary bg-primary/5'
                    )}
                    style={{ borderLeftWidth: 3 }}
                    onClick={openDefault}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDefault(); } }}
                  >
                    <div onClick={(e) => e.stopPropagation()} className="flex-shrink-0">
                      <Checkbox
                        id={`select-${imp.id}`}
                        checked={isSelected}
                        onCheckedChange={(checked) => handleSelectImprovisation(imp.id, !!checked)}
                        className="h-4 w-4"
                        title={`Select: ${title}`}
                      />
                    </div>

                    <Avatar className="h-9 w-9 rounded-md overflow-hidden border border-border/60 flex-shrink-0">
                      <AvatarImage src={imp.artwork_url || undefined} alt="" className="object-cover" />
                      <AvatarFallback className="rounded-md bg-muted">
                        <ImageIcon className="h-4 w-4 text-muted-foreground" />
                      </AvatarFallback>
                    </Avatar>

                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-semibold leading-tight flex items-center gap-1.5 min-w-0">
                        {isStalled && <span title="Stalled — captured but untouched"><AlertTriangle className="w-3.5 h-3.5 text-destructive flex-shrink-0" /></span>}
                        <span className="truncate">{title}</span>
                        {getStatusBadge(imp)}
                      </h3>
                      <div className="flex items-center gap-2 mt-0.5 min-w-0">
                        <FolderPathLine imp={imp} className="min-w-0 flex-1" />
                        <span className="text-[11px] text-muted-foreground/70 flex-shrink-0 whitespace-nowrap">{dateLabel}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 flex-shrink-0">
                      <StageDots imp={imp} className="hidden md:flex" />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-destructive/70 hover:text-destructive hover:bg-destructive/10"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(imp);
                        }}
                        disabled={deleting}
                        title="Delete this improvisation (option to also delete local folder)"
                        aria-label="Delete improvisation"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (nextAction.tab) {
                            openDetail();
                          } else {
                            openDefault();
                          }
                        }}
                        disabled={!nextAction.tab}
                        title={nextAction.tab ? `Opens on: ${nextAction.label}` : nextAction.label}
                        className={cn(
                          "flex items-center gap-1.5 text-xs font-medium rounded-md px-2.5 py-1.5 max-w-[200px] transition-colors",
                          nextAction.tab
                            ? "hover:bg-accent cursor-pointer"
                            : "opacity-60 cursor-default"
                        )}
                      >
                        <Icon className={cn("h-3.5 w-3.5 flex-shrink-0", nextAction.color)} />
                        <span className={cn("truncate hidden sm:inline", nextAction.color)}>{nextAction.label}</span>
                        {nextAction.tab && <ArrowRight className="h-3 w-3 text-muted-foreground group-hover:translate-x-0.5 transition-transform flex-shrink-0" />}
                      </button>
                    </div>
                  </div>
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
            {totalCount === 0 ? (
              <>
                <p className="text-lg font-medium text-foreground">No improvisations yet</p>
                <p className="text-sm mt-1">Record your first take to get started.</p>
                <Button className="mt-4" onClick={() => navigate('/')}>
                  <Sparkles className="w-4 h-4 mr-2" /> Go to Home
                </Button>
              </>
            ) : (
              <>
                <p className="text-lg font-medium text-foreground">No improvisations match</p>
                <p className="text-sm mt-1">Try adjusting your search or filter to see more ideas.</p>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ImprovisationList;