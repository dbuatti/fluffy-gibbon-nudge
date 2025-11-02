import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Info, Hash, Gauge, Palette, Music, Piano, CheckCircle, XCircle, Loader2, Send } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import EditableField from './EditableField';
import GenreSelect from './GenreSelect';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area'; // Use ScrollArea for content overflow

interface AnalysisData {
  simulated_key?: string;
  simulated_tempo?: number;
  mood?: string;
  [key: string]: any;
}

interface CompositionMetadataDialogProps {
  imp: {
    id: string;
    generated_name: string | null;
    status: 'uploaded' | 'analyzing' | 'completed' | 'failed';
    is_ready_for_release: boolean | null;
    is_improvisation: boolean | null;
    is_piano: boolean | null;
    is_instrumental: boolean | null;
    is_original_song: boolean | null;
    has_explicit_lyrics: boolean | null;
    primary_genre: string | null;
    secondary_genre: string | null;
    analysis_data: AnalysisData | null;
  };
  isPending: boolean;
  handleUpdatePrimaryGenre: (v: string) => Promise<void>;
  handleUpdateSecondaryGenre: (v: string) => Promise<void>;
  handleUpdateAnalysisData: (key: keyof AnalysisData, newValue: string) => Promise<void>;
  handleUpdateIsImprovisation: (value: string) => Promise<void>;
  handleUpdateIsPiano: (checked: boolean) => Promise<void>;
  handleUpdateIsInstrumental: (checked: boolean) => Promise<void>;
  handleUpdateIsOriginalSong: (checked: boolean) => Promise<void>;
  handleUpdateHasExplicitLyrics: (checked: boolean) => Promise<void>;
}

const CompositionMetadataDialog: React.FC<CompositionMetadataDialogProps> = ({
  imp,
  isPending,
  handleUpdatePrimaryGenre,
  handleUpdateSecondaryGenre,
  handleUpdateAnalysisData,
  handleUpdateIsImprovisation,
  handleUpdateIsPiano,
  handleUpdateIsInstrumental,
  handleUpdateIsOriginalSong,
  handleUpdateHasExplicitLyrics,
}) => {
  const analysis = imp.analysis_data;
  const isCompleted = imp.status === 'completed';

  const renderEditableItem = (Icon: React.ElementType, label: string, value: string | number | null | undefined, key: keyof AnalysisData) => (
    <div className="flex items-center space-x-2">
      <Icon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
      <span className="text-sm font-medium text-muted-foreground w-20 flex-shrink-0">{label}:</span>
      <EditableField
        value={String(value || '')}
        label={label}
        onSave={(v) => handleUpdateAnalysisData(key, v)}
        className="flex-grow"
        placeholder="Click to set"
        disabled={isPending || !isCompleted}
      />
    </div>
  );

  const renderGenreItem = (Icon: React.ElementType, label: string, value: string | null | undefined, onSave: (v: string) => Promise<void>) => (
    <div className="flex items-center space-x-2">
      <Icon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
      <span className="text-sm font-medium text-muted-foreground w-20 flex-shrink-0">{label}:</span>
      <div className="flex-grow">
        <GenreSelect
          value={value}
          label={label}
          onSave={onSave}
          placeholder="Select or type genre"
          disabled={isPending || !isCompleted}
        />
      </div>
    </div>
  );

  const renderToggleItem = (Icon: React.ElementType, label: string, checked: boolean | null, onCheckedChange: (checked: boolean) => Promise<void>) => (
    <div className="flex items-center justify-between py-2 border-b last:border-b-0">
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
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" title="Edit Composition Metadata" className="h-8 w-8">
          <Info className="h-5 w-5 text-primary" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold flex items-center">
            <Info className="h-6 w-6 mr-2" /> Composition Metadata
          </DialogTitle>
        </DialogHeader>
        
        <ScrollArea className="flex-grow pr-4">
            <div className="space-y-6 py-2">
                {/* Status Summary */}
                <div className="space-y-2 p-4 border rounded-lg bg-muted/50">
                    <div className="flex items-center justify-between">
                        <span className="font-semibold">Status:</span>
                        <Badge>{imp.status.toUpperCase()}</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="font-semibold">Ready for Release:</span>
                        <Badge variant={imp.is_ready_for_release ? 'default' : 'outline'} className="bg-green-500 hover:bg-green-500 text-white">
                            {imp.is_ready_for_release ? <CheckCircle className="h-3 w-3 mr-1" /> : 'Pending'}
                        </Badge>
                    </div>
                    {isPending && (
                        <div className="flex items-center justify-center pt-2">
                            <Loader2 className="h-4 w-4 mr-2 animate-spin text-primary" /> Saving changes...
                        </div>
                    )}
                </div>

                {/* Type & Genre */}
                <div className="space-y-4">
                    <h3 className="text-lg font-semibold flex items-center"><Music className="h-5 w-5 mr-2" /> Type & Genre</h3>
                    
                    <div className="space-y-2 border-b pb-4">
                        <Label className="font-semibold flex items-center"><Piano className="h-4 w-4 mr-2" /> Composition Type</Label>
                        <RadioGroup 
                            defaultValue={String(imp.is_improvisation)} 
                            onValueChange={handleUpdateIsImprovisation}
                            disabled={isPending}
                            className="flex space-x-4 ml-4"
                        >
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="true" id="sheet-improv" />
                              <Label htmlFor="sheet-improv">Improvisation</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="false" id="sheet-composition" />
                              <Label htmlFor="sheet-composition">Composition</Label>
                            </div>
                        </RadioGroup>
                    </div>

                    {renderGenreItem(Music, "Primary Genre", imp.primary_genre, handleUpdatePrimaryGenre)}
                    {renderGenreItem(Music, "Secondary Genre", imp.secondary_genre, handleUpdateSecondaryGenre)}
                </div>

                <Separator />

                {/* Technical Data */}
                <div className="space-y-4">
                    <h3 className="text-lg font-semibold flex items-center"><Hash className="h-5 w-5 mr-2" /> Technical Data</h3>
                    {isCompleted ? (
                        <div className="space-y-3">
                            {renderEditableItem(Hash, "Key", analysis?.simulated_key, 'simulated_key')}
                            {renderEditableItem(Gauge, "Tempo (BPM)", analysis?.simulated_tempo, 'simulated_tempo')}
                            {renderEditableItem(Palette, "Mood", analysis?.mood, 'mood')}
                        </div>
                    ) : (
                        <p className="text-sm text-muted-foreground italic">Technical data available after analysis completes.</p>
                    )}
                </div>

                <Separator />

                {/* Distribution Toggles */}
                <div className="space-y-4">
                    <h3 className="text-lg font-semibold flex items-center"><Send className="h-5 w-5 mr-2" /> Distribution Toggles</h3>
                    <div className="space-y-2">
                        {renderToggleItem(Piano, "Is Piano", imp.is_piano, handleUpdateIsPiano)}
                        {renderToggleItem(Music, "Is Instrumental", imp.is_instrumental, handleUpdateIsInstrumental)}
                        {renderToggleItem(CheckCircle, "Is Original Song", imp.is_original_song, handleUpdateIsOriginalSong)}
                        {renderToggleItem(XCircle, "Explicit Lyrics", imp.has_explicit_lyrics, handleUpdateHasExplicitLyrics)}
                    </div>
                </div>
            </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

export default CompositionMetadataDialog;