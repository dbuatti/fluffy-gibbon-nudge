import React from 'react';
import { MadeWithDyad } from "@/components/made-with-dyad";
import ImprovisationList from "@/components/ImprovisationList";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ExternalLink, Music, Clock, Sparkles, Flame, CalendarCheck, Zap } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import CompositionPipeline from "@/components/CompositionPipeline";
import CaptureIdeaDialog from "@/components/CaptureIdeaDialog";
import DailyPromptCard from "@/components/DailyPromptCard"; // Import new component
import CompositionScriptCard from "@/components/CompositionScriptCard"; // Import new component
import { supabase } from '@/integrations/supabase/client';
import { isToday, isYesterday, parseISO, format, subDays } from 'date-fns';
import { Badge } from '@/components/ui/badge'; // Import Badge
import { cn } from '@/lib/utils';

const DISTROKID_URL = "https://distrokid.com/new/";
const INSIGHT_TIMER_URL = "https://teacher.insighttimer.com/tracks/create?type=audio";
const GEMINI_URL = "https://gemini.google.com/app/0569ed6eee7e8c1a";

interface Improvisation {
  created_at: string;
}

const fetchImprovisationDates = async (): Promise<Improvisation[]> => {
  const { data, error } = await supabase
    .from('improvisations')
    .select('created_at')
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return data as Improvisation[];
};

const useStreakTracker = (data: Improvisation[] | undefined) => {
  if (!data || data.length === 0) return { streak: 0, todayActivity: false };

  // 1. Normalize all creation dates to YYYY-MM-DD strings for easy comparison
  const activityDates = new Set(
    data.map(item => format(parseISO(item.created_at), 'yyyy-MM-dd'))
  );
  
  let currentStreak = 0;
  const todayString = format(new Date(), 'yyyy-MM-dd');
  
  // 2. Check for today's activity
  const todayActivity = activityDates.has(todayString);
  
  let dateToCheck = new Date();
  
  // If there was activity today, the streak starts at 1 and we check yesterday next.
  if (todayActivity) {
    currentStreak = 1;
    dateToCheck = subDays(dateToCheck, 1);
  } 
  // If no activity today, we check if there was activity yesterday to maintain a streak.
  else if (activityDates.has(format(subDays(dateToCheck, 1), 'yyyy-MM-dd'))) {
    // Streak starts at 1 if activity was yesterday, but today's goal is missed.
    // We don't count today as part of the streak yet.
    currentStreak = 1;
    dateToCheck = subDays(dateToCheck, 2);
  } else {
    // No activity today or yesterday, streak is 0.
    return { streak: 0, todayActivity: false };
  }

  // 3. Iterate backwards to calculate the full streak length
  while (true) {
    const dateString = format(dateToCheck, 'yyyy-MM-dd');
    
    if (activityDates.has(dateString)) {
      currentStreak++;
      dateToCheck = subDays(dateToCheck, 1);
    } else {
      break;
    }
  }

  return { streak: currentStreak, todayActivity };
};


const Index = () => {
  const queryClient = useQueryClient();
  
  const { data: improvisations } = useQuery<Improvisation[]>({
    queryKey: ['improvisationDates'],
    queryFn: fetchImprovisationDates,
    refetchInterval: 60000, // Check streak every minute
  });

  const { streak, todayActivity } = useStreakTracker(improvisations);

  const handleRefetch = () => {
    // Invalidate the query cache to force ImprovisationList and Pipeline to refetch
    queryClient.invalidateQueries({ queryKey: ['improvisations'] });
    queryClient.invalidateQueries({ queryKey: ['compositionStatusCounts'] });
    queryClient.invalidateQueries({ queryKey: ['improvisationDates'] }); // Refetch dates for streak
  };
  
  const streakMessage = streak > 0 
    ? `🔥 ${streak}-Day Streak! Keep the momentum going.`
    : `💡 Start your streak today by capturing an idea!`;

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <header className="mb-8 max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
          Dashboard
        </h1>
        <p className="text-md text-muted-foreground mt-1">
          Welcome back! Manage your ideas and compositions here.
        </p>
      </header>
      
      <main className="max-w-6xl mx-auto space-y-10">
        
        {/* ACTION ZONE: Capture Idea & Pipeline */}
        <div className="space-y-6">
            <div className="flex justify-start">
                <CaptureIdeaDialog onIdeaCaptured={handleRefetch}>
                    <Button 
                        variant="default" 
                        className="w-full md:w-auto text-lg h-12 px-6 shadow-lg hover:shadow-xl transition-shadow bg-primary hover:bg-primary/90 dark:bg-primary dark:hover:bg-primary/90"
                    >
                        <Music className="w-5 h-5 mr-2" /> Capture New Idea
                    </Button>
                </CaptureIdeaDialog>
            </div>
            <CompositionPipeline />
        </div>
        
        {/* NEW: DAILY CREATIVE PROMPT */}
        <DailyPromptCard />
        
        {/* NEW: COMPOSITION SCRIPT STORY */}
        <CompositionScriptCard />

        {/* STREAK TRACKER (Motivation) */}
        <Card className={cn(
            "p-4 border-2 shadow-card-light dark:shadow-card-dark", // Use new shadow classes
            "border-yellow-400/50 bg-yellow-50/50 dark:bg-yellow-950/50"
        )}>
            <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold flex items-center text-yellow-700 dark:text-yellow-300">
                    <Flame className="w-6 h-6 mr-2" /> Consistency Tracker
                </h3>
                {todayActivity && <Badge className="bg-success hover:bg-success/90 text-success-foreground"><CalendarCheck className="w-4 h-4 mr-1" /> Today's Goal Met</Badge>}
            </div>
            <p className="mt-2 text-lg font-semibold text-foreground">
                {streakMessage}
            </p>
        </Card>

        {/* QUICK LINKS (Reduced Cognitive Load) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          <Card className="shadow-card-light dark:shadow-card-dark hover:shadow-xl transition-shadow">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center text-lg">
                <Zap className="w-5 h-5 mr-2 text-purple-500" /> AI Assistant
              </CardTitle>
              <CardDescription className="text-sm">
                Quick access to your AI assistant for brainstorming or creative writing.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <a href={GEMINI_URL} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" className="w-full">
                  Open Gemini <ExternalLink className="w-4 h-4 ml-2" />
                </Button>
              </a>
            </CardContent>
          </Card>
          
          <Card className="shadow-card-light dark:shadow-card-dark hover:shadow-xl transition-shadow">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center text-lg">
                <Music className="w-5 h-5 mr-2 text-primary" /> DistroKid
              </CardTitle>
              <CardDescription className="text-sm">
                Prepare metadata for streaming platforms like Spotify and Apple Music.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <a href={DISTROKID_URL} target="_blank" rel="noopener noreferrer">
                <Button variant="default" className="w-full bg-primary hover:bg-primary/90">
                  Go to DistroKid <ExternalLink className="w-4 h-4 ml-2" />
                </Button>
              </a>
            </CardContent>
          </Card>

          <Card className="shadow-card-light dark:shadow-card-dark hover:shadow-xl transition-shadow">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center text-lg">
                <Clock className="w-5 h-5 mr-2 text-primary" /> Insight Timer
              </CardTitle>
              <CardDescription className="text-sm">
                Prepare track details for meditation and wellness platforms.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <a href={INSIGHT_TIMER_URL} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" className="w-full">
                  Go to Insight Timer <ExternalLink className="w-4 h-4 ml-2" />
                </Button>
              </a>
            </CardContent>
          </Card>
        </div>

        <ImprovisationList />
      </main>

      <MadeWithDyad />
    </div>
  );
};

export default Index;