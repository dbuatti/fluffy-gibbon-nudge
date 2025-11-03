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
  const isFullySubmitted = isSubmittedToDistroKid && isSubmittedToInsightTimer;

  return (
    <Card className={cn(
      "p-4 border-2 shadow-card-light dark:shadow-card-dark transition-all",
      isFullySubmitted ? "border-green-500/50 bg-green-50/50 dark:bg-green-950/50" : 
      (isReadyForRelease ? "border-primary/50 bg-primary/5 dark:bg-primary/10" : "border-muted/50 bg-muted/5 dark:bg-muted/10")
    )}>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-lg font-semibold flex items-center">
          <Zap className="h-5 w-5 mr-2 text-yellow-500" /> Improvisation Readiness
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