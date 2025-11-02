import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Upload, Clock, CheckCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface StatusCount {
  status: string;
  count: number;
}

const fetchStatusCounts = async (): Promise<StatusCount[]> => {
  const { data, error } = await (supabase
    .from('improvisations')
    .select('status, count') as any) // Use type assertion to allow rollup()
    .rollup();

  if (error) throw new Error(error.message);
  
  // Supabase rollup returns an array of objects like [{ status: 'completed', count: 5 }]
  return data as StatusCount[];
};

const CompositionPipeline: React.FC = () => {
  const { data: counts, isLoading, error } = useQuery<StatusCount[]>({
    queryKey: ['compositionStatusCounts'],
    queryFn: fetchStatusCounts,
    refetchInterval: 5000,
  });

  const getCount = (status: string) => counts?.find(c => c.status === status)?.count || 0;
  
  const totalCompleted = getCount('completed');
  const totalAnalyzing = getCount('analyzing');
  const totalUploaded = getCount('uploaded');
  const totalCompositions = totalCompleted + totalAnalyzing + totalUploaded;

  const pipelineStages = [
    { 
      status: 'Uploaded', 
      count: totalUploaded, 
      icon: Upload, 
      color: 'text-blue-500',
      description: 'Awaiting initial processing.'
    },
    { 
      status: 'Analyzing', 
      count: totalAnalyzing, 
      icon: Loader2, 
      color: 'text-yellow-500',
      description: 'AI is generating name, genre, and artwork prompt.'
    },
    { 
      status: 'Completed', 
      count: totalCompleted, 
      icon: CheckCircle, 
      color: 'text-green-500',
      description: 'Ready for review and distribution preparation.'
    },
  ];

  if (isLoading) {
    return <div className="text-center p-4"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div>;
  }

  if (error) {
    return <div className="text-center p-4 text-red-500">Failed to load pipeline status.</div>;
  }

  return (
    <Card className="shadow-xl">
      <CardHeader>
        <CardTitle className="text-2xl font-bold">Composition Pipeline ({totalCompositions} Total)</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {pipelineStages.map((stage) => {
            const Icon = stage.icon;
            const isActive = stage.count > 0;
            return (
              <div 
                key={stage.status} 
                className={`p-4 rounded-lg border transition-all ${isActive ? 'border-primary/50 bg-primary/5 dark:bg-primary/10' : 'border-gray-200 dark:border-gray-700'}`}
              >
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-lg">{stage.status}</h3>
                  <Icon className={`h-6 w-6 ${stage.color} ${stage.status === 'Analyzing' ? 'animate-spin' : ''}`} />
                </div>
                <p className="text-4xl font-extrabold mt-2">{stage.count}</p>
                <p className="text-xs text-muted-foreground mt-1">{stage.description}</p>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};

export default CompositionPipeline;