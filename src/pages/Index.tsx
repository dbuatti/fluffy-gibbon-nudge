import React from 'react';
import { MadeWithDyad } from "@/components/made-with-dyad";
import ImprovisationList from "@/components/ImprovisationList";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ExternalLink, Music, Clock, Sparkles, Flame, CalendarCheck } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import CompositionPipeline from "@/components/CompositionPipeline";
import CaptureIdeaDialog from "@/components/CaptureIdeaDialog";
import { supabase } from '@/integrations/supabase/client';
import { isToday, isYesterday, parseISO, differenceInDays } from 'date-fns';
import { Badge } from '@/components/ui/badge'; // Import Badge

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

  const dates = data
    .map(item => parseISO(item.created_at))
    .map(date => date.toDateString()); // Normalize to day
  
  const uniqueDates = Array.from(new Set(dates)).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

  let currentStreak = 0;
  let todayActivity = false;
  let currentDate = new Date();

  // Check for today's activity
  if (uniqueDates.some(date => isToday(new Date(date)))) {
    todayActivity = true;
    currentStreak = 1;
    currentDate = new Date(currentDate.setDate(currentDate.getDate() - 1)); // Start checking from yesterday
  } else {
    currentDate = new Date(currentDate.setDate(currentDate.getDate())); // Start checking from today
  }

  for (let i = 0; i < uniqueDates.length; i++) {
    const date = new Date(uniqueDates[i]);
    
    if (isToday(date) && !todayActivity) continue; // Skip today if already counted

    if (currentStreak === 0 && !todayActivity) {
        // If we haven't started the streak, check if the latest activity was yesterday
        if (isYesterday(date)) {
            currentStreak = 1;
            currentDate = new Date(date.setDate(date.getDate() - 1));
        }
        continue;
    }

    // Check if the current date is exactly one day before the previous date in the streak
    const diff = differenceInDays(currentDate, date);
    
    if (diff === 1) {
      currentStreak++;
      currentDate = date;
    } else if (diff > 1) {
      // Gap found, streak broken
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
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 md:p-8">
      <header className="mb-10">
        <h1 className="text-4xl font-extrabold text-center text-gray-900 dark:text-white tracking-tight">
          Composition & Analysis Hub
        </h1>
        <p className="text-center text-lg text-gray-600 dark:text-gray-400 mt-2 max-w-2xl mx-auto">
          Capture your spontaneous ideas first, then upload the audio to generate AI-powered metadata and prepare for distribution.
        </p>
      </header>
      
      <main className="max-w-5xl mx-auto space-y-10">
        
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          <CompositionPipeline /> {/* Pipeline on the left/top */}
          <CaptureIdeaDialog onIdeaCaptured={handleRefetch} /> 
        </div>

        {/* Streak Tracker Card */}
        <Card className="p-4 border-2 border-yellow-400/50 bg-yellow-50/50 dark:bg-yellow-950/50">
            <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold flex items-center text-yellow-700 dark:text-yellow-300">
                    <Flame className="w-6 h-6 mr-2" /> Consistency Tracker
                </h3>
                {todayActivity && <Badge className="bg-green-500 hover:bg-green-500 text-white"><CalendarCheck className="w-4 h-4 mr-1" /> Today's Goal Met</Badge>}
            </div>
            <p className="mt-2 text-lg font-semibold text-gray-800 dark:text-gray-200">
                {streakMessage}
            </p>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* New Gemini Card */}
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <CardTitle className="flex items-center">
                <Sparkles className="w-5 h-5 mr-2 text-purple-500" /> Gemini AI
              </CardTitle>
              <CardDescription>
                Quick access to your AI assistant for brainstorming, research, or creative writing.
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
          
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <CardTitle className="flex items-center">
                <Music className="w-5 h-5 mr-2 text-primary" /> DistroKid
              </CardTitle>
              <CardDescription>
                Prepare your song metadata for streaming platforms like Spotify and Apple Music.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <a href={DISTROKID_URL} target="_blank" rel="noopener noreferrer">
                <Button variant="default" className="w-full">
                  Go to DistroKid Submission <ExternalLink className="w-4 h-4 ml-2" />
                </Button>
              </a>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <CardTitle className="flex items-center">
                <Clock className="w-5 h-5 mr-2 text-primary" /> Insight Timer
              </CardTitle>
              <CardDescription>
                Prepare your track details for meditation and wellness platforms.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <a href={INSIGHT_TIMER_URL} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" className="w-full">
                  Go to Insight Timer Track Upload <ExternalLink className="w-4 h-4 ml-2" />
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