import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/utils/toast';

// Define the Composition interface (or import it if it exists globally)
interface NoteTab {
  id: string;
  title: string;
  color: string;
  content: string;
}

interface Composition {
  id: string;
  file_name: string | null;
  status: 'uploaded' | 'analyzing' | 'completed' | 'failed';
  generated_name: string | null;
  artwork_url: string | null;
  artwork_prompt: string | null;
  created_at: string;
  notes: NoteTab[] | null;
  storage_path: string | null;
  is_ready_for_release: boolean | null;
  user_id: string;
  is_piano: boolean | null;
  is_improvisation: boolean | null;
  primary_genre: string | null;
  secondary_genre: string | null;
  analysis_data: { mood?: string; [key: string]: any } | null;
  user_tags: string[] | null;
  is_instrumental: boolean | null;
  is_original_song: boolean | null;
  has_explicit_lyrics: boolean | null;
  is_original_song_confirmed: boolean | null; // Added based on common patterns
  is_metadata_confirmed: boolean | null;
  insight_content_type: string | null;
  insight_language: string | null;
  insight_primary_use: string | null;
  insight_audience_level: string | null;
  insight_audience_age: string[] | null;
  insight_benefits: string[] | null;
  insight_practices: string | null;
  insight_themes: string[] | null;
  insight_voice: string | null;
  ai_generated_description: string | null; // Added based on error context
}

interface UpdateCompositionArgs {
  updates: Partial<Composition>;
}

export const useUpdateComposition = (compositionId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ updates }: UpdateCompositionArgs) => {
      if (!compositionId) {
        throw new Error("Composition ID is required for update.");
      }
      const { data, error } = await supabase
        .from('compositions')
        .update(updates)
        .eq('id', compositionId)
        .select()
        .single();

      if (error) {
        console.error("Supabase update error:", error);
        throw new Error(error.message);
      }
      return data;
    },
    onSuccess: (data) => {
      showSuccess("Composition updated successfully!");
      queryClient.invalidateQueries({ queryKey: ['composition', compositionId] });
      queryClient.invalidateQueries({ queryKey: ['compositions'] }); // Invalidate list queries
    },
    onError: (error) => {
      showError(`Failed to update composition: ${error.message}`);
    },
  });
};