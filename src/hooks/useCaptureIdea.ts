import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { format } from 'date-fns';
import { useSession } from '@/integrations/supabase/session-context';
import { useNavigate } from 'react-router-dom';

interface CaptureIdeaOptions {
  title?: string;
  isImprovisation?: boolean;
}

export const useCaptureIdea = () => {
  const { session } = useSession();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);

  const captureIdea = useCallback(async (options: CaptureIdeaOptions = {}) => {
    if (!session) {
      showError("You must be signed in to capture an idea.");
      return;
    }

    setIsLoading(true);

    const { title = 'Quick Capture', isImprovisation = true } = options;

    // 1. Determine the final title: use user input or a fallback
    const datePrefix = format(new Date(), 'yyyyMMdd');
    const baseTitle = title.trim();
    const finalTitle = `${datePrefix} - ${baseTitle}`;

    try {
      const { data: newImpData, error: dbError } = await supabase // Renamed variable
        .from('improvisations') // Updated table name
        .insert({
          user_id: session.user.id,
          file_name: null, // Placeholder idea, no file yet
          storage_path: null, // No file yet
          status: 'uploaded', // Use 'uploaded' status for visibility
          generated_name: finalTitle, // Save the prefixed title
          is_improvisation: isImprovisation,
        })
        .select('id') // Request the ID of the newly created record
        .single();

      if (dbError) throw dbError;
      
      const newImprovisationId = newImpData.id; // Renamed variable

      showSuccess(`Idea "${finalTitle}" captured! Redirecting to details...`);
      
      // 2. Navigate to the new song's details page
      navigate(`/improvisation/${newImprovisationId}`); // Updated path
      
      return newImprovisationId;

    } catch (error) {
      console.error('Failed to capture idea:', error);
      showError(`Failed to capture idea: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [session, navigate]);

  return {
    captureIdea,
    isCapturing: isLoading,
  };
};