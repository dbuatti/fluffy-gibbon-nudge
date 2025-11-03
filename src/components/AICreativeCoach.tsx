import React, { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Lightbulb, Zap, Check } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/utils/toast';
import { cn } from '@/lib/utils';

interface AICreativeCoachProps {
  improvisationId: string; // Renamed prop
}

const AICreativeCoach: React.FC<AICreativeCoachProps> = ({ improvisationId }) => {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const handleGenerate = useCallback(async () => {
    setIsLoading(true);
    setSuggestions([]);
    showSuccess('AI Creative Coach is brainstorming suggestions...');

    try {
      const { data, error } = await supabase.functions.invoke('generate-creative-suggestions', {
        body: { improvisationId }, // Updated parameter name
      });

      if (error) throw error;
      
      if (data.suggestions && Array.isArray(data.suggestions)) {
        setSuggestions(data.suggestions);
        showSuccess('Three new creative suggestions generated!');
      } else {
        showError('AI failed to return suggestions.');
      }

    } catch (error) {
      console.error('Suggestion generation failed:', error);
      showError(`Failed to generate suggestions: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  }, [improvisationId]); // Updated dependency

  return (
    <Card className="shadow-lg dark:shadow-xl border-purple-500/50 border-2">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-xl text-purple-600 dark:text-purple-400">
          <Lightbulb className="w-5 h-5 mr-2" /> AI Creative Coach
        </CardTitle>
        <Button 
          onClick={handleGenerate} 
          disabled={isLoading} // Button is now only disabled by loading state
          size="sm"
          className="bg-purple-600 hover:bg-purple-700 dark:bg-purple-700 dark:hover:bg-purple-800"
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Zap className="h-4 w-4 mr-2" />
          )}
          Generate Suggestions
        </Button>
      </CardHeader>
      <CardContent className="pt-4 space-y-4">
        {suggestions.length > 0 ? (
          <ul className="space-y-3">
            {suggestions.map((suggestion, index) => (
              <li key={index} className="flex items-start p-3 bg-muted/50 rounded-lg border border-border">
                <Check className="h-5 w-5 mr-3 mt-0.5 text-green-600 flex-shrink-0" />
                <p className="text-sm font-medium">{suggestion}</p>
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-center p-6 bg-muted rounded-lg">
            <Lightbulb className="w-6 h-6 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Click 'Generate Suggestions' to get three actionable ideas for developing this improvisation. Suggestions are enhanced by audio analysis and creative notes.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default AICreativeCoach;