import React, { useState, useCallback, useRef, useEffect } from 'react';
import { UploadCloud, Loader2, Plus, X, FolderOpen, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useSession } from '@/integrations/supabase/session-context';
import { showSuccess, showError } from '@/utils/toast';
import { useNavigate, useLocation } from 'react-router-dom';
import { useLocalBridge } from '@/lib/local-bridge';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';

const DragDropOverlay: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { session } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const { createLocalProject } = useLocalBridge();
  const [isDraggingOverZone, setIsDraggingOverZone] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showZone, setShowZone] = useState(false);
  const [showFolderDialog, setShowFolderDialog] = useState(false);
  const [createdFolderPath, setCreatedFolderPath] = useState<string>('');
  const dragCounter = useRef(0);

  // Disable on existing improvisation pages — they have their own upload component
  const isOnImprovisationPage = location.pathname.startsWith('/improvisation/');

  const handleDragEnter = useCallback((e: DragEvent) => {
    if (isOnImprovisationPage) return;
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer?.items && e.dataTransfer.items.length > 0) {
      setShowZone(true);
      // Check if dragging over the drop zone
      const target = e.target as HTMLElement;
      if (target.closest('[data-drop-zone]')) {
        setIsDraggingOverZone(true);
      }
    }
  }, [isOnImprovisationPage]);

  const handleDragLeave = useCallback((e: DragEvent) => {
    if (isOnImprovisationPage) return;
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    
    // Only hide zone when drag leaves the entire window
    if (dragCounter.current === 0) {
      setShowZone(false);
      setIsDraggingOverZone(false);
    }
  }, [isOnImprovisationPage]);

  const handleDragOver = useCallback((e: DragEvent) => {
    if (isOnImprovisationPage) return;
    e.preventDefault();
    e.stopPropagation();
    
    // Update hover state for the drop zone
    const target = e.target as HTMLElement;
    const overZone = !!target.closest('[data-drop-zone]');
    setIsDraggingOverZone(overZone);
  }, [isOnImprovisationPage]);

  const handleDrop = useCallback(async (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOverZone(false);
    setShowZone(false);
    dragCounter.current = 0;

    if (isOnImprovisationPage) return;

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
    showSuccess(`Processing file: ${file.name}. Creating new improvisation...`);

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
          fileName: file.name,
          isImprovisation: true,
        },
      });

      // 4. Create local Logic project folder
      try {
        const projectTitle = generatedName;
        const projectResult = await createLocalProject(projectTitle);
        if (projectResult?.path) {
          setCreatedFolderPath(projectResult.path);
          setShowFolderDialog(true);
        }
      } catch (e) {
        // Don't fail the whole upload if local project creation fails
        console.warn('Could not create local project folder:', e);
      }

      showSuccess(`Improvisation created and analysis started! Redirecting...`);
      navigate(`/improvisation/${improvisationId}`);

    } catch (error) {
      showError(`Failed to process file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsProcessing(false);
    }
  }, [session, navigate, createLocalProject]);

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

  // Don't render anything on improvisation pages
  if (isOnImprovisationPage) {
    return <>{children}</>;
  }

  return (
    <>
      {children}
      
      {/* Small drop zone in bottom-left — appears when dragging a file */}
      {showZone && (
        <div
          data-drop-zone
          className={cn(
            "fixed bottom-6 left-6 z-[9998] transition-all duration-200",
            isDraggingOverZone
              ? "scale-105 ring-2 ring-primary ring-offset-2 ring-offset-background"
              : "opacity-60 hover:opacity-100"
          )}
          onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setIsDraggingOverZone(true); }}
          onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setIsDraggingOverZone(false); }}
          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onDrop={handleDrop}
        >
          <div className="bg-background/95 backdrop-blur-sm border border-border/50 dark:border-border/30 rounded-xl shadow-xl p-4 min-w-[200px]">
            <div className="flex items-center gap-3">
              <div className={cn(
                "w-12 h-12 rounded-lg flex items-center justify-center transition-colors",
                isDraggingOverZone ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
              )}>
                <UploadCloud className="w-6 h-6" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {isDraggingOverZone ? "Drop to create new project" : "Drop audio file here"}
                </p>
                <p className="text-[11px] text-muted-foreground truncate">
                  MP3 or M4A — creates a fresh improvisation
                </p>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); setShowZone(false); }}
                className="ml-auto text-muted-foreground hover:text-foreground p-1 rounded"
                aria-label="Hide drop zone"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Full-screen overlay only when actually dropping */}
      {(isDraggingOverZone || isProcessing) && (
        <div 
          className={cn(
            "fixed inset-0 z-[9999] flex items-center justify-center transition-opacity duration-300",
            isProcessing ? "bg-primary/85 backdrop-blur-sm" : "bg-primary/75 backdrop-blur-sm"
          )}
        >
          <div className="text-center text-white p-10 border-4 border-dashed border-white/50 rounded-xl">
            {isProcessing ? (
              <>
                <Loader2 className="w-16 h-16 mx-auto mb-4 animate-spin" />
                <h2 className="text-2xl font-bold">Processing Instant Upload...</h2>
                <p className="mt-2">Creating improvisation and starting AI analysis.</p>
              </>
            ) : (
              <>
                <UploadCloud className="w-16 h-16 mx-auto mb-4" />
                <h2 className="text-2xl font-bold">Drop Audio File Here to Capture Instantly</h2>
                <p className="mt-2">MP3 or M4A only. Creates a new idea and starts AI analysis immediately.</p>              </>
            )}
          </div>
        </div>
      )}

      {/* Folder creation confirmation dialog */}
      <AlertDialog open={showFolderDialog} onOpenChange={setShowFolderDialog}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-emerald-600" />
              Local Logic Project Created
            </AlertDialogTitle>
            <AlertDialogDescription>
              A local Logic project folder has been created for your new improvisation.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 py-2">
            <div className="bg-muted/50 rounded-lg p-3 space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Folder Path</p>
              <p className="text-sm font-mono text-foreground break-all">{createdFolderPath}</p>
            </div>
            <p className="text-xs text-muted-foreground">
              The folder contains the basic Logic project structure (Alternatives/, Media/, Resources/).
              Open it in Logic Pro to start working, or drag your audio file into the Media folder.
            </p>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowFolderDialog(false)}>Close</AlertDialogCancel>
            <Button
              variant="default"
              onClick={() => {
                if (createdFolderPath) {
                  import('@/lib/local-bridge').then(({ openFolderInFinder }) => openFolderInFinder(createdFolderPath));
                  setShowFolderDialog(false);
                }
              }}
              className="gap-2"
            >
              <FolderOpen className="h-4 w-4" /> Open in Finder
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default DragDropOverlay;