import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/utils/toast';

const ABSTRACT_WORDS = [
  'Echo', 'Silence', 'Drift', 'Luminescence', 'Void', 'Aether', 'Bloom', 'Wander', 
  'Solstice', 'Rivulet', 'Hush', 'Kinetic', 'Sublime', 'Ephemeral', 'Cascade', 'Opal',
  'Resonance', 'Flicker', 'Azure', 'Whisper', 'Zenith', 'Umbra', 'Glimmer', 'Tidal'
];

const RANDOM_TITLE_TEMPLATES = [
  'The {Word1} of {Word2}',
  '{Word1} {Word2}',
  'A {Word1} {Word2}',
  'Beneath the {Word1} {Word2}',
  'Where {Word1} Meets {Word2}',
];

const getRandomWord = () => ABSTRACT_WORDS[Math.floor(Math.random() * ABSTRACT_WORDS.length)];

const generateRandomTitle = (): string => {
  const template = RANDOM_TITLE_TEMPLATES[Math.floor(Math.random() * RANDOM_TITLE_TEMPLATES.length)];
  
  let title = template.replace('{Word1}', getRandomWord());
  title = title.replace('{Word2}', getRandomWord());
  
  // Ensure the first letter is capitalized
  return title.charAt(0).toUpperCase() + title.slice(1);
};

export const useTitleGenerator = (improvisationId: string, onTitleGenerated: (title: string) => Promise<void>) => { // Renamed parameter
  const [isGenerating, setIsGenerating] = useState(false);

  const handleRandomGenerate = useCallback(async () => {
    if (isGenerating) return;
    setIsGenerating(true);
    
    const newTitle = generateRandomTitle();
    
    try {
      await onTitleGenerated(newTitle);
      showSuccess('Random title generated and saved!');
    } catch (e) {
      // Error handled by the mutation hook
    } finally {
      setIsGenerating(false);
    }
  }, [improvisationId, onTitleGenerated, isGenerating]); // Updated dependency

  const handleAIGenerate = useCallback(async () => {
    if (isGenerating) return;
    setIsGenerating(true);
    showSuccess('AI is generating a title based on all improvisation data...');

    try {
      const { data, error } = await supabase.functions.invoke('generate-title', {
        body: { improvisationId }, // Updated parameter name
      });

      if (error) throw error;
      
      const newTitle = data.title;

      if (newTitle && newTitle.length > 0 && !newTitle.includes('Failed')) {
        await onTitleGenerated(newTitle);
        showSuccess('AI title generated and saved!');
      } else {
        showError('AI failed to generate a suitable title. Try again or check analysis data.');
      }

    } catch (error) {
      console.error('AI title generation failed:', error);
      showError(`Failed to generate AI title: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsGenerating(false);
    }
  }, [improvisationId, onTitleGenerated, isGenerating]); // Updated dependency

  return {
    isGenerating,
    handleRandomGenerate,
    handleAIGenerate,
  };
};