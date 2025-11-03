import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Info, Hash, Gauge, Palette, Music, Piano, CheckCircle, XCircle, Loader2, Send, Clock, Users, Volume2, Globe } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import EditableField from './EditableField';
import GenreSelect from './GenreSelect';
import SelectField from './SelectField';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import {
    INSIGHT_CONTENT_TYPES,
    INSIGHT_LANGUAGES,
    INSIGHT_PRIMARY_USES,
    INSIGHT_AUDIENCE_LEVELS,
    INSIGHT_AUDIENCE_AGES,
    INSIGHT_VOICES,
} from '@/lib/insight-constants';

// --- Constants for Select Fields ---
const MUSICAL_KEYS = [
    "C Major", "C# Major", "D Major", "Eb Major", "E Major", "F Major", "F# Major", "G Major", "Ab Major", "A Major", "Bb Major", "B Major",
    "C Minor", "C# Minor", "D Minor", "Eb Minor", "E Minor", "F Minor", "F# Minor", "G Minor", "Ab Minor", "A Minor", "Bb Minor", "B Minor",
];

const MOODS = [
    "Calm", "Energetic", "Melancholy", "Uplifting", "Mysterious", "Reflective", "Tense", "Joyful", 
    "Dreamy", "Aggressive", "Peaceful", "Hopeful", "Ambient", "Cinematic", "Epic", "Introspective"
];
// --- End Constants ---


interface AnalysisData {
  simulated_key?: string;
  simulated_tempo?: number;
  mood?: string;
  [key: string]: any;
}

interface Improvisation {
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
  // NEW INSIGHT TIMER FIELDS
  insight_content_type: string | null;
  insight_language: string | null;
  insight_primary_use: string | null;
  insight_audience_level: string | null;
  insight_audience_age: string[] | null;
  insight_voice: string | null;
  is_submitted_to_distrokid: boolean | null; // NEW
  is_submitted_to_insight_timer: boolean | null; // NEW
}

interface ImprovisationMetadataDialogProps {
  imp: Improvisation;
  isPending: boolean;
  isCoreMetadataComplete: boolean;
  handleUpdatePrimaryGenre: (v: string) => Promise<void>;
  handleUpdateSecondaryGenre: (v: string) => Promise<void>;
  handleUpdateAnalysisData: (key: keyof AnalysisData, newValue: string) => Promise<void>;
  handleUpdateIsImprovisation: (value: string) => Promise<void>;
  // Removed toggle handlers as they are now in DistributionTogglesCard
  // handleUpdateIsPiano: (checked: boolean) => Promise<void>;
  // handleUpdateIsInstrumental: (checked: boolean) => Promise<void>;
  // handleUpdateIsOriginalSong: (checked: boolean) => Promise<void>;
  // handleUpdateHasExplicitLyrics: (checked: boolean) => Promise<void>;
  // Removed Insight Timer handlers as they are now in InsightTimerTab
  // handleUpdateInsightContentType: (value: string) => Promise<void>;
  // handleUpdateInsightLanguage: (value: string) => Promise<void>;
  // handleUpdateInsightPrimaryUse: (value: string) => Promise<void>;
  // handleUpdateInsightAudienceLevel: (value: string) => Promise<void>;
  // handleUpdateInsightAudienceAge: (value: string[]) => Promise<void>;
  // handleUpdateInsightVoice: (value: string) => Promise<void>;
}

const ImprovisationMetadataDialog: React.FC<ImprovisationMetadataDialogProps> = ({
  imp,
  isPending,
  isCoreMetadataComplete,
  handleUpdatePrimaryGenre,
  handleUpdateSecondaryGenre,
  handleUpdateAnalysisData,
  handleUpdateIsImprovisation,
  // Removed toggle handlers
  // handleUpdateIsPiano,
  // handleUpdateIsInstrumental,
  // handleUpdateIsOriginalSong,
  // handleUpdateHasExplicitLyrics,
  // Removed Insight Timer handlers
  // handleUpdateInsightContentType,
  // handleUpdateInsightLanguage,
  // handleUpdateInsightPrimaryUse,
  // handleUpdateInsightAudienceLevel,
  // handleUpdateInsightAudienceAge,
  // handleUpdateInsightVoice,
}) => {
  const analysis = imp.analysis_data;
  // Removed currentAudienceAges and handleAudienceAgeChange as they are now in InsightTimerTab

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
        disabled={isPending}
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
          disabled={isPending}
          allowCustom={label === 'Mood'}
          className="h-8" 
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
          disabled={isPending}
        />
      </div>
    </div>
  );
  
  // Removed renderInsightSelectItem and renderToggleItem as they are no longer used here

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" title="Edit Improvisation Metadata" className="h-8 w-8 relative">
          <Info className="h-5 w-5 text-primary" />
          {isCoreMetadataComplete && (
            <CheckCircle className="absolute -top-1 -right-1 h-4 w-4 text-green-500 bg-background rounded-full border border-background" />
          )}
        </Button>
      </DialogTrigger>
      {/* Increased width to max-w-4xl */}
      <DialogContent className="sm:max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold flex items-center">
            <Info className="h-6 w-6 mr-2" /> Improvisation Metadata
          </DialogTitle>
          <DialogDescription>
            Edit core technical data for your improvisation. Distribution toggles and Insight Timer metadata are now on the "Distribution Prep" tab.
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

                {/* Two-Column Layout for Metadata */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    
                    {/* COLUMN 1: Core & Technical */}
                    <div className="space-y-6">
                        
                        {/* Type & Genre */}
                        <div className="space-y-4">
                            <h3 className="text-lg font-semibold flex items-center"><Music className="h-5 w-5 mr-2" /> Type & Genre</h3>
                            
                            <div className="space-y-2 border-b pb-4">
                                <Label className="font-semibold flex items-center"><Piano className="h-4 w-4 mr-2" /> Improvisation Type</Label>
                                <RadioGroup 
                                    value={String(imp.is_improvisation)} 
                                    onValueChange={handleUpdateIsImprovisation}
                                    disabled={isPending}
                                    className="flex space-x-4 ml-4"
                                >
                                    <div className="flex items-center space-x-2">
                                      <RadioGroupItem value="true" id="sheet-improv" />
                                      <Label htmlFor="sheet-improv">Spontaneous Improvisation</Label>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                      <RadioGroupItem value="false" id="sheet-composition" />
                                      <Label htmlFor="sheet-composition">Fixed Composition</Label>
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
                            <div className="space-y-3">
                                {/* Key (SelectField) */}
                                {renderSelectAnalysisItem(Hash, "Key", analysis?.simulated_key, MUSICAL_KEYS, 'simulated_key')}
                                
                                {/* Tempo (EditableField - numerical validation handled in parent) */}
                                {renderEditableItem(Gauge, "Tempo (BPM)", analysis?.simulated_tempo, 'simulated_tempo', 'number')}
                                
                                {/* Mood (SelectField with custom allowed) */}
                                {renderSelectAnalysisItem(Palette, "Mood", analysis?.mood, MOODS, 'mood')}
                            </div>
                        </div>
                        
                        {/* Removed Distribution Toggles section */}
                    </div>

                    {/* COLUMN 2: Insight Timer Metadata (Removed from here) */}
                    <div className="space-y-6">
                        <h3 className="text-lg font-semibold flex items-center"><Clock className="h-5 w-5 mr-2" /> Insight Timer Metadata (Moved)</h3>
                        <p className="text-sm text-muted-foreground">
                            Insight Timer specific metadata fields have been moved to the dedicated "Insight Timer Prep" tab under "Distribution Prep" for a more streamlined workflow.
                        </p>
                        <p className="text-sm text-muted-foreground mt-2">
                            This dialog now focuses solely on core improvisation details and technical analysis.
                        </p>
                    </div>
                </div>
            </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

export default ImprovisationMetadataDialog;