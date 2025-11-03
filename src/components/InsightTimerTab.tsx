import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BookOpen, Clock, Users, Info, CheckCircle, XCircle, Music, Globe, Volume2, Sparkles, Loader2, Copy, Check } from 'lucide-react'; // NEW: Import Check
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { showSuccess, showError } from '@/utils/toast';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useUpdateImprovisation } from '@/hooks/useUpdateImprovisation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { INSIGHT_BENEFITS, INSIGHT_PRACTICES, INSIGHT_THEMES, INSIGHT_CONTENT_TYPES, INSIGHT_LANGUAGES, INSIGHT_PRIMARY_USES, INSIGHT_AUDIENCE_LEVELS, INSIGHT_AUDIENCE_AGES, INSIGHT_VOICES } from '@/lib/insight-constants';
import { cn } from '@/lib/utils';
import SelectField from './SelectField';

interface ImprovisationData {
  id: string;
  generated_name: string | null;
  primary_genre: string | null;
  is_improvisation: boolean | null;
  is_metadata_confirmed: boolean | null;
  description: string | null;
  
  // INSIGHT TIMER FIELDS
  insight_content_type: string | null;
  insight_language: string | null;
  insight_primary_use: string | null;
  insight_audience_level: string | null;
  insight_audience_age: string[] | null;
  insight_benefits: string[] | null;
  insight_practices: string | null;
  insight_themes: string[] | null;
  insight_voice: string | null;
  is_submitted_to_insight_timer: boolean | null; // NEW
}

interface InsightTimerTabProps {
  imp: ImprovisationData;
  aiGeneratedDescription: string;
  isPopulating: boolean;
  handleAIPopulateMetadata: () => Promise<void>;
  setAiGeneratedDescription: (description: string) => void;
  handleUpdateIsMetadataConfirmed: (checked: boolean) => Promise<void>;
  handleUpdateIsSubmittedToInsightTimer: (checked: boolean) => Promise<void>; // NEW
}

// Helper function to get the benefit with its category
const getBenefitWithCategory = (benefit: string): string => {
  for (const category in INSIGHT_BENEFITS) {
    if (INSIGHT_BENEFITS[category].includes(benefit)) {
      return `${category}: ${benefit}`;
    }
  }
  return benefit; // Fallback, though should not happen if benefit is valid
};

const InsightTimerTab: React.FC<InsightTimerTabProps> = ({ 
    imp,
    aiGeneratedDescription, 
    isPopulating, 
    handleAIPopulateMetadata,
    setAiGeneratedDescription,
    handleUpdateIsMetadataConfirmed,
    handleUpdateIsSubmittedToInsightTimer, // NEW
}) => {
  
  // Local state for description, initialized from AI result or kept empty
  const [description, setDescription] = useState(imp.description || '');
  const updateMutation = useUpdateImprovisation(imp.id);

  // Sync local state when DB description changes (e.g., after AI population or manual save)
  useEffect(() => {
    setDescription(imp.description || '');
  }, [imp.description]);

  const handleCopy = () => {
    if (description) {
      navigator.clipboard.writeText(description);
      showSuccess('Description copied to clipboard!');
    } else {
      showError('No description to copy.');
    }
  };
  
  const handleSaveDescription = async () => {
    if (description === (imp.description || '')) return; // No change
    if (description.trim() === '') {
        showError("Description cannot be empty.");
        setDescription(imp.description || ''); // Revert to last saved
        return;
    }
    try {
        await updateMutation.mutateAsync({ description: description });
        showSuccess("Description saved successfully.");
    } catch (error) {
        console.error("Failed to save description:", error);
        showError("Failed to save description.");
        setDescription(imp.description || ''); // Revert on error
    }
  };

  // Check required fields for music submission (assuming Music content type)
  const isContentTypeSet = !!imp.insight_content_type;
  const isLanguageSet = !!imp.insight_language;
  const isPrimaryUseSet = !!imp.insight_primary_use;
  const isAudienceLevelSet = !!imp.insight_audience_level;
  const hasBenefits = (imp.insight_benefits?.length || 0) > 0;
  const hasPractices = !!imp.insight_practices;
  const hasThemes = (imp.insight_themes?.length || 0) > 0;
  const hasDescription = description.trim().length > 0; // Use local state for current check
  
  // If the content type is 'Music', we assume the other fields are required for full categorization.
  const isCategorizationComplete = isContentTypeSet && isLanguageSet && isPrimaryUseSet && isAudienceLevelSet && hasBenefits && hasPractices && hasThemes && hasDescription;

  // --- Handlers for Categorization Fields ---
  
  // --- Benefits (Multi-Select, Max 3) ---
  const handleBenefitChange = (benefit: string, checked: boolean) => {
    const currentBenefits = imp.insight_benefits || [];
    let newBenefits = checked
      ? [...currentBenefits, benefit]
      : currentBenefits.filter(b => b !== benefit);

    // Enforce max 3 benefits
    if (newBenefits.length > 3) {
      newBenefits = newBenefits.slice(0, 3);
    }
    
    updateMutation.mutate({ insight_benefits: newBenefits });
  };

  // --- Practices (Single Select) ---
  const handlePracticeChange = (practice: string) => {
    updateMutation.mutate({ insight_practices: practice });
  };

  // --- Themes (Multi-Select) ---
  const handleThemeChange = (theme: string, checked: boolean) => {
    const currentThemes = imp.insight_themes || [];
    const newThemes = checked
      ? [...currentThemes, theme]
      : currentThemes.filter(t => t !== theme);
      
    updateMutation.mutate({ insight_themes: newThemes });
  };
  
  // --- Core Field Handlers (Re-implementing logic from ImprovisationMetadataDialog) ---
  const handleUpdateInsightContentType = (value: string) => updateMutation.mutateAsync({ insight_content_type: value });
  const handleUpdateInsightLanguage = (value: string) => updateMutation.mutateAsync({ insight_language: value });
  const handleUpdateInsightPrimaryUse = (value: string) => updateMutation.mutateAsync({ insight_primary_use: value });
  const handleUpdateInsightAudienceLevel = (value: string) => updateMutation.mutateAsync({ insight_audience_level: value });
  const handleUpdateInsightVoice = (value: string) => updateMutation.mutateAsync({ insight_voice: value });
  
  const handleAudienceAgeChange = (age: string, checked: boolean) => {
    const currentAudienceAges = imp.insight_audience_age || [];
    const newAges = checked
      ? [...currentAudienceAges, age]
      : currentAudienceAges.filter(a => a !== age);
      
    updateMutation.mutate({ insight_audience_age: newAges });
  };
  
  // --- Rendering Functions ---

  const renderCheckboxGroup = (title: string, options: { [key: string]: string[] }, selectedValues: string[], onChange: (value: string, checked: boolean) => void, maxSelection?: number) => (
    <Card className="shadow-none border">
      <CardHeader className="py-3 px-4 border-b">
        <CardTitle className="text-base font-semibold">
          {title} 
          {maxSelection && <span className="text-sm font-normal text-muted-foreground ml-2"> (Select up to {maxSelection})</span>}
          {updateMutation.isPending && <Loader2 className="h-4 w-4 ml-2 inline-block animate-spin text-primary" />}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 space-y-4">
        {Object.entries(options).map(([category, items]) => (
          <div key={category} className="space-y-2">
            <h4 className="text-sm font-bold text-primary">{category}</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {items.map(item => {
                const isChecked = selectedValues.includes(item);
                const isDisabled = maxSelection && selectedValues.length >= maxSelection && !isChecked;
                
                return (
                  <div key={item} className={cn("flex items-center space-x-2 p-2 rounded-md transition-colors", isDisabled ? "opacity-50 cursor-not-allowed" : "hover:bg-muted/50")}>
                    <Checkbox
                      id={item}
                      checked={isChecked}
                      onCheckedChange={(checked) => onChange(item, !!checked)}
                      disabled={updateMutation.isPending || isDisabled}
                    />
                    <Label htmlFor={item} className="text-sm font-normal cursor-pointer">
                      {item}
                    </Label>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );

  const renderRadioGroup = (title: string, options: { [key: string]: string[] }, selectedValue: string | null, onChange: (value: string) => void) => (
    <Card className="shadow-none border">
      <CardHeader className="py-3 px-4 border-b">
        <CardTitle className="text-base font-semibold">
          {title} 
          <span className="text-sm font-normal text-muted-foreground ml-2"> (Select one option)</span>
          {updateMutation.isPending && <Loader2 className="h-4 w-4 ml-2 inline-block animate-spin text-primary" />}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 space-y-4">
        <RadioGroup 
          value={selectedValue || ''} 
          onValueChange={onChange}
          disabled={updateMutation.isPending}
          className="space-y-4"
        >
          {Object.entries(options).map(([category, items]) => (
            <div key={category} className="space-y-2">
              <h4 className="text-sm font-bold text-primary">{category}</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {items.map(item => (
                  <div key={item} className="flex items-center space-x-2 p-2 rounded-md hover:bg-muted/50">
                    <RadioGroupItem value={item} id={item} />
                    <Label htmlFor={item} className="text-sm font-normal cursor-pointer">
                      {item}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </RadioGroup>
      </CardContent>
    </Card>
  );
  
  // New render function for multi-select fields to show actual values
  const renderMultiSelectStatusItem = (label: string, values: string[] | null, Icon: React.ElementType, isRequired: boolean = false) => {
    const actualValues = values || [];
    const isSet = actualValues.length > 0;
    
    return (
      <div className="flex flex-col py-2 border-b last:border-b-0">
        <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-medium text-muted-foreground flex items-center">
              <Icon className="w-4 h-4 mr-2" /> {label}
            </span>
            <Badge variant={isSet ? 'default' : (isRequired ? 'destructive' : 'outline')} className="flex items-center">
                {isSet ? <CheckCircle className="w-3 h-3 mr-1" /> : <XCircle className="w-3 h-3 mr-1" />}
                {isSet ? `${actualValues.length} selected` : 'Not Set'}
            </Badge>
        </div>
        {isSet && (
            <div className="flex flex-wrap gap-1 mt-1 ml-6">
                {actualValues.map(v => <Badge key={v} variant="secondary" className="text-xs px-2 py-0.5">{getBenefitWithCategory(v)}</Badge>)}
            </div>
        )}
      </div>
    );
  };
  
  // New render function for single-select fields to show actual value
  const renderSingleSelectStatusItem = (label: string, value: string | null, Icon: React.ElementType, isRequired: boolean = false) => {
    const isSet = !!value;
    
    return (
      <div className="flex items-center justify-between py-2 border-b last:border-b-0">
        <span className="text-sm font-medium text-muted-foreground flex items-center">
          <Icon className="w-4 h-4 mr-2" /> {label}
        </span>
        <Badge variant={isSet ? 'default' : (isRequired ? 'destructive' : 'outline')} className="flex items-center">
            {isSet ? <CheckCircle className="w-3 h-3 mr-1" /> : <XCircle className="w-3 h-3 mr-1" />}
            {value || 'Not Set'}
        </Badge>
      </div>
    );
  };
  
  const renderInsightSelectField = (Icon: React.ElementType, label: string, value: string | null | undefined, options: string[], onSave: (v: string) => Promise<void>) => (
    <div className="flex items-center space-x-2 py-2 border-b last:border-b-0">
      <Icon className="h-5 w-5 mr-2 text-muted-foreground flex-shrink-0" />
      <span className="text-sm font-medium text-muted-foreground w-32 flex-shrink-0">{label}:</span>
      <div className="flex-grow">
        <SelectField
          value={value}
          label={label}
          options={options}
          onSave={onSave}
          placeholder={`Select ${label}`}
          disabled={updateMutation.isPending}
          allowCustom={false}
        />
      </div>
    </div>
  );


  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl flex items-center">
            <Info className="w-5 h-5 mr-2" /> Insight Timer Submission Checklist
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Complete the required fields below to ensure your track meets Insight Timer's submission guidelines.
          </p>
          
          {/* AI Population Button */}
          <Button 
            onClick={handleAIPopulateMetadata} 
            disabled={isPopulating} 
            className="w-full h-10 text-base bg-purple-600 hover:bg-purple-700 dark:bg-purple-700 dark:hover:bg-purple-800"
          >
            {isPopulating ? (
              <Loader2 className="h-5 w-5 mr-2 animate-spin" />
            ) : (
              <Sparkles className="h-5 w-5 mr-2" />
            )}
            AI Populate ALL Metadata & Description
          </Button>

          {/* Required Fields Summary */}
          <div className="p-4 border rounded-lg bg-muted/50 space-y-1">
            <h4 className="font-semibold text-base mb-2">Required Core Metadata:</h4>
            {renderSingleSelectStatusItem("Content Type", imp.insight_content_type, Music, true)}
            {renderSingleSelectStatusItem("Language", imp.insight_language, Globe, true)}
            {renderSingleSelectStatusItem("Primary Use", imp.insight_primary_use, Clock, true)}
            {renderSingleSelectStatusItem("Experience Level", imp.insight_audience_level, Users, true)}
            {renderMultiSelectStatusItem("Age Group", imp.insight_audience_age, Users)}
            {renderSingleSelectStatusItem("Voice", imp.insight_voice, Volume2)}
            
            <Separator className="my-3" />
            
            <h4 className="font-semibold text-base mb-2">Required Categorization:</h4>
            {renderMultiSelectStatusItem("Benefits (Max 3)", imp.insight_benefits, CheckCircle, true)}
            {renderSingleSelectStatusItem("Practices (Select 1)", imp.insight_practices, BookOpen, true)}
            {renderMultiSelectStatusItem("Themes", imp.insight_themes, Info, true)}
            
            <div className="flex items-center justify-between py-2 border-b last:border-b-0">
                <span className="text-sm font-medium text-muted-foreground flex items-center">
                    <BookOpen className="w-4 h-4 mr-2" /> Description Generated
                </span>
                <Badge variant={hasDescription ? 'default' : 'destructive'}>
                    {hasDescription ? <CheckCircle className="w-3 h-3 mr-1" /> : <XCircle className="w-3 h-3 mr-1" />}
                    {hasDescription ? 'Set' : 'Missing'}
                </Badge>
            </div>

            {!isCategorizationComplete && (
                <div className="pt-4 text-center">
                    <p className="text-sm text-red-600 dark:text-red-400 mb-2 font-semibold">
                        CRITICAL: Submission is not ready. Complete all required fields.
                    </p>
                </div>
            )}
          </div>

          {/* Description Generator (Inline) */}
          <Card className="mt-4">
            <CardContent className="pt-6 space-y-4">
                <div className="flex justify-between items-center">
                    <h4 className="font-semibold flex items-center">
                        <Sparkles className="w-4 h-4 mr-2 text-purple-500" /> AI Description Generator
                    </h4>
                    {/* Note: The generation button is now the main AI button above */}
                </div>

                <Textarea
                    placeholder="Click 'AI Populate ALL Metadata' above to generate a compliant 3-5 sentence description based on your notes and analysis..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    onBlur={handleSaveDescription} // Save on blur
                    rows={5}
                    className="min-h-[120px]"
                />
                
                <Button 
                    onClick={handleCopy} 
                    disabled={!description} 
                    variant="outline" 
                    className="w-full"
                >
                    <Copy className="h-4 w-4 mr-2" /> Copy Description
                </Button>
                
                <p className="text-xs text-muted-foreground">
                    *Ensure the description is 3-5 sentences and contains no promotional links or mentions of other platforms, as required by Insight Timer.
                </p>
            </CardContent>
          </Card>

          <div className="space-y-2 pt-4">
            <h4 className="font-semibold flex items-center"><BookOpen className="w-4 h-4 mr-2" /> Suggested Title</h4>
            <p className="text-lg font-mono bg-muted p-2 rounded">{imp.generated_name || 'Awaiting Analysis'}</p>
          </div>
        </CardContent>
      </Card>
      
      {/* Metadata Confirmation Toggle (MOVED HERE) */}
      <Card id="insight-timer-confirmation" className="p-4 border-2 border-yellow-500/50 bg-yellow-50/50 dark:bg-yellow-950/50">
        <div className="flex items-center justify-between">
            <div className="space-y-1">
                <Label htmlFor="metadata-confirm" className="text-base font-bold flex items-center">
                    <CheckCircle className="h-5 w-5 mr-2 text-yellow-700 dark:text-yellow-300" />
                    Metadata Review Confirmation
                </Label>
                <p className="text-sm text-muted-foreground">
                    I confirm that all Insight Timer metadata fields (including the description) have been reviewed and are accurate.
                </p>
            </div>
            <Switch
                id="metadata-confirm"
                checked={!!imp.is_metadata_confirmed}
                onCheckedChange={handleUpdateIsMetadataConfirmed}
                disabled={updateMutation.isPending || !isCategorizationComplete}
            />
        </div>
        {!isCategorizationComplete && (
            <p className="text-xs text-red-600 dark:text-red-400 mt-2">
                *Confirmation is disabled until all required categorization fields are set.
            </p>
        )}
      </Card>
      
      {/* Complex Categorization Fields (NOW TABBED) */}
      <h3 className="text-xl font-bold mt-8">Detailed Categorization</h3>
      
      <Tabs defaultValue="core-fields">
        <TabsList className="grid w-full grid-cols-4 h-auto p-1">
          <TabsTrigger value="core-fields" className="text-base py-2 flex items-center"><Info className="h-4 w-4 mr-1" /> Core Fields</TabsTrigger>
          <TabsTrigger value="benefits" className="text-base py-2">Benefits (Max 3)</TabsTrigger>
          <TabsTrigger value="practices" className="text-base py-2">Practices (Select 1)</TabsTrigger>
          <TabsTrigger value="themes" className="text-base py-2">Themes</TabsTrigger>
        </TabsList>
        
        <TabsContent value="core-fields" className="mt-4">
            <Card className="shadow-none border">
                <CardHeader className="py-3 px-4 border-b">
                    <CardTitle className="text-base font-semibold">
                        Required Single-Select Fields
                        {updateMutation.isPending && <Loader2 className="h-4 w-4 ml-2 inline-block animate-spin text-primary" />}
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-4 space-y-2">
                    {renderInsightSelectField(Music, "Content Type", imp.insight_content_type, INSIGHT_CONTENT_TYPES, handleUpdateInsightContentType)}
                    {renderInsightSelectField(Globe, "Language", imp.insight_language, INSIGHT_LANGUAGES, handleUpdateInsightLanguage)}
                    {renderInsightSelectField(Clock, "Primary Use", imp.insight_primary_use, INSIGHT_PRIMARY_USES, handleUpdateInsightPrimaryUse)}
                    {renderInsightSelectField(Users, "Experience Level", imp.insight_audience_level, INSIGHT_AUDIENCE_LEVELS, handleUpdateInsightAudienceLevel)}
                    {renderInsightSelectField(Volume2, "Voice", imp.insight_voice, INSIGHT_VOICES, handleUpdateInsightVoice)}
                    
                    {/* Audience Age Checkbox Group */}
                    <div className="py-2 border-b last:border-b-0">
                        <Label className="font-semibold flex items-center mb-2 text-sm text-muted-foreground">
                            <Users className="h-5 w-5 mr-2 text-muted-foreground" />
                            Age Group (Select all that apply)
                        </Label>
                        <div className="grid grid-cols-2 gap-2 ml-4">
                            {INSIGHT_AUDIENCE_AGES.map(age => (
                                <div key={age} className="flex items-center space-x-2">
                                    <Checkbox
                                        id={`age-${age}`}
                                        checked={(imp.insight_audience_age || []).includes(age)}
                                        onCheckedChange={(checked) => handleAudienceAgeChange(age, !!checked)}
                                        disabled={updateMutation.isPending}
                                    />
                                    <Label htmlFor={`age-${age}`} className="text-sm font-normal">{age}</Label>
                                </div>
                            ))}
                        </div>
                    </div>
                </CardContent>
            </Card>
        </TabsContent>
        
        <TabsContent value="benefits" className="mt-4">
          {renderCheckboxGroup(
            "Benefits", 
            INSIGHT_BENEFITS, 
            imp.insight_benefits || [], 
            handleBenefitChange, 
            3
          )}
        </TabsContent>
        
        <TabsContent value="practices" className="mt-4">
          {renderRadioGroup(
            "Practices", 
            INSIGHT_PRACTICES, 
            imp.insight_practices, 
            handlePracticeChange
          )}
        </TabsContent>
        
        <TabsContent value="themes" className="mt-4">
          {renderCheckboxGroup(
            "Themes & Belief Systems", 
            INSIGHT_THEMES, 
            imp.insight_themes || [], 
            handleThemeChange
          )}
        </TabsContent>
      </Tabs>

      <Separator className="my-6" />

      {/* NEW: Mark as Submitted to Insight Timer */}
      <div className="flex items-center justify-between p-3 bg-green-50/50 dark:bg-green-950/50 border border-green-500/50 rounded-lg">
        <div className="space-y-1">
            <Label htmlFor="insight-timer-submitted" className="text-base font-bold flex items-center text-green-700 dark:text-green-300">
                <Check className="h-5 w-5 mr-2" /> Mark as Submitted to Insight Timer
            </Label>
            <p className="text-sm text-muted-foreground">
                Check this box once you have successfully submitted this track to Insight Timer.
            </p>
        </div>
        <Switch
            id="insight-timer-submitted"
            checked={!!imp.is_submitted_to_insight_timer}
            onCheckedChange={handleUpdateIsSubmittedToInsightTimer}
            disabled={updateMutation.isPending || !imp.is_metadata_confirmed} // Only allow marking as submitted if metadata is confirmed
        />
      </div>
    </div>
  );
};

export default InsightTimerTab;