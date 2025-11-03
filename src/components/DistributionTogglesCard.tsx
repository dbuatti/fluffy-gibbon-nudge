import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Piano, Music, CheckCircle, XCircle, Loader2 } from 'lucide-react';
// Removed useUpdateImprovisation as handlers are now passed from parent

interface DistributionTogglesCardProps {
  improvisationId: string; // Renamed prop
  isPiano: boolean | null;
  isInstrumental: boolean | null;
  isOriginalSong: boolean | null;
  hasExplicitLyrics: boolean | null;
  isPending: boolean; // NEW: Pass pending state from parent
  // NEW: Handlers passed from parent
  handleUpdateIsPiano: (checked: boolean) => Promise<void>;
  handleUpdateIsInstrumental: (checked: boolean) => Promise<void>;
  handleUpdateIsOriginalSong: (checked: boolean) => Promise<void>;
  handleUpdateHasExplicitLyrics: (checked: boolean) => Promise<void>;
}

const DistributionTogglesCard: React.FC<DistributionTogglesCardProps> = ({
  improvisationId, // Renamed prop
  isPiano,
  isInstrumental,
  isOriginalSong,
  hasExplicitLyrics,
  isPending, // NEW
  handleUpdateIsPiano, // NEW
  handleUpdateIsInstrumental, // NEW
  handleUpdateIsOriginalSong, // NEW
  handleUpdateHasExplicitLyrics, // NEW
}) => {
  // Removed updateMutation and its related logic, now using passed handlers
  
  const renderToggleItem = (Icon: React.ElementType, label: string, checked: boolean | null, onCheckedChange: (checked: boolean) => Promise<void>) => (
    <div className="flex items-center justify-between pr-4 py-2 border-b last:border-b-0">
      <div className="flex items-center">
        <Icon className="h-5 w-5 mr-2 text-muted-foreground" />
        <span className="font-semibold text-sm">{label}:</span>
      </div>
      <Switch
        checked={!!checked}
        onCheckedChange={onCheckedChange}
        disabled={isPending}
      />
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl flex items-center">
          <Music className="h-5 w-5 mr-2" /> Distribution Metadata
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {renderToggleItem(Piano, "Is Piano", isPiano, handleUpdateIsPiano)}
        {renderToggleItem(Music, "Is Instrumental", isInstrumental, handleUpdateIsInstrumental)}
        {renderToggleItem(CheckCircle, "Is Original Song", isOriginalSong, handleUpdateIsOriginalSong)}
        {renderToggleItem(XCircle, "Explicit Lyrics", hasExplicitLyrics, handleUpdateHasExplicitLyrics)}
        
        {isPending && (
            <div className="flex items-center justify-center pt-2">
                <Loader2 className="h-4 w-4 mr-2 animate-spin text-primary" /> Saving...
            </div>
        )}
      </CardContent>
    </Card>
  );
};

export default DistributionTogglesCard;