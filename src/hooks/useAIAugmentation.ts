import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/utils/toast';
import { useQueryClient } from '@tanstack/react-query';

interface AIAugmentationResult {
  description: string;
  updates: { [key: string]: any };
}

export const useAIAugmentation = (improvisationId: string) => { // Renamed parameter
  const queryClient = useQueryClient();
  const [isPopulating, setIsPopulating] = useState(false);
  const [aiGeneratedDescription, setAiGeneratedDescription] = useState('');

  const handleAIPopulateMetadata = useCallback(async () => {
    if (isPopulating) return;

    setIsPopulating(true);
    setAiGeneratedDescription('');
    showSuccess("AI is intelligently populating ALL Insight Timer metadata and generating description...");

    try {
      const { data, error } = await supabase.functions.invoke('populate-distribution-metadata', {
        body: { improvisationId }, // Updated parameter name
      });

      if (error) throw error;
      
      const result = data as AIAugmentationResult;

      if (result.description && result.updates) {
        setAiGeneratedDescription(result.description);
        
        // Force refetch the improvisation details to show updated DB fields
        queryClient.invalidateQueries({ queryKey: ['improvisation', improvisationId] }); // Updated query key
        
        showSuccess("AI augmentation complete! All fields updated and description generated.");
      } else {
        showError('AI failed to return complete metadata.');
      }

    } catch (error) {
      console.error('AI Population failed:', error);
      showError(`Failed to populate metadata: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsPopulating(false);
    }
  }, [improvisationId, queryClient, isPopulating]); // Updated dependency

  return {
    isPopulating,
    aiGeneratedDescription,
    handleAIPopulateMetadata,
    setAiGeneratedDescription,
  };
};