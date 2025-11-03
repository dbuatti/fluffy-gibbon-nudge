import React from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Menu, Trash2, Loader2, Settings, AlertTriangle } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Separator } from '@/components/ui/separator';

interface ImprovisationSettingsSheetProps {
  improvisationId: string; // Renamed prop
  improvisationName: string; // Renamed prop
  handleDelete: () => void;
  isDeleting: boolean;
}

const ImprovisationSettingsSheet: React.FC<ImprovisationSettingsSheetProps> = ({ improvisationId, improvisationName, handleDelete, isDeleting }) => { // Renamed props
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="icon" title="Improvisation Settings">
          <Settings className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center">
            <Settings className="h-5 w-5 mr-2" /> Improvisation Settings
          </SheetTitle>
          <SheetDescription>
            Manage advanced settings and perform destructive actions for this improvisation.
          </SheetDescription>
        </SheetHeader>
        
        <div className="py-6 space-y-6">
          <h3 className="text-lg font-semibold">General Actions</h3>
          
          {/* Placeholder for future settings */}
          <div className="text-sm text-muted-foreground p-4 border rounded-md">
            Future settings like privacy toggles or metadata locking will appear here.
          </div>

          <Separator />

          <h3 className="text-lg font-semibold text-destructive flex items-center">
            <AlertTriangle className="h-5 w-5 mr-2" /> Danger Zone
          </h3>
          
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" className="w-full justify-start">
                <Trash2 className="h-4 w-4 mr-2" /> Delete Improvisation
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action cannot be undone. This will permanently delete the improvisation record "{improvisationName}" and the uploaded audio file (if attached).
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} disabled={isDeleting} className="bg-destructive hover:bg-destructive/90">
                  {isDeleting ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    'Delete Improvisation Permanently'
                  )}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default ImprovisationSettingsSheet;