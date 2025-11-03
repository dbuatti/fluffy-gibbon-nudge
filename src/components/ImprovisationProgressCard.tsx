import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Zap, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ImprovisationProgressCardProps {
  progressValue: number;
  progressMessage: string;
  primaryAction: { label: string, onClick: () => void, variant: "default" | "secondary" | "outline" } | null;
  isAnalyzing: boolean;
  isMarkingReady: boolean;
  isPopulating: boolean;
  isReadyForRelease: boolean | null;
  isSubmittedToDistroKid: boolean | null; // NEW
  isSubmittedToInsightTimer: boolean | null; // NEW
}

const ImprovisationProgressCard: React.FC<ImprovisationProgressCardProps> = ({
  progressValue,
  progressMessage,
  primaryAction,
  isAnalyzing,
  isMarkingReady,
  isPopulating,
  isReadyForRelease,
  isSubmittedToDistroKid, // NEW
  isSubmittedToInsightTimer, // NEW
}) => {
  const isFullySubmitted = !!isSubmittedToDistroKid && !!isSubmittedToInsightTimer;
  const isPartiallySubmitted = !!isReadyForRelease && (!!isSubmittedToDistroKid || !!isSubmittedToInsightTimer) && !isFullySubmitted;
  const isReadyButNotSubmitted = !!isReadyForRelease && !isFullySubmitted && !isPartiallySubmitted;
  const isInProgress = !isReadyForRelease; // Default state when not ready

  const cardClasses = cn(
    "p-4 border-2 shadow-card-light dark:shadow-card-dark transition-all",
    isFullySubmitted && "border-success/50 bg-success/50 dark:bg-success/20",
    isPartiallySubmitted && "border-info/50 bg-info/50 dark:bg-info/20",
    isReadyButNotSubmitted && "border-primary/50 bg-primary/5 dark:bg-primary/10",
    isInProgress && "border-muted/50 bg-muted/5 dark:bg-muted/10"
  );

  const iconColorClass = cn(
    "h-5 w-5 mr-2",
    isFullySubmitted && "text-success",
    isPartiallySubmitted && "text-info",
    isReadyButNotSubmitted && "text-primary",
    isInProgress && "text-yellow-500" // Keep yellow for general in-progress/attention
  );

  return (
    <Card className={cardClasses}>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-lg font-semibold flex items-center">
          <Zap className={iconColorClass} /> Improvisation Readiness
        </h3>
        <span className="text-sm font-bold text-primary">{progressValue}%</span>
      </div>
      <Progress value={progressValue} className="h-2 mb-4" />

      {/* Primary Action Button */}
      {primaryAction ? (
        <Button
          onClick={primaryAction.onClick}
          variant={primaryAction.variant}
          className="w-full h-10 text-base"
          disabled={isAnalyzing || isMarkingReady || isPopulating}
        >
          {isMarkingReady || isPopulating ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" /> {isPopulating ? 'Populating Metadata...' : 'Marking Ready...'}
            </>
          ) : (
            primaryAction.label
          )}
        </Button>
      ) : (
        <p className="text-sm text-muted-foreground">{progressMessage}</p>
      )}
    </Card>
  );
};

export default ImprovisationProgressCard;