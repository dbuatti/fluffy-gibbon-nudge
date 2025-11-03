import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Flame, CalendarCheck, CalendarX } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StreakCardProps {
  streak: number;
  todayActivity: boolean;
}

const StreakCard: React.FC<StreakCardProps> = ({ streak, todayActivity }) => {
  return (
    <Card className={cn(
        "shadow-xl dark:shadow-3xl border-2",
        streak > 0 ? "border-orange-500/50 bg-orange-50/50 dark:bg-orange-950/50" : "border-muted-foreground/20 bg-muted/50 dark:bg-muted/20"
    )}>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className={cn(
            "text-xl font-bold flex items-center",
            streak > 0 ? "text-orange-600 dark:text-orange-400" : "text-muted-foreground"
        )}>
          <Flame className="w-5 h-5 mr-2" /> Creative Streak
        </CardTitle>
        {todayActivity ? (
          <span className="flex items-center text-green-600 dark:text-green-400 text-sm font-medium">
            <CalendarCheck className="h-4 w-4 mr-1" /> Today's activity recorded!
          </span>
        ) : (
          <span className="flex items-center text-muted-foreground text-sm font-medium">
            <CalendarX className="h-4 w-4 mr-1" /> No activity today
          </span>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-5xl font-extrabold text-center text-foreground">
          {streak} <span className="text-xl font-semibold text-muted-foreground">Days</span>
        </p>
        <p className="text-sm text-muted-foreground text-center">
          {streak > 0 
            ? `You've maintained your creative flow for ${streak} consecutive days!`
            : `Capture an idea today to start your creative streak!`
          }
        </p>
      </CardContent>
    </Card>
  );
};

export default StreakCard;