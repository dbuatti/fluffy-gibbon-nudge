import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/utils/toast';

interface UpdatePayload {
  id: string;
  updates: { [key: string]: any };
}

const updateImprovisation = async ({ id, updates }: UpdatePayload) => {
  const { error } = await supabase
    .from('improvisations')
    .update(updates)
    .eq('id', id);

  if (error) throw new Error(error.message);
};

export const useUpdateImprovisation = (improvisationId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (updates: { [key: string]: any }) => updateImprovisation({ id: improvisationId, updates }),
    onSuccess: (data, variables) => {
      // Invalidate the specific improvisation query to refetch the latest data
      queryClient.invalidateQueries({ queryKey: ['improvisation', improvisationId] });
      
      // Show success message based on the updated field
      const fieldName = Object.keys(variables)[0];
      showSuccess(`${fieldName.replace(/_/g, ' ')} updated successfully.`);
    },
    onError: (error) => {
      showError(`Failed to update composition: ${error.message}`);
    },
  });
};