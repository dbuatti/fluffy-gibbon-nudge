import React, { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Copy, Loader2, Sparkles } from 'lucide-react';
import { showSuccess, showError } from '@/utils/toast';
import { supabase } from '@/integrations/supabase/client';

interface InsightTimerDescriptionGeneratorProps {
  improvisationId: string;
}

const InsightTimerDescriptionGenerator: React.FC<InsightTimerDescriptionGeneratorProps> = ({ improvisationId }) => {
  const [description, setDescription] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleGenerate = useCallback(async () => {
    setIsLoading(true);
    setDescription('');
    showSuccess('Generating Insight Timer description...');

    try {
      const { data, error } = await supabase.functions.invoke('generate-description', {
        body: { improvisationId },
      });

      if (error) throw error;
      
      if (data.description) {
        setDescription(data.description);
        showSuccess('Description generated successfully!');
      } else {
        showError('AI failed to return a description.');
      }

    } catch (error) {
      console.error('Description generation failed:', error);
      showError(`Failed to generate description: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  }, [improvisationId]);

  const handleCopy = () => {
    if (description) {
      navigator.clipboard.writeText(description);
      showSuccess('Description copied to clipboard!');
    } else {
      showError('No description to copy.');
    }
  };

  return (
    <Card className="mt-4">
      <CardContent className="pt-6 space-y-4">
        <div className="flex justify-between items-center">
          <h4 className="font-semibold flex items-center">
            <Sparkles className="w-4 h-4 mr-2 text-purple-500" /> AI Description Generator
          </h4>
          <Button 
            onClick={handleGenerate} 
            disabled={isLoading} 
            size="sm"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4 mr-2" />
            )}
            Generate Description
          </Button>
        </div>

        <Textarea
          placeholder="Click 'Generate Description' to create a compliant 3-5 sentence description based on your notes and analysis..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={5}
          className="min-h-[120px]"
        />
        
        <Button 
          onClick={handleCopy} 
          disabled={!description} 
          variant="outline" 
          className="w-full"
        >
          <Copy className="h-4 w-4 mr-2" /> Copy Description
        </Button>
        
        <p className="text-xs text-muted-foreground">
          *Ensure the description is 3-5 sentences and contains no promotional links or mentions of other platforms, as required by Insight Timer.
        </p>
      </CardContent>
    </Card>
  );
};

export default InsightTimerDescriptionGenerator;