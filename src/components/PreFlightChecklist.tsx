import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle, XCircle, Info, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import type { ReleaseReadiness } from '@/lib/release-readiness';

interface PreFlightChecklistProps {
  readiness: ReleaseReadiness;
  isAnalyzing: boolean;
  onOpenTab: (tab: string) => void;
  /** The currently active tab — used to avoid no-op navigation. */
  currentTab?: string;
  /** Optional scroll target map: task.id -> element ID to scroll to when on the same tab. */
  scrollTargets?: Record<string, string>;
}

/**
 * Distribution pre-flight summary.
 *
 * This used to keep its own private list of checks that disagreed with the
 * Overview tab and with the distribution tabs (it claimed artwork was
 * "3000x3000" without ever looking, and treated audio as a blocker). It now
 * renders the required tasks straight from the shared readiness model, so the
 * three surfaces can never disagree again.
 */
const PreFlightChecklist: React.FC<PreFlightChecklistProps> = ({ readiness, isAnalyzing, onOpenTab, currentTab, scrollTargets }) => {
  const { blockers, readyToSubmit, completed, total } = readiness;

  const handleFixClick = (taskId: string, taskTab: string) => {
    if (currentTab && taskTab === currentTab) {
      // Already on the target tab — scroll to the relevant section if mapped
      const targetId = scrollTargets?.[taskId];
      if (targetId) {
        const el = document.getElementById(targetId);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          el.focus({ preventScroll: true });
          return;
        }
      }
      // Fallback: do nothing (button will be disabled)
      return;
    }
    onOpenTab(taskTab);
  };

  return (
    <Card
      className={cn(
        'shadow-card-light dark:shadow-card-dark transition-all border-2',
        readyToSubmit ? 'border-success/50' : 'border-warning/50',
      )}
    >
      <CardHeader className="pb-3">
        <CardTitle className="text-xl font-bold flex items-center gap-3">
          {readyToSubmit ? (
            <CheckCircle className="h-5 w-5 text-success" />
          ) : (
            <Info className="h-5 w-5 text-warning" />
          )}
          Distribution Pre-Flight
          <span className="ml-auto text-sm font-normal text-muted-foreground">
            {completed}/{total} steps
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isAnalyzing && (
          <div className="flex items-center p-3 bg-warning/10 border border-warning/30 rounded-lg">
            <Loader2 className="h-5 w-5 mr-3 animate-spin text-warning" />
            <p className="text-sm font-medium text-muted-foreground">
              Background processing is running. These checks may be incomplete.
            </p>
          </div>
        )}

        {readyToSubmit ? (
          <p className="text-sm text-muted-foreground">
            Every item that blocks distribution is complete. The remaining steps on the
            Overview tab are optional polish.
          </p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              {blockers.length === 1
                ? 'One item must be fixed before this release can be submitted.'
                : `${blockers.length} items must be fixed before this release can be submitted.`}
            </p>
            <ul className="space-y-2">
              {blockers.map((task) => {
                const isCurrentTab = currentTab && task.tab === currentTab;
                return (
                  <li
                    key={task.id}
                    className="flex items-start gap-3 p-3 border border-destructive/30 rounded-lg bg-destructive/5"
                  >
                    <XCircle className="h-5 w-5 mt-0.5 shrink-0 text-destructive" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold">{task.label}</span>
                      <span className="block text-xs text-muted-foreground mt-0.5">{task.why}</span>
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      onClick={() => handleFixClick(task.id, task.tab)}
                      disabled={isCurrentTab}
                      title={isCurrentTab ? 'Already on this tab — review the fields below' : `Go to ${task.tab} tab`}
                    >
                      {isCurrentTab ? 'Review' : 'Fix'}
                    </Button>
                  </li>
                );
              })}
            </ul>
          </>
        )}

        <Separator />

        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">Overall readiness</p>
          <Badge
            variant={readyToSubmit ? 'default' : 'secondary'}
            className={cn(
              'text-sm px-3 py-1',
              readyToSubmit && 'bg-success text-success-foreground hover:bg-success/90',
            )}
          >
            {readyToSubmit ? 'READY TO SUBMIT' : 'BLOCKED'}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
};

export default PreFlightChecklist;
