import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Piano, Music, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { useUpdateImprovisation } from '@/hooks/useUpdateImprovisation'; // Renamed hook

interface DistributionTogglesCardProps {
  improvisationId: string; // Renamed prop
  isPiano: boolean | null;
  isInstrumental: boolean | null;
  isOriginalSong: boolean | null;
  hasExplicitLyrics: boolean | null;
}

const DistributionTogglesCard: React.FC<DistributionTogglesCardProps> = ({
  improvisationId, // Renamed prop
  isPiano,
  isInstrumental,
  isOriginalSong,
  hasExplicitLyrics,
}) => {
  const updateMutation = useUpdateImprovisation(improvisationId); // Updated hook
  const isPending = updateMutation.isPending;

  const handleUpdateIsPiano = (checked: boolean) => updateMutation.mutate({ is_piano: checked });
  const handleUpdateIsInstrumental = (checked: boolean) => updateMutation.mutate({ is_instrumental: checked });
  const handleUpdateIsOriginalSong = (checked: boolean) => updateMutation.mutate({ is_original_song: checked });
  const handleUpdateHasExplicitLyrics = (checked: boolean) => updateMutation.mutate({ has_explicit_lyrics: checked });

  const renderToggleItem = (Icon: React.ElementType, label: string, checked: boolean | null, onCheckedChange: (checked: boolean) => void) => (
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