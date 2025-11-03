import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Sparkles, Loader2, RefreshCw, Music } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { showError } from '@/utils/toast';
import CaptureIdeaDialog from './CaptureIdeaDialog';
import { cn } from '@/lib/utils';

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
  
  const [cooldown, setCooldown] = useState(false); // New state for cooldown

  const handleRefetch = () => {
    if (cooldown) return; // Prevent refetch if on cooldown

    setCooldown(true);
    refetch();
    showError("Generating a new prompt...");
    setTimeout(() => {
      setCooldown(false);
    }, 15000); // 15-second cooldown
  };
  
  // Clean the prompt for use as a title
  const cleanTitle = prompt ? prompt.replace(/^"|"$/g, '').trim() : '';

  return (
    <Card className={cn(
        "shadow-xl dark:shadow-3xl border-2",
        "border-purple-500/50 bg-purple-50/50 dark:bg-purple-950/50"
    )}>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-xl font-bold flex items-center text-purple-600 dark:text-purple-400">
          <Sparkles className="w-5 h-5 mr-2" /> Daily Creative Prompt
        </CardTitle>
        <Button 
            variant="ghost" 
            size="icon" 
            onClick={handleRefetch} 
            disabled={isLoading || cooldown} // Disable button during loading or cooldown
            title={cooldown ? "Please wait before generating a new prompt" : "Generate a new prompt"}
            className="text-muted-foreground hover:text-primary"
        >
            {isLoading || cooldown ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
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
          <p className="text-sm text-red-500">Error loading prompt. Please wait a moment and try again.</p>
        ) : (
          <p className="text-xl font-semibold italic text-foreground">
            "{prompt}"
          </p>
        )}
        
        <CaptureIdeaDialog 
            defaultTitle={cleanTitle} 
            onIdeaCaptured={() => { /* Refetch logic is handled by the parent Index component */ }}
        >
            <Button 
                disabled={isLoading || !prompt}
                className="w-full h-10 text-base bg-purple-600 hover:bg-purple-700 dark:bg-purple-700 dark:hover:bg-purple-800"
            >
                {isLoading ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                    <Music className="h-4 w-4 mr-2" />
                )}
                Start Idea Based on Prompt
            </Button>
        </CaptureIdeaDialog>
      </CardContent>
    </Card>
  );
};

export default DailyPromptCard;