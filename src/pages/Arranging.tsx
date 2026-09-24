import React, { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import {
  Plus, Music, ListMusic, KeyRound, Gauge, Tag, Link2,
  NotebookText, Pencil, Trash2, AlertTriangle, RefreshCw, Crown
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { showError, showSuccess } from '@/utils/toast';
import { useSession } from '@/integrations/supabase/session-context';
import { supabase } from '@/integrations/supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Arrangement, ArrangementStatus } from '@/types/arrangement';
import ArrangementDialog from '@/components/ArrangementDialog';

const fetchArrangements = async (supabaseClient: SupabaseClient, sessionUserId: string): Promise<Arrangement[]> => {
  const { data, error } = await supabaseClient
    .from('arrangements')
    .select('*')
    .eq('user_id', sessionUserId)
    .order('updated_at', { ascending: false });

  if (error) throw new Error(error.message);
  return data as Arrangement[];
};

const statusBadgeClass: Record<ArrangementStatus, string> = {
  draft: 'bg-warning text-warning-foreground border-warning',
  in_progress: 'bg-info text-info-foreground border-info',
  completed: 'bg-success text-success-foreground',
  archived: 'bg-muted text-muted-foreground',
};

const statusLabel: Record<ArrangementStatus, string> = {
  draft: 'Draft',
  in_progress: 'In Progress',
  completed: 'Completed',
  archived: 'Archived',
};

const FieldChip: React.FC<{ icon: React.ElementType; label: string }> = ({ icon: Icon, label }) => (
  <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
    <Icon className="h-4 w-4 flex-shrink-0 text-primary" />
    {label}
  </span>
);

const Arranging: React.FC = () => {
  const queryClient = useQueryClient();
  const { session, isLoading: isSessionLoading } = useSession();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Arrangement | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    document.title = 'Arranging - AI Composer Hub';
  }, []);

  const { data: arrangements, isLoading, error, refetch } = useQuery<Arrangement[]>({
    queryKey: ['arrangements'],
    queryFn: () => fetchArrangements(supabase, session!.user.id),
    enabled: !isSessionLoading && !!session?.user,
    refetchInterval: 15000,
  });

  const handleRefetch = () => {
    queryClient.invalidateQueries({ queryKey: ['arrangements'] });
  };

  const handleEdit = (arr: Arrangement) => {
    setEditing(arr);
    setIsEditOpen(true);
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    setIsDeleting(true);
    showSuccess('Deleting arrangement...');

    try {
      const { error } = await supabase
        .from('arrangements')
        .delete()
        .eq('id', deletingId);
      if (error) throw error;

      showSuccess('Arrangement deleted successfully.');
      setDeletingId(null);
      handleRefetch();
    } catch (error) {
      console.error('Failed to delete arrangement:', error);
      showError(`Failed to delete arrangement: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsDeleting(false);
    }
  };

  const totalCount = arrangements?.length ?? 0;
  const completedCount = arrangements?.filter(a => a.status === 'completed').length ?? 0;
  const inProgressCount = arrangements?.filter(a => a.status === 'in_progress').length ?? 0;

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <header className="mb-8 max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-4xl font-bold tracking-tight text-foreground">Arranging</h1>
          <Button
            variant="default"
            className="text-base h-11 px-5 shadow-lg hover:shadow-xl transition-shadow bg-primary hover:bg-primary/90 dark:bg-primary dark:hover:bg-primary/90 flex-shrink-0"
            onClick={() => { setEditing(null); setIsCreateOpen(true); }}
          >
            <Plus className="w-5 h-5 mr-2" /> New Arrangement
          </Button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto space-y-8">

        {isLoading ? (
          <Card>
            <CardHeader className="pb-3">
              <Skeleton className="h-7 w-48" />
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="p-4 border rounded-lg space-y-3">
                    <Skeleton className="h-5 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                    <Skeleton className="h-4 w-1/3" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ) : error ? (
          <Card>
            <CardContent className="text-center p-8">
              <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-destructive" />
              <p className="text-lg font-semibold text-destructive">Failed to load arrangements</p>
              <p className="text-sm text-muted-foreground mt-2 mb-4">{error.message}</p>
              <Button variant="outline" onClick={() => refetch()}>
                <RefreshCw className="h-4 w-4 mr-2" /> Retry
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Summary Pipeline */}
            <Card className="shadow-card-light dark:shadow-card-dark w-full">
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <CardTitle className="text-2xl font-semibold">Arrangement Tracker ({totalCount} Total)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {[
                    { key: 'in_progress', label: 'In Progress', count: inProgressCount, icon: ListMusic, cls: 'bg-info/10 dark:bg-info/20 border-info' },
                    { key: 'completed', label: 'Completed', count: completedCount, icon: Crown, cls: 'bg-success/10 dark:bg-success/20 border-success' },
                    { key: 'total', label: 'Total', count: totalCount, icon: Music, cls: 'bg-primary/10 border-primary' },
                  ].map((stat) => {
                    const Icon = stat.icon;
                    return (
                      <div key={stat.key} className={cn(
                        "flex flex-col items-center justify-center p-4 rounded-xl border text-center h-28",
                        stat.cls
                      )}>
                        <Icon className="h-6 w-6 mb-2 flex-shrink-0 text-primary" />
                        <p className="text-3xl font-extrabold leading-none mb-1">{stat.count}</p>
                        <h3 className="font-semibold text-sm text-muted-foreground">{stat.label}</h3>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Arrangement Cards */}
            {totalCount > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {arrangements!.map((arr) => (
                  <Card
                    key={arr.id}
                    className="relative group cursor-pointer transition-all hover:shadow-lg dark:hover:shadow-xl"
                    onClick={() => handleEdit(arr)}
                  >
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-grow min-w-0">
                          <h3 className="font-semibold text-lg leading-tight flex items-center">
                            <Music className="w-4 h-4 mr-2 text-primary flex-shrink-0" />
                            <span className="truncate">{arr.title || 'Untitled Arrangement'}</span>
                          </h3>
                          {arr.source_track && (
                            <p className="text-sm text-muted-foreground mt-1">
                              Based on: <span className="font-medium text-foreground">{arr.source_track}</span>
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="h-8 w-8" title="Edit" onClick={() => handleEdit(arr)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10" title="Delete" onClick={() => setDeletingId(arr.id)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete this arrangement?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  "{arr.title || 'Untitled Arrangement'}" will be permanently removed. This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
                                  {isDeleting ? 'Deleting...' : 'Delete'}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>

                      <div className="mt-3">
                        <Badge variant="outline" className={cn("font-medium", statusBadgeClass[arr.status])}>
                          {statusLabel[arr.status]}
                        </Badge>
                        <span className="text-xs text-muted-foreground ml-2">
                          Updated {format(new Date(arr.updated_at), 'MMM dd, yyyy')}
                        </span>
                      </div>

                      <div className="flex flex-wrap gap-x-4 gap-y-2 mt-3">
                        {arr.instrumentation && <FieldChip icon={ListMusic} label={arr.instrumentation} />}
                        {arr.key && <FieldChip icon={KeyRound} label={arr.key} />}
                        {arr.tempo && <FieldChip icon={Gauge} label={arr.tempo} />}
                        {arr.genre && <FieldChip icon={Tag} label={arr.genre} />}
                      </div>

                      {(arr.notes || (arr.file_links?.length ?? 0) > 0) && (
                        <div className="mt-3 space-y-1.5">
                          {arr.notes && (
                            <p className="text-sm text-muted-foreground line-clamp-2">
                              <NotebookText className="w-4 h-4 mr-1 inline text-primary" />
                              {arr.notes}
                            </p>
                          )}
                          {arr.file_links && arr.file_links.length > 0 && (
                            <p className="text-sm text-muted-foreground">
                              <Link2 className="w-4 h-4 mr-1 inline text-primary" />
                              {arr.file_links.length} file link{arr.file_links.length > 1 ? 's' : ''}
                            </p>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="shadow-card-light dark:shadow-card-dark w-full">
                <CardContent className="text-center p-12">
                  <ListMusic className="w-16 h-16 mx-auto mb-4 text-primary" />
                  <h2 className="text-2xl font-bold mb-2">No arrangements yet</h2>
                  <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                    Track how you rework your compositions for different ensembles, occasions, or settings.
                    Start by creating your first arrangement!
                  </p>
                  <Button size="lg" className="text-base" onClick={() => { setEditing(null); setIsCreateOpen(true); }}>
                    <Plus className="w-5 h-5 mr-2" /> Create Your First Arrangement
                  </Button>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </main>

      <ArrangementDialog
        open={isCreateOpen || isEditOpen}
        onOpenChange={(open) => {
          setIsCreateOpen(open);
          setIsEditOpen(open);
          if (!open) setEditing(null);
        }}
        arrangement={editing}
        onSaved={handleRefetch}
      />
    </div>
  );
};

export default Arranging;