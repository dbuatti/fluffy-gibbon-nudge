import React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Clock, Edit2, AlertTriangle, CheckCircle, RefreshCw, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSession } from '@/integrations/supabase/session-context';
import { supabase } from '@/integrations/supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Skeleton } from '@/components/ui/skeleton';

interface StatusCount {
  status: string;
  count: number;
}

const fetchStatusCounts = async (supabaseClient: SupabaseClient, sessionUserId: string): Promise<StatusCount[]> => {
  const statuses = ['uploaded', 'analyzing', 'completed', 'failed'];
  const promises = statuses.map(async (status) => {
    const { count, error } = await supabaseClient
      .from('improvisations')
      .select('*', { count: 'exact', head: true })
      .eq('status', status)
      .eq('user_id', sessionUserId);

    if (error) {
      console.error(`Error fetching count for status ${status}:`, error);
      return { status, count: 0 };
    }
    return { status, count: count || 0 };
  });

  const results = await Promise.all(promises);
  return results;
};

const ImprovisationPipeline: React.FC = () => {
  const { session, isLoading: isSessionLoading } = useSession();
  const queryClient = useQueryClient();

  const { data: counts, isLoading, error } = useQuery<StatusCount[]>({
    queryKey: ['improvisationStatusCounts'],
    queryFn: () => fetchStatusCounts(supabase, session!.user.id),
    enabled: !isSessionLoading && !!session?.user,
    refetchInterval: 15000,
  });

  const getCount = (status: string) => counts?.find(c => c.status === status)?.count || 0;

  const totalCompleted = getCount('completed');
  const totalAnalyzing = getCount('analyzing');
  const totalUploaded = getCount('uploaded');
  const totalFailed = getCount('failed');
  const totalImprovisations = totalCompleted + totalAnalyzing + totalUploaded + totalFailed;

  const pipelineStages = [
    {
      status: 'uploaded',
      label: 'Idea Captured',
      count: totalUploaded,
      icon: Edit2,
      iconWrap: 'bg-info/15 text-info dark:text-info-foreground',
      accent: 'text-info dark:text-info-foreground',
      border: 'border-info/40',
      description: 'Idea captured successfully.',
      active: 'text-info dark:text-info-foreground',
    },
    {
      status: 'analyzing',
      label: 'Processing File',
      count: totalAnalyzing,
      icon: Clock,
      iconWrap: 'bg-warning/15 text-warning dark:text-warning-foreground',
      accent: 'text-warning dark:text-warning-foreground',
      border: 'border-warning/40',
      description: 'Title/Artwork generation in progress.',
      active: 'text-warning dark:text-warning-foreground',
    },
    {
      status: 'failed',
      label: 'Failed / Error',
      count: totalFailed,
      icon: AlertTriangle,
      iconWrap: 'bg-destructive/15 text-destructive dark:text-destructive-foreground',
      accent: 'text-destructive dark:text-destructive-foreground',
      border: 'border-destructive/40',
      description: 'Processing failed. Check logs or re-upload.',
      active: 'text-destructive dark:text-destructive-foreground',
    },
    {
      status: 'completed',
      label: 'Ready for Prep',
      count: totalCompleted,
      icon: CheckCircle,
      iconWrap: 'bg-success/15 text-success dark:text-success-foreground',
      accent: 'text-success dark:text-success-foreground',
      border: 'border-success/40',
      description: 'Ready for distribution prep.',
      active: 'text-success dark:text-success-foreground',
    },
  ];

  if (isLoading) {
    return (
      <Card className="shadow-card-light dark:shadow-card-dark w-full">
        <CardHeader className="pb-3">
          <Skeleton className="h-7 w-64" />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex flex-col items-center justify-center p-4 rounded-xl border h-32">
                <Skeleton className="h-10 w-10 rounded-xl mb-2" />
                <Skeleton className="h-8 w-12 mb-1" />
                <Skeleton className="h-4 w-24" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="shadow-card-light dark:shadow-card-dark w-full">
        <CardContent className="text-center p-6">
          <AlertTriangle className="h-10 w-10 mx-auto mb-3 text-destructive" />
          <p className="text-destructive font-semibold">Failed to load pipeline</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => queryClient.invalidateQueries({ queryKey: ['improvisationStatusCounts'] })}>
            <RefreshCw className="h-4 w-4 mr-2" /> Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-card-light dark:shadow-card-dark w-full">
      <CardHeader className="pb-4 flex flex-row items-center justify-between">
        <CardTitle className="text-2xl font-semibold">Improvisation Pipeline</CardTitle>
        <span className="text-sm font-medium text-muted-foreground bg-muted rounded-full px-3 py-1">
          {totalImprovisations} total
        </span>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col lg:flex-row lg:items-stretch gap-2">
          {pipelineStages.map((stage, index) => {
            const Icon = stage.icon;
            const isActive = stage.count > 0;
            const isAnalyzingStage = stage.status === 'analyzing';

            return (
              <React.Fragment key={stage.status}>
                <div
                  className={cn(
                    "flex flex-1 flex-col items-center justify-center gap-2.5 rounded-xl border p-5 text-center transition-all h-auto min-h-[8.5rem]",
                    isActive
                      ? cn("border-2", stage.border, "bg-card shadow-md")
                      : "border-border bg-muted/30 opacity-60 dark:opacity-50"
                  )}
                >
                  <div className={cn("h-11 w-11 rounded-xl flex items-center justify-center transition-transform", stage.iconWrap, isActive && "scale-105")}>
                    <Icon className={cn("h-6 w-6", isAnalyzingStage && isActive && 'animate-spin')} strokeWidth={2.2} />
                  </div>
                  <p className={cn("text-4xl font-extrabold leading-none", isActive ? "text-foreground" : "text-muted-foreground")}>
                    {stage.count}
                  </p>
                  <h3 className={cn("font-semibold text-sm", isActive ? "text-foreground" : "text-muted-foreground")}>
                    {stage.label}
                  </h3>
                </div>
                {index < pipelineStages.length - 1 && (
                  <>
                    <div className="flex items-center justify-center lg:px-0.5 text-muted-foreground/50" aria-hidden>
                      <ChevronRight className="hidden lg:block h-5 w-5" />
                      <ChevronDown className="lg:hidden h-5 w-5" />
                    </div>
                  </>
                )}
              </React.Fragment>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};

export default ImprovisationPipeline;