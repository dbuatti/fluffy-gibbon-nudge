import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/utils/toast';

interface UpdateCompositionPayload { // Renamed interface
  id: string;
  updates: { [key: string]: any };
}

const updateComposition = async ({ id, updates }: UpdateCompositionPayload) => { // Renamed function
  const { error } = await supabase
    .from('compositions') // Updated table name
    .update(updates)
    .eq('id', id);

  if (error) throw new Error(error.message);
};

export const useUpdateComposition = (compositionId: string) => { // Renamed hook and parameter
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (updates: { [key: string]: any }) => updateComposition({ id: compositionId, updates }), // Updated function call
    onSuccess: (data, variables) => {
      // Invalidate the specific composition query to refetch the latest data
      queryClient.invalidateQueries({ queryKey: ['composition', compositionId] }); // Updated query key
      
      // Show success message based on the updated field
      const fieldName = Object.keys(variables)[0];
      showSuccess(`${fieldName.replace(/_/g, ' ')} updated successfully.`);
    },
    onError: (error) => {
      showError(`Failed to update composition: ${error.message}`);
    },
  });
};