import React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Clock, Edit2, AlertTriangle, CheckCircle, RefreshCw } from 'lucide-react';
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
      .eq('user_id', sessionUserId); // Ensure we only count for the current user

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
    queryFn: () => fetchStatusCounts(supabase, session!.user.id), // Use directly imported supabase
    enabled: !isSessionLoading && !!session?.user, // Only enable if session is loaded and user exists
    refetchInterval: 15000, // Changed from 5000 to 15000 (15 seconds)
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
      color: 'text-info dark:text-info-foreground',
      description: 'Idea captured successfully.',
      bg: 'bg-info/10 dark:bg-info/20',
      border: 'border-info',
    },
    { 
      status: 'analyzing', 
      label: 'Processing File',
      count: totalAnalyzing, 
      icon: Clock, 
      color: 'text-warning dark:text-warning-foreground',
      description: 'Title/Artwork generation in progress.',
      bg: 'bg-warning/10 dark:bg-warning/20',
      border: 'border-warning',
    },
    { 
      status: 'failed', 
      label: 'Failed/Error',
      count: totalFailed, 
      icon: AlertTriangle, 
      color: 'text-destructive dark:text-destructive-foreground',
      description: 'Processing failed. Check logs or re-upload.',
      bg: 'bg-destructive/10 dark:bg-destructive/20', 
      border: 'border-destructive', 
    },
    { 
      status: 'completed', 
      label: 'Ready for Prep',
      count: totalCompleted, 
      icon: CheckCircle, 
      color: 'text-success dark:text-success-foreground',
      description: 'Ready for distribution prep.',
      bg: 'bg-success/10 dark:bg-success/20',
      border: 'border-success',
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
              <div key={i} className="flex flex-col items-center justify-center p-4 rounded-xl border h-36">
                <Skeleton className="h-12 w-12 rounded-full mb-2" />
                <Skeleton className="h-10 w-16 mb-1" />
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
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <CardTitle className="text-2xl font-semibold">Improvisation Pipeline ({totalImprovisations} Total)</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {pipelineStages.map((stage) => {
            const Icon = stage.icon;
            const isActive = stage.count > 0;
            const isAnalyzingStage = stage.status === 'analyzing';
            
            return (
              <div 
                key={stage.status}
                className={cn(
                  "flex flex-col items-center justify-center p-4 rounded-xl border transition-all h-36 text-center", // Increased height
                  stage.bg,
                  isActive ? `border-2 ${stage.border}` : 'border-border', // Use border-border for inactive
                  "hover:shadow-md dark:hover:shadow-lg"
                )}
              >
                <div className="h-12 w-12 flex items-center justify-center rounded-full mb-2"> {/* Larger icon container */}
                  <Icon className={cn("h-7 w-7 flex-shrink-0", stage.color, isAnalyzingStage && 'animate-spin')} /> {/* Larger icon */}
                </div>
                
                <p className="text-5xl font-extrabold leading-none mb-1">{stage.count}</p> {/* Much larger count */}
                <h3 className="font-semibold text-sm text-muted-foreground">{stage.label}</h3> {/* Smaller label */}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};

export default ImprovisationPipeline;