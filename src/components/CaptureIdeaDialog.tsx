import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Music, Loader2, Settings2 } from 'lucide-react';
import { showError } from '@/utils/toast';
import { format } from 'date-fns';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useSession } from '@/integrations/supabase/session-context';
import { useCaptureIdea } from '@/hooks/useCaptureIdea'; // Import new hook

interface CaptureIdeaDialogProps {
  onIdeaCaptured: () => void;
}

const CaptureIdeaDialog: React.FC<CaptureIdeaDialogProps> = ({ onIdeaCaptured }) => {
  const { session } = useSession();
  const { captureIdea, isCapturing } = useCaptureIdea(); // Use new hook
  const [isOpen, setIsOpen] = useState(false);
  const [ideaName, setIdeaName] = useState(''); // Start empty for quick capture
  const [isImprovisation, setIsImprovisation] = useState('true'); // Default to improvisation
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);

  // Reset state when dialog opens/closes
  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (open) {
        setIdeaName('');
        setIsImprovisation('true');
        setIsAdvancedOpen(false);
    }
  };

  const handleCapture = async () => {
    if (!session) {
      showError("You must be signed in to capture an idea.");
      return;
    }

    const newId = await captureIdea({
        title: ideaName,
        isImprovisation: isImprovisation === 'true',
    });

    if (newId) {
        setIdeaName('');
        setIsOpen(false);
        onIdeaCaptured();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button 
          variant="default" 
          className="w-full md:w-auto text-lg h-12 px-6 shadow-lg hover:shadow-xl transition-shadow bg-primary hover:bg-primary/90 dark:bg-primary dark:hover:bg-primary/90"
        >
          <Music className="w-5 h-5 mr-2" /> Capture New Idea
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Capture New Idea</DialogTitle>
          <DialogDescription>
            What is the title of your spontaneous idea? Hit save for instant capture.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="ideaName">Idea Title</Label>
            <Input
              id="ideaName"
              placeholder="E.g., 'Rainy Day Sketch' (or leave blank for Quick Capture)"
              value={ideaName}
              onChange={(e) => setIdeaName(e.target.value)}
              disabled={isCapturing}
            />
            <p className="text-xs text-muted-foreground">
                The date ({format(new Date(), 'yyyyMMdd')}) will be automatically prepended.
            </p>
          </div>
          
          <Collapsible open={isAdvancedOpen} onOpenChange={setIsAdvancedOpen} className="space-y-2">
            <CollapsibleTrigger asChild>
              <Button variant="link" className="p-0 h-auto text-sm text-muted-foreground hover:text-primary">
                <Settings2 className="w-4 h-4 mr-2" /> 
                {isAdvancedOpen ? 'Hide Advanced Options' : 'Show Advanced Options'}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-2 border-t pt-4">
                <Label>Type of Piece</Label>
                <RadioGroup 
                  defaultValue="true" 
                  onValueChange={setIsImprovisation}
                  disabled={isCapturing}
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
            </CollapsibleContent>
          </Collapsible>

        </div>
        <DialogFooter>
          <Button onClick={handleCapture} disabled={isCapturing}>
            {isCapturing ? (
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