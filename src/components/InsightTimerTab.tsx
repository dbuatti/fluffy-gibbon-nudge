import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BookOpen, Clock, Users, Info, CheckCircle, XCircle, Music, Globe, Volume2, Sparkles, Loader2, Copy } from 'lucide-react';
import InsightTimerFormFields from './InsightTimerFormFields';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { showSuccess, showError } from '@/utils/toast';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useUpdateImprovisation } from '@/hooks/useUpdateImprovisation';

interface ImprovisationData {
  id: string;
  generated_name: string | null;
  primary_genre: string | null;
  is_improvisation: boolean | null;
  is_metadata_confirmed: boolean | null; // New field
  
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
}

interface InsightTimerTabProps {
  imp: ImprovisationData;
  aiGeneratedDescription: string;
  isPopulating: boolean;
  handleAIPopulateMetadata: () => Promise<void>;
  setAiGeneratedDescription: (description: string) => void;
  handleUpdateIsMetadataConfirmed: (checked: boolean) => Promise<void>; // New handler
}

const InsightTimerTab: React.FC<InsightTimerTabProps> = ({ 
    imp, 
    aiGeneratedDescription, 
    isPopulating, 
    handleAIPopulateMetadata,
    setAiGeneratedDescription,
    handleUpdateIsMetadataConfirmed,
}) => {
  
  // Local state for description, initialized from AI result or kept empty
  const [description, setDescription] = useState(aiGeneratedDescription);
  const updateMutation = useUpdateImprovisation(imp.id);

  // Sync local state when AI generates a new description
  useEffect(() => {
    if (aiGeneratedDescription) {
        setDescription(aiGeneratedDescription);
    }
  }, [aiGeneratedDescription]);

  const handleCopy = () => {
    if (description) {
      navigator.clipboard.writeText(description);
      showSuccess('Description copied to clipboard!');
    } else {
      showError('No description to copy.');
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
  const hasDescription = description.trim().length > 0;
  
  // If the content type is 'Music', we assume the other fields are required for full categorization.
  const isCategorizationComplete = isContentTypeSet && isLanguageSet && isPrimaryUseSet && isAudienceLevelSet && hasBenefits && hasPractices && hasThemes && hasDescription;

  const renderStatusItem = (label: string, value: string | number | string[] | null, Icon: React.ElementType, isRequired: boolean = false) => {
    const displayValue = Array.isArray(value) ? (value.length > 0 ? `${value.length} selected` : 'Not Set') : (value || 'Not Set');
    const isSet = Array.isArray(value) ? value.length > 0 : !!value;
    
    return (
      <div className="flex items-center justify-between py-2 border-b last:border-b-0">
        <span className="text-sm font-medium text-muted-foreground flex items-center">
          <Icon className="w-4 h-4 mr-2" /> {label}
        </span>
        <Badge variant={isSet ? 'default' : (isRequired ? 'destructive' : 'outline')}>
          {isSet ? <CheckCircle className="w-3 h-3 mr-1" /> : <XCircle className="w-3 h-3 mr-1" />}
          {displayValue}
        </Badge>
      </div>
    );
  };

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
            <h4 className="font-semibold text-base mb-2">Required Core Metadata (Set via <Link to={`/improvisation/${imp.id}`}><Info className="w-4 h-4 inline-block text-primary" /></Link> button):</h4>
            {renderStatusItem("Content Type", imp.insight_content_type, Music, true)}
            {renderStatusItem("Language", imp.insight_language, Globe, true)}
            {renderStatusItem("Primary Use", imp.insight_primary_use, Clock, true)}
            {renderStatusItem("Experience Level", imp.insight_audience_level, Users, true)}
            {renderStatusItem("Age Group", imp.insight_audience_age, Users)}
            {renderStatusItem("Voice", imp.insight_voice, Volume2)}
            
            <Separator className="my-3" />
            
            <h4 className="font-semibold text-base mb-2">Required Categorization (Set below):</h4>
            {renderStatusItem("Benefits (Max 3)", imp.insight_benefits, CheckCircle, true)}
            {renderStatusItem("Practices (Select 1)", imp.insight_practices, BookOpen, true)}
            {renderStatusItem("Themes", imp.insight_themes, Info, true)}
            
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
      
      {/* Complex Categorization Fields */}
      <h3 className="text-xl font-bold mt-8">Detailed Categorization</h3>
      <InsightTimerFormFields 
        improvisationId={imp.id}
        initialBenefits={imp.insight_benefits}
        initialPractices={imp.insight_practices}
        initialThemes={imp.insight_themes}
      />
      
      {/* Metadata Confirmation Toggle */}
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
    </div>
  );
};

export default InsightTimerTab;