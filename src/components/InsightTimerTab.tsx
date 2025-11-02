import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BookOpen, Clock, Users, Info, CheckCircle, XCircle, Music, Globe, Volume2 } from 'lucide-react';
import InsightTimerDescriptionGenerator from './InsightTimerDescriptionGenerator';
import InsightTimerFormFields from './InsightTimerFormFields';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

interface ImprovisationData {
  id: string;
  generated_name: string | null;
  primary_genre: string | null;
  is_improvisation: boolean | null;
  
  // NEW FIELDS
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
}

const InsightTimerTab: React.FC<InsightTimerTabProps> = ({ imp }) => {
  
  // Check required fields for music submission (assuming Music content type)
  const isContentTypeSet = !!imp.insight_content_type;
  const isLanguageSet = !!imp.insight_language;
  const isPrimaryUseSet = !!imp.insight_primary_use;
  const isAudienceLevelSet = !!imp.insight_audience_level;
  const hasBenefits = (imp.insight_benefits?.length || 0) > 0;
  const hasPractices = !!imp.insight_practices;
  const hasThemes = (imp.insight_themes?.length || 0) > 0;
  
  // If the content type is 'Music', we assume the other fields are required for full categorization.
  const isReady = isContentTypeSet && isLanguageSet && isPrimaryUseSet && isAudienceLevelSet && hasBenefits && hasPractices && hasThemes;

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
            
            {!isReady && (
                <div className="pt-4 text-center">
                    <p className="text-sm text-red-600 dark:text-red-400 mb-2 font-semibold">
                        CRITICAL: Submission is not ready. Complete all required fields.
                    </p>
                </div>
            )}
          </div>

          {/* Description Generator */}
          <InsightTimerDescriptionGenerator improvisationId={imp.id} />

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
    </div>
  );
};

export default InsightTimerTab;