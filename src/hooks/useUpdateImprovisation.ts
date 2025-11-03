import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/utils/toast';

interface UpdateImprovisationPayload { // Renamed interface
  id: string;
  updates: { [key: string]: any };
}

const updateImprovisation = async ({ id, updates }: UpdateImprovisationPayload) => { // Renamed function
  const { error } = await supabase
    .from('improvisations') // Updated table name
    .update(updates)
    .eq('id', id);

  if (error) throw new Error(error.message);
};

export const useUpdateImprovisation = (improvisationId: string) => { // Renamed hook and parameter
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (updates: { [key: string]: any }) => updateImprovisation({ id: improvisationId, updates }), // Updated function call
    onSuccess: (data, variables) => {
      // Invalidate the specific improvisation query to refetch the latest data
      queryClient.invalidateQueries({ queryKey: ['improvisation', improvisationId] }); // Updated query key
      
      // Show success message based on the updated field
      const fieldName = Object.keys(variables)[0];
      showSuccess(`${fieldName.replace(/_/g, ' ')} updated successfully.`);
    },
    onError: (error) => {
      showError(`Failed to update improvisation: ${error.message}`);
    },
  });
};