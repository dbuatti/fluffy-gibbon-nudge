import React from 'react';
import { MadeWithDyad } from "@/components/made-with-dyad";
import ImprovisationList from "@/components/ImprovisationList";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ExternalLink, Music, Clock, Sparkles, Flame, CalendarCheck, Zap, Search, Filter, ListOrdered } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import CompositionPipeline from "@/components/CompositionPipeline";
import CaptureIdeaDialog from "@/components/CaptureIdeaDialog";
import DailyPromptCard from "@/components/DailyPromptCard"; // Keep import for now, but won't render
import { supabase } from '@/integrations/supabase/client';
import { isToday, isYesterday, parseISO, format, subDays } from 'date-fns';
import { Badge } from "@/components/ui/badge";
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input'; // For search input

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

  const activityDates = new Set(
    data.map(item => format(parseISO(item.created_at), 'yyyy-MM-dd'))
  );
  
  let currentStreak = 0;
  const todayString = format(new Date(), 'yyyy-MM-dd');
  
  const todayActivity = activityDates.has(todayString);
  
  let dateToCheck = new Date();
  
  if (todayActivity) {
    currentStreak = 1;
    dateToCheck = subDays(dateToCheck, 1);
  } 
  else if (activityDates.has(format(subDays(dateToCheck, 1), 'yyyy-MM-dd'))) {
    currentStreak = 1;
    dateToCheck = subDays(dateToCheck, 2);
  } else {
    return { streak: 0, todayActivity: false };
  }

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
    staleTime: 86400000, // Cache the prompt for 24 hours
    refetchOnWindowFocus: false,
  });

  const { streak, todayActivity } = useStreakTracker(improvisations);

  const handleRefetch = () => {
    queryClient.invalidateQueries({ queryKey: ['improvisations'] });
    queryClient.invalidateQueries({ queryKey: ['compositionStatusCounts'] });
    queryClient.invalidateQueries({ queryKey: ['improvisationDates'] });
  };
  
  const streakMessage = streak > 0 
    ? `${streak}-Day Streak! Keep the momentum going.`
    : `Start your streak today by capturing an idea!`;

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <header className="mb-8 max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
            Dashboard
          </h1>
          <CaptureIdeaDialog onIdeaCaptured={handleRefetch}>
            <Button 
              variant="default" 
              className="w-full sm:w-auto text-sm h-10 px-4 shadow-lg hover:shadow-xl transition-shadow bg-primary hover:bg-primary/90 dark:bg-primary dark:hover:bg-primary/90 flex-shrink-0"
            >
              <Music className="w-4 h-4 mr-2" /> Capture New Idea
            </Button>
          </CaptureIdeaDialog>
        </div>
        <p className="text-md text-muted-foreground mt-1">
          Welcome back! Manage your ideas and compositions here.
        </p>
      </header>
      
      <main className="max-w-6xl mx-auto space-y-10">
        
        {/* Composition Pipeline (Now full width at the top) */}
        <CompositionPipeline />
        
        {/* Search, Filter, and View Toggles */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="relative w-full sm:w-1/2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search compositions..." 
              className="pl-9 w-full" 
              disabled // Placeholder for now
            />
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <Button variant="outline" disabled>
              <Filter className="h-4 w-4 mr-2" /> Filter
            </Button>
            <Button variant="outline" disabled>
              <ListOrdered className="h-4 w-4 mr-2" /> Sort
            </Button>
            {/* Future: Grid/List Toggle */}
          </div>
        </div>

        {/* Improvisation List (Will be redesigned as cards) */}
        <ImprovisationList />
        
        {/* Quick Links (Simplified and moved to bottom) */}
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-muted-foreground">Quick Links</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            <Card className="shadow-card-light dark:shadow-card-dark hover:shadow-xl transition-shadow">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center text-lg">
                  <Zap className="w-5 h-5 mr-2 text-purple-500" /> AI Assistant
                </CardTitle>
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
        </div>
      </main>

      <MadeWithDyad />
    </div>
  );
};

export default Index;