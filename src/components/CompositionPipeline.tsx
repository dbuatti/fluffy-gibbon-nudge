import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Upload, Clock, CheckCircle, ArrowRight, Edit2, Sparkles, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StatusCount {
  status: string;
  count: number;
}

const fetchStatusCounts = async (): Promise<StatusCount[]> => {
  const statuses = ['uploaded', 'analyzing', 'completed', 'failed'];
  const promises = statuses.map(async (status) => {
    const { count, error } = await supabase
      .from('improvisations')
      .select('*', { count: 'exact', head: true })
      .eq('status', status);

    if (error) {
      console.error(`Error fetching count for status ${status}:`, error);
      // Return 0 on error to prevent the entire pipeline from failing
      return { status, count: 0 };
    }
    return { status, count: count || 0 };
  });

  const results = await Promise.all(promises);
  return results;
};

interface CompositionPipelineProps {
  headerAction: React.ReactNode;
}

const CompositionPipeline: React.FC<CompositionPipelineProps> = ({ headerAction }) => {
  const { data: counts, isLoading, error } = useQuery<StatusCount[]>({
    queryKey: ['compositionStatusCounts'],
    queryFn: fetchStatusCounts,
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
      color: 'text-blue-500 dark:text-blue-400',
      description: 'Awaiting audio file upload.',
      bg: 'bg-blue-500/10 dark:bg-blue-900/20',
      border: 'border-blue-500',
    },
    { 
      status: 'analyzing', 
      label: 'Processing File',
      count: totalAnalyzing, 
      icon: Clock, 
      color: 'text-yellow-500 dark:text-yellow-400',
      description: 'Title/Artwork generation in progress.',
      bg: 'bg-yellow-500/10 dark:bg-yellow-900/20',
      border: 'border-yellow-500',
    },
    { 
      status: 'failed', 
      label: 'Failed/Error',
      count: totalFailed, 
      icon: AlertTriangle, 
      color: 'text-destructive dark:text-destructive', 
      description: 'Processing failed. Check logs or re-upload.',
      bg: 'bg-destructive/10 dark:bg-destructive/20', 
      border: 'border-destructive', 
    },
    { 
      status: 'completed', 
      label: 'Ready for Prep',
      count: totalCompleted, 
      icon: Sparkles, 
      color: 'text-success dark:text-success',
      description: 'Ready for distribution prep.',
      bg: 'bg-success/10 dark:bg-success/20',
      border: 'border-success',
    },
  ];

  if (isLoading) {
    return <div className="text-center p-4"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div>;
  }

  if (error) {
    // Display a more user-friendly error message if the query fails
    return <div className="text-center p-4 text-red-500">Error loading pipeline status. Please check your network connection.</div>;
  }

  return (
    <Card className="shadow-card-light dark:shadow-card-dark w-full">
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <CardTitle className="text-xl font-bold">Composition Pipeline ({totalCompositions} Total)</CardTitle>
        {headerAction}
      </CardHeader>
      <CardContent>
        <div className="flex flex-col md:flex-row items-stretch justify-between gap-4">
          {pipelineStages.map((stage, index) => {
            const Icon = stage.icon;
            const isActive = stage.count > 0;
            const isAnalyzingStage = stage.status === 'analyzing';
            
            return (
              <React.Fragment key={stage.status}>
                <div 
                  className={cn(
                    "flex-1 p-4 rounded-xl border transition-all flex items-center space-x-4",
                    stage.bg,
                    isActive ? stage.border : 'border-gray-200 dark:border-gray-700',
                    "hover:shadow-md dark:hover:shadow-lg"
                  )}
                >
                  <Icon className={cn("h-8 w-8 flex-shrink-0", stage.color, isAnalyzingStage && 'animate-spin')} />
                  <div>
                    <h3 className="font-semibold text-base">{stage.label}</h3>
                    <p className="text-3xl font-extrabold leading-none">{stage.count}</p>
                  </div>
                </div>
                {index < pipelineStages.length - 1 && (
                  <div className="hidden md:flex items-center justify-center">
                    <ArrowRight className="h-5 w-5 text-muted-foreground" />
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};

export default CompositionPipeline;