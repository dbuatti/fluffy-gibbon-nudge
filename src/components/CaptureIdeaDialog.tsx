import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Music, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useSession } from '@/integrations/supabase/session-context';
import { showError, showSuccess } from '@/utils/toast';
import { format } from 'date-fns'; // Import format

interface CaptureIdeaDialogProps {
  onIdeaCaptured: () => void;
}

const generateDefaultTitle = () => {
    return format(new Date(), 'yyyyMMdd') + ' - Untitled Sketch';
};

const CaptureIdeaDialog: React.FC<CaptureIdeaDialogProps> = ({ onIdeaCaptured }) => {
  const { session } = useSession();
  const [isOpen, setIsOpen] = useState(false);
  const [ideaName, setIdeaName] = useState(generateDefaultTitle());
  const [isImprovisation, setIsImprovisation] = useState('true'); // Stored as string for RadioGroup
  const [isLoading, setIsLoading] = useState(false);

  // Reset state when dialog opens/closes
  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (open) {
        setIdeaName(generateDefaultTitle());
        setIsImprovisation('true');
    }
  };

  const handleCapture = async () => {
    if (!session || !ideaName.trim()) {
      showError("Please provide a name for your idea.");
      return;
    }

    setIsLoading(true);

    try {
      const { error: dbError } = await supabase
        .from('improvisations')
        .insert({
          user_id: session.user.id,
          file_name: null, // Placeholder idea, no file yet
          storage_path: null, // No file yet
          status: 'uploaded', // Use 'uploaded' status for visibility, even without file
          generated_name: ideaName.trim(),
          is_improvisation: isImprovisation === 'true',
        });

      if (dbError) throw dbError;

      showSuccess(`Idea "${ideaName.trim()}" captured! Now go record it.`);
      setIdeaName('');
      setIsOpen(false);
      onIdeaCaptured();

    } catch (error) {
      console.error('Failed to capture idea:', error);
      showError(`Failed to capture idea: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button 
          variant="default" 
          className="w-full md:w-auto text-lg h-12 px-6 shadow-md hover:shadow-lg transition-shadow bg-green-600 hover:bg-green-700 dark:bg-green-700 dark:hover:bg-green-800"
        >
          <Music className="w-5 h-5 mr-2" /> Capture New Idea
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Capture New Idea</DialogTitle>
          <DialogDescription>
            Quickly save a title for your composition idea. You can upload the audio file later.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="ideaName">Idea Title</Label>
            <Input
              id="ideaName"
              placeholder="E.g., 'Rainy Day Sketch'"
              value={ideaName}
              onChange={(e) => setIdeaName(e.target.value)}
              disabled={isLoading}
            />
          </div>
          <div className="space-y-2">
            <Label>Type of Piece</Label>
            <RadioGroup 
              defaultValue="true" 
              onValueChange={setIsImprovisation}
              disabled={isLoading}
            >
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="true" id="improv" />
                  <Label htmlFor="improv">Spontaneous Improvisation</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="false" id="composition" />
                  <Label htmlFor="composition">Fixed Composition</Label>
                </div>
              </div>
            </RadioGroup>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={handleCapture} disabled={isLoading || !ideaName.trim()}>
            {isLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Music className="mr-2 h-4 w-4" />
            )}
            Save Idea
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CaptureIdeaDialog;