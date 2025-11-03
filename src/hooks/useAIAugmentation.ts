import { useState, useCallback } from 'react';
import { useSession } from '@/integrations/supabase/session-context'; // Import useSession
import { showSuccess, showError } from '@/utils/toast';
import { useQueryClient } from '@tanstack/react-query';

interface AIAugmentationResult {
  description: string;
  updates: { [key: string]: any };
}

export const useAIAugmentation = (improvisationId: string) => {
  const queryClient = useQueryClient();
  const { supabase } = useSession(); // Get supabase from useSession
  const [isPopulating, setIsPopulating] = useState(false);
  const [aiGeneratedDescription, setAiGeneratedDescription] = useState('');

  const handleAIPopulateMetadata = useCallback(async () => {
    if (isPopulating) return;

    setIsPopulating(true);
    setAiGeneratedDescription('');
    showSuccess("AI is intelligently populating ALL Insight Timer metadata and generating description...");

    try {
      const { data, error } = await supabase.functions.invoke('populate-distribution-metadata', {
        body: { improvisationId },
      });

      if (error) throw error;
      
      const result = data as AIAugmentationResult;

      if (result.description && result.updates) {
        setAiGeneratedDescription(result.description);
        
        // Force refetch the improvisation details to show updated DB fields
        queryClient.invalidateQueries({ queryKey: ['improvisation', improvisationId] });
        
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
  }, [improvisationId, queryClient, isPopulating, supabase]);

  return {
    isPopulating,
    aiGeneratedDescription,
    handleAIPopulateMetadata,
    setAiGeneratedDescription, // Allow parent to clear/set description if needed
  };
};