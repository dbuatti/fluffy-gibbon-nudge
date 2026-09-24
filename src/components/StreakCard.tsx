import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Flame, CalendarCheck, CalendarX } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StreakCardProps {
  streak: number;
  todayActivity: boolean;
}

const StreakCard: React.FC<StreakCardProps> = ({ streak, todayActivity }) => {
  const active = streak > 0;

  return (
    <Card className={cn(
      "relative overflow-hidden h-full border shadow-card-light dark:shadow-card-dark transition-shadow hover:shadow-xl",
      active ? "border-orange-500/30 bg-gradient-to-br from-orange-50/80 to-amber-50/40 dark:from-orange-950/40 dark:to-amber-950/20" : "border-muted-foreground/20 bg-muted/50 dark:bg-muted/20"
    )}>
      <div className="absolute -bottom-10 -right-10 h-36 w-36 rounded-full bg-orange-400/10 blur-2xl" aria-hidden />
      <CardHeader className="pb-2">
        <CardTitle className={cn(
          "text-lg font-bold flex items-center",
          active ? "text-orange-600 dark:text-orange-400" : "text-muted-foreground"
        )}>
          <Flame className="w-5 h-5 mr-2" /> Creative Streak
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-end gap-1.5">
          <span className="text-5xl font-extrabold leading-none text-foreground">{streak}</span>
          <span className="text-lg font-semibold text-muted-foreground mb-1">days</span>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {active
            ? "You're on a roll — keep your creative flow going!"
            : "Capture an idea today to start your creative streak!"}
        </p>
        <div className={cn(
          "flex items-center gap-1.5 text-xs font-medium rounded-md px-2.5 py-1.5 w-fit",
          todayActivity ? "bg-success/10 text-success" : "bg-background text-muted-foreground border border-border"
        )}>
          {todayActivity ? (
            <>
              <CalendarCheck className="h-3.5 w-3.5" /> Today's activity recorded
            </>
          ) : (
            <>
              <CalendarX className="h-3.5 w-3.5" /> No activity yet today
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default StreakCard;