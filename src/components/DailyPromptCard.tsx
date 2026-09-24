import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Sparkles, Loader2, RefreshCw, Music, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { showError, showSuccess } from '@/utils/toast';
import CaptureIdeaDialog from './CaptureIdeaDialog';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

const fetchDailyPrompt = async (): Promise<string> => {
  const { data, error } = await supabase.functions.invoke('generate-daily-prompt');

  if (error) {
    console.error("Failed to fetch daily prompt:", error);
    throw new Error(error.message || "Failed to fetch daily prompt.");
  }

  return data.prompt || "Compose a piece about the color blue.";
};

const DailyPromptCard: React.FC = () => {
  const { data: prompt, isLoading, error, refetch } = useQuery<string>({
    queryKey: ['dailyPrompt'],
    queryFn: fetchDailyPrompt,
    staleTime: 86400000,
    refetchOnWindowFocus: false,
  });

  const [cooldown, setCooldown] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleRefetch = () => {
    if (cooldown) return;

    setCooldown(true);
    refetch();
    showSuccess("Generating a new prompt...");
    setTimeout(() => {
      setCooldown(false);
    }, 15000);
  };

  const cleanTitle = prompt ? prompt.replace(/^"|"$/g, '').trim() : '';

  return (
    <Card className="relative overflow-hidden border-2 border-primary/20 bg-card shadow-card-light dark:shadow-card-dark transition-shadow hover:shadow-xl h-full">
      <div className="absolute -top-16 -right-16 h-40 w-40 rounded-full bg-gradient-to-br from-primary/15 to-violet-600/15 blur-2xl" aria-hidden />
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-lg font-bold flex items-center text-primary">
          <span className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center mr-2.5">
            <Sparkles className="w-4 h-4" />
          </span>
          Daily Creative Prompt
        </CardTitle>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleRefetch}
          disabled={isLoading || cooldown}
          title={cooldown ? "Please wait before generating a new prompt" : "Generate a new prompt"}
          aria-label="Generate a new prompt"
          className="text-muted-foreground hover:text-primary"
        >
          <RefreshCw className={cn("h-4 w-4", (isLoading || cooldown) && "animate-spin")} />
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-3/4" />
          </div>
        ) : error ? (
          <p className="text-sm text-error">Error loading prompt: {error.message}</p>
        ) : (
          <div className="flex items-start gap-2">
            <p className="text-lg font-semibold italic text-foreground flex-1 leading-relaxed">
              "{prompt}"
            </p>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                navigator.clipboard.writeText(prompt || '');
                setCopied(true);
                showSuccess("Prompt copied!");
                setTimeout(() => setCopied(false), 2000);
              }}
              title="Copy prompt"
              aria-label="Copy prompt"
              className="shrink-0 text-muted-foreground hover:text-primary"
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
        )}

        <CaptureIdeaDialog
          defaultTitle={cleanTitle}
          onIdeaCaptured={() => { }}
        >
          <Button
            disabled={isLoading || !prompt}
            className="w-full h-10 text-base bg-gradient-to-r from-primary to-violet-600 hover:from-primary/90 hover:to-violet-600/90 shadow-md shadow-primary/10"
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