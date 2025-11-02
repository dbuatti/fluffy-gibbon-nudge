import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle, XCircle, Music, Image as ImageIcon, Info, Loader2, BookOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';

interface PreFlightChecklistProps {
  imp: {
    id: string;
    storage_path: string | null;
    artwork_url: string | null;
    is_metadata_confirmed: boolean | null;
    insight_benefits: string[] | null;
    insight_practices: string | null;
    insight_themes: string[] | null;
  };
  isAnalyzing: boolean;
}

const PreFlightChecklist: React.FC<PreFlightChecklistProps> = ({ imp, isAnalyzing }) => {
  const hasAudioFile = !!imp.storage_path;
  const hasArtwork = !!imp.artwork_url;
  const isMetadataConfirmed = !!imp.is_metadata_confirmed;
  
  // Check if Insight Timer categorization is complete (used as a proxy for full metadata review)
  const hasInsightTimerCategorization = (imp.insight_benefits?.length || 0) > 0 && !!imp.insight_practices && (imp.insight_themes?.length || 0) > 0;

  // --- Individual Checks ---
  const audioCheck = {
    status: hasAudioFile ? 'passed' : 'failed',
    label: hasAudioFile ? 'Audio File Uploaded' : 'Audio File Missing',
    icon: hasAudioFile ? CheckCircle : XCircle,
    color: hasAudioFile ? 'text-green-500' : 'text-red-500',
    actionLink: hasAudioFile ? undefined : '#audio-upload-cta',
    actionLabel: hasAudioFile ? undefined : 'Upload Audio',
  };

  const artworkCheck = {
    status: hasArtwork ? 'passed' : 'failed',
    label: hasArtwork ? 'Artwork Generated (3000x3000)' : 'Artwork Missing',
    icon: hasArtwork ? CheckCircle : XCircle,
    color: hasArtwork ? 'text-green-500' : 'text-red-500',
    actionLink: hasArtwork ? undefined : '#artwork-actions',
    actionLabel: hasArtwork ? undefined : 'Generate Artwork',
  };
  
  const metadataCheck = {
    status: isMetadataConfirmed ? 'passed' : (hasInsightTimerCategorization ? 'pending' : 'failed'),
    label: isMetadataConfirmed ? 'AI Metadata Confirmed' : (hasInsightTimerCategorization ? 'Review & Confirm Metadata' : 'AI Metadata Incomplete'),
    icon: isMetadataConfirmed ? CheckCircle : (hasInsightTimerCategorization ? Info : XCircle),
    color: isMetadataConfirmed ? 'text-green-500' : (hasInsightTimerCategorization ? 'text-yellow-500' : 'text-red-500'),
    actionLink: isMetadataConfirmed ? undefined : '#insight-timer-confirmation',
    actionLabel: isMetadataConfirmed ? undefined : 'Go to Insight Timer Prep',
  };
  
  // --- Overall Status ---
  const allChecks = [audioCheck, artworkCheck, metadataCheck];
  const isReady = allChecks.every(c => c.status === 'passed');
  const isBlocked = allChecks.some(c => c.status === 'failed');

  return (
    <Card className={cn(
        "shadow-xl dark:shadow-3xl transition-all",
        isReady ? "border-4 border-green-500/50" : (isBlocked ? "border-4 border-red-500/50" : "border-4 border-yellow-500/50")
    )}>
      <CardHeader className="pb-3">
        <CardTitle className="text-2xl font-bold flex items-center">
          {isReady ? (
            <CheckCircle className="h-6 w-6 mr-3 text-green-500" />
          ) : isBlocked ? (
            <XCircle className="h-6 w-6 mr-3 text-red-500" />
          ) : (
            <Info className="h-6 w-6 mr-3 text-yellow-500" />
          )}
          Distribution Pre-Flight Checklist
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isAnalyzing && (
            <div className="flex items-center p-3 bg-yellow-100 dark:bg-yellow-900/50 rounded-lg">
                <Loader2 className="h-5 w-5 mr-3 animate-spin text-yellow-600" />
                <p className="text-sm font-medium text-yellow-800 dark:text-yellow-300">
                    Background processing is running. Checks may be incomplete.
                </p>
            </div>
        )}
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {allChecks.map((check, index) => {
            const Icon = check.icon;
            return (
              <div key={index} className="p-3 border rounded-lg space-y-2 bg-background/50">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold flex items-center">
                    <Icon className={cn("h-4 w-4 mr-2", check.color)} />
                    {check.label}
                  </span>
                  <Badge variant={check.status === 'passed' ? 'default' : (check.status === 'failed' ? 'destructive' : 'secondary')}>
                    {check.status.toUpperCase()}
                  </Badge>
                </div>
                {check.actionLink && (
                    <Link to={`/improvisation/${imp.id}${check.actionLink.includes('#') ? '?tab=' + (check.actionLink.includes('artwork') ? 'assets-downloads' : 'analysis-distro') + check.actionLink : ''}`}>
                        <Button variant="link" size="sm" className="h-6 p-0 text-xs justify-start">
                            {check.actionLabel} &rarr;
                        </Button>
                    </Link>
                )}
              </div>
            );
          })}
        </div>
        
        <Separator />
        
        <div className="flex items-center justify-between">
            <p className="text-lg font-bold">Overall Readiness:</p>
            <Badge 
                className={cn(
                    "text-base px-4 py-2",
                    isReady ? "bg-green-600 hover:bg-green-600" : "bg-red-600 hover:bg-red-600"
                )}
            >
                {isReady ? 'READY TO SUBMIT' : 'BLOCKED'}
            </Badge>
        </div>
      </CardContent>
    </Card>
  );
};

export default PreFlightChecklist;