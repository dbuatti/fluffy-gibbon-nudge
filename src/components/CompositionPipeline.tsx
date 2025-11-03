import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Clock, Edit2, AlertTriangle, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSession } from '@/integrations/supabase/session-context';
import { supabase } from '@/integrations/supabase/client';


interface StatusCount {
  status: string;
  count: number;
}

const fetchStatusCounts = async (supabaseClient: any, sessionUserId: string): Promise<StatusCount[]> => {
  console.log("fetchStatusCounts: Attempting to fetch counts for user:", sessionUserId);
  console.log("fetchStatusCounts: Supabase client session:", supabaseClient.auth.currentSession);
  const statuses = ['uploaded', 'analyzing', 'completed', 'failed'];
  const promises = statuses.map(async (status) => {
    const { count, error } = await supabaseClient
      .from('compositions') // FIX: Changed table name from 'improvisations' to 'compositions'
      .select('*', { count: 'exact', head: true })
      .eq('status', status)
      .eq('user_id', sessionUserId);

    if (error) {
      console.error(`Error fetching count for status ${status}:`, error);
      console.error(`Full Supabase error for status ${status}:`, error); 
      return { status, count: 0 };
    }
    return { status, count: count || 0 };
  });

  const results = await Promise.all(promises);
  console.log("fetchStatusCounts: Fetched counts:", results);
  return results;
};

const CompositionPipeline: React.FC = () => {
  const { session, isLoading: isSessionLoading } = useSession();
  console.log("CompositionPipeline: Render. Session:", session, "isSessionLoading:", isSessionLoading);

  const { data: counts, isLoading, error } = useQuery<StatusCount[]>({
    queryKey: ['compositionStatusCounts'],
    queryFn: () => fetchStatusCounts(supabase, session!.user.id),
    enabled: !isSessionLoading && !!session?.user,
    refetchInterval: 5000,
  });

  const getCount = (status: string) => counts?.find(c => c.status === status)?.count || 0;
  
  const totalCompleted = getCount('completed');
  const totalAnalyzing = getCount('analyzing');
  const totalUploaded = getCount('uploaded');
  const totalFailed = getCount('failed');
  const totalCompositions = totalCompleted + totalAnalyzing + totalUploaded + totalFailed;

  const pipelineStages = [
    { 
      status: 'uploaded', 
      label: 'Idea Captured',
      count: totalUploaded, 
      icon: Edit2, 
      color: 'text-info dark:text-info-foreground',
      description: 'Awaiting audio file upload.',
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
      color: 'text-error dark:text-error-foreground',
      description: 'Processing failed. Check logs or re-upload.',
      bg: 'bg-error/10 dark:bg-error/20', 
      border: 'border-error', 
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
    return <div className="text-center p-4"><Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" /><p className="mt-2 text-muted-foreground">Loading compositions...</p></div>;
  }

  if (error) {
    return <div className="text-center p-4 text-error dark:text-error-foreground">Error loading pipeline status. Please check your network connection.</div>;
  }

  return (
    <Card className="shadow-card-light dark:shadow-card-dark w-full">
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <CardTitle className="text-2xl font-semibold">Composition Pipeline ({totalCompositions} Total)</CardTitle>
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
                  "flex flex-col items-center justify-center p-4 rounded-xl border transition-all h-36 text-center",
                  stage.bg,
                  isActive ? `border-2 ${stage.border}` : 'border-border',
                  "hover:shadow-md dark:hover:shadow-lg"
                )}
              >
                <div className="h-12 w-12 flex items-center justify-center rounded-full mb-2">
                  <Icon className={cn("h-7 w-7 flex-shrink-0", stage.color, isAnalyzingStage && 'animate-spin')} />
                </div>
                
                <p className="text-5xl font-extrabold leading-none mb-1">{stage.count}</p>
                <h3 className="font-semibold text-sm text-muted-foreground">{stage.label}</h3>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};

export default CompositionPipeline;