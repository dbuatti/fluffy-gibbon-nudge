import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Info, Hash, Gauge, Palette, Music, Piano, CheckCircle, XCircle, Loader2, Send, Clock, Users } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import EditableField from './EditableField';
import GenreSelect from './GenreSelect';
import SelectField from './SelectField'; // Import the new SelectField
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';

// --- Constants for Select Fields ---
const MUSICAL_KEYS = [
    "C Major", "C# Major", "D Major", "Eb Major", "E Major", "F Major", "F# Major", "G Major", "Ab Major", "A Major", "Bb Major", "B Major",
    "C Minor", "C# Minor", "D Minor", "Eb Minor", "E Minor", "F Minor", "F# Minor", "G Minor", "Ab Minor", "A Minor", "Bb Minor", "B Minor",
];

const MOODS = [
    "Calm", "Energetic", "Melancholy", "Uplifting", "Mysterious", "Reflective", "Tense", "Joyful", 
    "Dreamy", "Aggressive", "Peaceful", "Hopeful", "Ambient", "Cinematic", "Epic", "Introspective"
];

const INSIGHT_USE_OPTIONS = [
    "Meditation", "Sleep", "Focus", "Relaxation", "Movement", "Study", "Yoga", "Sound Bath"
];

const INSIGHT_AUDIENCE_OPTIONS = [
    "Everyone", "Beginners", "Intermediate", "Advanced", "Children", "Seniors"
];
// --- End Constants ---


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
    insight_use: string | null; // NEW
    insight_audience: string | null; // NEW
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
  handleUpdateInsightUse: (value: string) => Promise<void>; // NEW
  handleUpdateInsightAudience: (value: string) => Promise<void>; // NEW
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
  handleUpdateInsightUse,
  handleUpdateInsightAudience,
}) => {
  const analysis = imp.analysis_data;
  const isCompleted = imp.status === 'completed';

  const renderEditableItem = (Icon: React.ElementType, label: string, value: string | number | null | undefined, key: keyof AnalysisData, inputType: 'text' | 'number' = 'text') => (
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
        // Note: EditableField doesn't natively support type="number", but we rely on the handler in ImprovisationDetails to validate tempo as a number.
      />
    </div>
  );

  const renderSelectAnalysisItem = (Icon: React.ElementType, label: string, value: string | null | undefined, options: string[], key: keyof AnalysisData) => (
    <div className="flex items-center space-x-2">
      <Icon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
      <span className="text-sm font-medium text-muted-foreground w-20 flex-shrink-0">{label}:</span>
      <div className="flex-grow">
        <SelectField
          value={value}
          label={label}
          options={options}
          onSave={(v) => handleUpdateAnalysisData(key, v)}
          placeholder={`Select ${label}`}
          disabled={isPending || !isCompleted}
          allowCustom={label === 'Mood'} // Allow custom mood input
        />
      </div>
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
  
  const renderInsightSelectItem = (Icon: React.ElementType, label: string, value: string | null | undefined, options: string[], onSave: (v: string) => Promise<void>) => (
    <div className="flex items-center space-x-2 py-2 border-b last:border-b-0">
      <Icon className="h-5 w-5 mr-2 text-muted-foreground flex-shrink-0" />
      <span className="text-sm font-medium text-muted-foreground w-24 flex-shrink-0">{label}:</span>
      <div className="flex-grow">
        <SelectField
          value={value}
          label={label}
          options={options}
          onSave={onSave}
          placeholder={`Select ${label}`}
          disabled={isPending}
          allowCustom={false}
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
      {/* Increased width to max-w-4xl */}
      <DialogContent className="sm:max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold flex items-center">
            <Info className="h-6 w-6 mr-2" /> Composition Metadata
          </DialogTitle>
          <DialogDescription>
            Edit technical analysis data and distribution toggles for your composition.
          </DialogDescription>
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

                {/* Technical Data (Updated to use SelectField and numerical input) */}
                <div className="space-y-4">
                    <h3 className="text-lg font-semibold flex items-center"><Hash className="h-5 w-5 mr-2" /> Technical Data</h3>
                    {isCompleted ? (
                        <div className="space-y-3">
                            {/* Key (SelectField) */}
                            {renderSelectAnalysisItem(Hash, "Key", analysis?.simulated_key, MUSICAL_KEYS, 'simulated_key')}
                            
                            {/* Tempo (EditableField - numerical validation handled in parent) */}
                            {renderEditableItem(Gauge, "Tempo (BPM)", analysis?.simulated_tempo, 'simulated_tempo', 'number')}
                            
                            {/* Mood (SelectField with custom allowed) */}
                            {renderSelectAnalysisItem(Palette, "Mood", analysis?.mood, MOODS, 'mood')}
                        </div>
                    ) : (
                        <p className="text-sm text-muted-foreground italic">Technical data available after analysis completes.</p>
                    )}
                </div>

                <Separator />
                
                {/* Insight Timer Metadata (NEW SECTION) */}
                <div className="space-y-4">
                    <h3 className="text-lg font-semibold flex items-center"><Clock className="h-5 w-5 mr-2" /> Insight Timer Metadata</h3>
                    <p className="text-sm text-muted-foreground">
                        These fields are required for submission to meditation platforms like Insight Timer.
                    </p>
                    <div className="space-y-2">
                        {renderInsightSelectItem(Clock, "Primary Use", imp.insight_use, INSIGHT_USE_OPTIONS, handleUpdateInsightUse)}
                        {renderInsightSelectItem(Users, "Target Audience", imp.insight_audience, INSIGHT_AUDIENCE_OPTIONS, handleUpdateInsightAudience)}
                    </div>
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