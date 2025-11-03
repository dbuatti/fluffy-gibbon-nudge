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

interface Composition { // Renamed interface
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
}

interface CompositionMetadataDialogProps {
  imp: Composition; // Updated prop name and type
  isPending: boolean;
  isCoreMetadataComplete: boolean;
  handleUpdatePrimaryGenre: (v: string) => Promise<void>;
  handleUpdateSecondaryGenre: (v: string) => Promise<void>;
  handleUpdateAnalysisData: (key: keyof AnalysisData, newValue: string) => Promise<void>;
  handleUpdateIsImprovisation: (value: string) => Promise<void>;
  handleUpdateIsPiano: (checked: boolean) => Promise<void>;
  handleUpdateIsInstrumental: (checked: boolean) => Promise<void>;
  handleUpdateIsOriginalSong: (checked: boolean) => Promise<void>;
  handleUpdateHasExplicitLyrics: (checked: boolean) => Promise<void>;
  // NEW HANDLERS
  handleUpdateInsightContentType: (value: string) => Promise<void>;
  handleUpdateInsightLanguage: (value: string) => Promise<void>;
  handleUpdateInsightPrimaryUse: (value: string) => Promise<void>;
  handleUpdateInsightAudienceLevel: (value: string) => Promise<void>;
  handleUpdateInsightAudienceAge: (value: string[]) => Promise<void>;
  handleUpdateInsightVoice: (value: string) => Promise<void>;
}

const CompositionMetadataDialog: React.FC<CompositionMetadataDialogProps> = ({
  imp, // Updated prop name
  isPending,
  isCoreMetadataComplete,
  handleUpdatePrimaryGenre,
  handleUpdateSecondaryGenre,
  handleUpdateAnalysisData,
  handleUpdateIsImprovisation,
  handleUpdateIsPiano,
  handleUpdateIsInstrumental,
  handleUpdateIsOriginalSong,
  handleUpdateHasExplicitLyrics,
  handleUpdateInsightContentType,
  handleUpdateInsightLanguage,
  handleUpdateInsightPrimaryUse,
  handleUpdateInsightAudienceLevel,
  handleUpdateInsightAudienceAge,
  handleUpdateInsightVoice,
}) => {
  const analysis = imp.analysis_data;
  const currentAudienceAges = imp.insight_audience_age || [];

  const handleAudienceAgeChange = (age: string, checked: boolean) => {
    const newAges = checked
      ? [...currentAudienceAges, age]
      : currentAudienceAges.filter(a => a !== age);
      
    handleUpdateInsightAudienceAge(newAges);
  };

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
  
  const renderInsightSelectItem = (Icon: React.ElementType, label: string, value: string | null | undefined, options: string[], onSave: (v: string) => Promise<void>, allowCustom: boolean = false) => (
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
          allowCustom={allowCustom}
          className="h-8"
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
        <Button variant="ghost" size="icon" title="Edit Composition Metadata" className="h-8 w-8 relative">
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

                {/* Two-Column Layout for Metadata */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    
                    {/* COLUMN 1: Core & Technical */}
                    <div className="space-y-6">
                        
                        {/* Type & Genre */}
                        <div className="space-y-4">
                            <h3 className="text-lg font-semibold flex items-center"><Music className="h-5 w-5 mr-2" /> Type & Genre</h3>
                            
                            <div className="space-y-2 border-b pb-4">
                                <Label className="font-semibold flex items-center"><Piano className="h-4 w-4 mr-2" /> Composition Type</Label>
                                <RadioGroup 
                                    value={String(imp.is_improvisation)} 
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
                            <div className="space-y-3">
                                {/* Key (SelectField) */}
                                {renderSelectAnalysisItem(Hash, "Key", analysis?.simulated_key, MUSICAL_KEYS, 'simulated_key')}
                                
                                {/* Tempo (EditableField - numerical validation handled in parent) */}
                                {renderEditableItem(Gauge, "Tempo (BPM)", analysis?.simulated_tempo, 'simulated_tempo', 'number')}
                                
                                {/* Mood (SelectField with custom allowed) */}
                                {renderSelectAnalysisItem(Palette, "Mood", analysis?.mood, MOODS, 'mood')}
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

                    {/* COLUMN 2: Insight Timer Metadata */}
                    <div className="space-y-6">
                        <h3 className="text-lg font-semibold flex items-center"><Clock className="h-5 w-5 mr-2" /> Insight Timer Metadata</h3>
                        <p className="text-sm text-muted-foreground">
                            These fields are required for submission to meditation platforms like Insight Timer.
                        </p>
                        <div className="space-y-2">
                            {/* 1. Content Type */}
                            {renderInsightSelectItem(Music, "Content Type", imp.insight_content_type, INSIGHT_CONTENT_TYPES, handleUpdateInsightContentType)}
                            
                            {/* 2. Language */}
                            {renderInsightSelectItem(Globe, "Language", imp.insight_language, INSIGHT_LANGUAGES, handleUpdateInsightLanguage)}
                            
                            {/* 3. Primary Use */}
                            {renderInsightSelectItem(Clock, "Primary Use", imp.insight_primary_use, INSIGHT_PRIMARY_USES, handleUpdateInsightPrimaryUse)}
                            
                            {/* 4. Audience Level */}
                            {renderInsightSelectItem(Users, "Experience Level", imp.insight_audience_level, INSIGHT_AUDIENCE_LEVELS, handleUpdateInsightAudienceLevel)}
                            
                            {/* 6. Voice */}
                            {renderInsightSelectItem(Volume2, "Voice", imp.insight_voice, INSIGHT_VOICES, handleUpdateInsightVoice)}
                            
                            {/* 5. Audience Age (Checkbox Group) */}
                            <div className="py-2 border-b last:border-b-0">
                                <Label className="font-semibold flex items-center mb-2">
                                    <Users className="h-5 w-5 mr-2 text-muted-foreground" />
                                    Age Group (Select all that apply)
                                </Label>
                                <div className="grid grid-cols-2 gap-2 ml-4">
                                    {INSIGHT_AUDIENCE_AGES.map(age => (
                                        <div key={age} className="flex items-center space-x-2">
                                            <Checkbox
                                                id={age}
                                                checked={currentAudienceAges.includes(age)}
                                                onCheckedChange={(checked) => handleAudienceAgeChange(age, !!checked)}
                                                disabled={isPending}
                                            />
                                            <Label htmlFor={age} className="text-sm font-normal">{age}</Label>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

export default CompositionMetadataDialog;