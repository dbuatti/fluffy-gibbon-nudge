import React, { useState, useCallback, useRef } from 'react';
import { UploadCloud, Music, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useSession } from '@/integrations/supabase/session-context';
import { showSuccess, showError } from '@/utils/toast';
import { useNavigate } from 'react-router-dom';

const DragDropOverlay: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { session } = useSession();
  const navigate = useNavigate();
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const dragCounter = useRef(0); // Ref to track nested dragenter/dragleave events

  const handleDragEnter = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer?.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    
    // Only set dragging to false when the counter hits zero (meaning drag left the entire window)
    if (dragCounter.current === 0) {
        setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(async (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounter.current = 0; // Reset counter on drop

    if (!session) {
        showError("Please sign in to upload files.");
        return;
    }

    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    const acceptedMimeTypes = ['audio/mpeg', 'audio/mp4', 'audio/x-m4a'];
    
    if (!acceptedMimeTypes.includes(file.type)) {
      showError('Only MP3 or M4A audio files are supported for instant upload.');
      return;
    }

    setIsProcessing(true);
    showSuccess(`Processing file: ${file.name}. Creating new composition...`);

    const user = session.user;
    const fileExtension = file.name.split('.').pop();
    const filePath = `${user.id}/${Date.now()}.${fileExtension}`;
    const bucketName = 'piano_improvisations';
    const generatedName = file.name.replace(`.${fileExtension}`, '').trim();

    try {
      // 1. Create placeholder record (assuming it's an improvisation by default for quick capture)
      const { data: newImpData, error: dbError } = await supabase
        .from('improvisations')
        .insert({
          user_id: user.id,
          file_name: file.name,
          storage_path: filePath,
          status: 'analyzing',
          generated_name: generatedName,
          is_improvisation: true, // Default to improvisation for quick capture
        })
        .select('id')
        .single();

      if (dbError) throw dbError;
      const improvisationId = newImpData.id;

      // 2. Upload file to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from(bucketName)
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) throw uploadError;
      
      // 3. Trigger the analysis Edge Function (asynchronously)
      await supabase.functions.invoke('analyze-improvisation', {
        body: {
          improvisationId: improvisationId,
          storagePath: filePath,
          isImprovisation: true,
        },
      });

      showSuccess(`Composition created and analysis started! Redirecting...`);
      navigate(`/improvisation/${improvisationId}`);

    } catch (error) {
      console.error('Instant upload failed:', error);
      showError(`Failed to process file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsProcessing(false);
    }
  }, [session, navigate]);

  React.useEffect(() => {
    window.addEventListener('dragenter', handleDragEnter);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('drop', handleDrop);

    return () => {
      window.removeEventListener('dragenter', handleDragEnter);
      window.removeEventListener('dragleave', handleDragLeave);
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('drop', handleDrop);
    };
  }, [handleDragEnter, handleDragLeave, handleDragOver, handleDrop]);

  return (
    <>
      {children}
      {(isDragging || isProcessing) && (
        <div 
          className={cn(
            "fixed inset-0 z-[9999] flex items-center justify-center transition-opacity duration-300",
            isProcessing ? "bg-primary/80 backdrop-blur-sm" : "bg-green-600/80 backdrop-blur-sm"
          )}
        >
          <div className="text-center text-white p-10 border-4 border-dashed border-white/50 rounded-xl">
            {isProcessing ? (
                <>
                    <Loader2 className="w-16 h-16 mx-auto mb-4 animate-spin" />
                    <h2 className="text-2xl font-bold">Processing Instant Upload...</h2>
                    <p className="mt-2">Creating composition and starting AI analysis.</p>
                </>
            ) : (
                <>
                    <UploadCloud className="w-16 h-16 mx-auto mb-4" />
                    <h2 className="text-2xl font-bold">Drop Audio File Here to Capture Instantly</h2>
                    <p className="mt-2">MP3 or M4A only. Creates a new idea and starts AI analysis immediately.</p>
                </>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default DragDropOverlay;