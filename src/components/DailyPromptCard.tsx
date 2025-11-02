import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Sparkles, Loader2, RefreshCw, Music } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { showError } from '@/utils/toast';
import { useCaptureIdea } from '@/hooks/useCaptureIdea'; // Import the new hook

const fetchDailyPrompt = async (): Promise<string> => {
  // Note: We use the anon key here as this is a public function call
  const { data, error } = await supabase.functions.invoke('generate-daily-prompt', {
    method: 'GET', // Use GET since we are just fetching data
  });

  if (error) {
    console.error("Failed to fetch daily prompt:", error);
    throw new Error("Failed to fetch daily prompt.");
  }
  
  return data.prompt || "Compose a piece about the color blue.";
};

const DailyPromptCard: React.FC = () => {
  const { data: prompt, isLoading, error, refetch } = useQuery<string>({
    queryKey: ['dailyPrompt'],
    queryFn: fetchDailyPrompt,
    // Cache the prompt for 24 hours (86400000 ms) to ensure it's "daily"
    staleTime: 86400000, 
    refetchOnWindowFocus: false,
  });
  
  const { captureIdea, isCapturing } = useCaptureIdea();

  const handleRefetch = () => {
    refetch();
    showError("Generating a new prompt...");
  };
  
  const handleStartIdea = () => {
    if (prompt) {
        // Remove surrounding quotes from the prompt before using it as a title
        const cleanTitle = prompt.replace(/^"|"$/g, '').trim();
        captureIdea({ title: cleanTitle, isImprovisation: true });
    }
  };

  return (
    <Card className="shadow-xl dark:shadow-3xl border-purple-500/50 border-2">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-xl font-bold flex items-center text-purple-600 dark:text-purple-400">
          <Sparkles className="w-5 h-5 mr-2" /> Daily Creative Prompt
        </CardTitle>
        <Button 
            variant="ghost" 
            size="icon" 
            onClick={handleRefetch} 
            disabled={isLoading || isCapturing}
            title="Generate a new prompt"
        >
            {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
                <RefreshCw className="h-4 w-4" />
            )}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-12">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : error ? (
          <p className="text-sm text-red-500">Error loading prompt.</p>
        ) : (
          <p className="text-lg font-semibold italic text-foreground">
            "{prompt}"
          </p>
        )}
        
        <Button 
            onClick={handleStartIdea} 
            disabled={isLoading || isCapturing || !prompt}
            className="w-full bg-purple-600 hover:bg-purple-700 dark:bg-purple-700 dark:hover:bg-purple-800"
        >
            {isCapturing ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
                <Music className="h-4 w-4 mr-2" />
            )}
            Start Idea Based on Prompt
        </Button>
      </CardContent>
    </Card>
  );
};

export default DailyPromptCard;