import React, { useState } from 'react'; // Added useState
import { MadeWithDyad } from "@/components/made-with-dyad";
import ImprovisationList from "@/components/ImprovisationList";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ExternalLink, Music, Clock, Sparkles, Zap, Search, Filter, ListOrdered, Grid3X3 } from "lucide-react"; // Added Grid3X3
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"; // Removed CardDescription
import CompositionPipeline from "@/components/CompositionPipeline";
import CaptureIdeaDialog from "@/components/CaptureIdeaDialog";
import { supabase } from '@/integrations/supabase/client';
import { parseISO, format, subDays } from 'date-fns';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';

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

// New component for consistent Quick Link buttons
const QuickLinkCard: React.FC<{ href: string, icon: React.ElementType, title: string, description: string, buttonText: string, variant?: "default" | "outline" }> = ({ href, icon: Icon, title, description, buttonText, variant = "outline" }) => (
  <Card className="shadow-card-light dark:shadow-card-dark hover:shadow-xl transition-shadow">
    <CardHeader className="pb-2">
      <CardTitle className="flex items-center text-xl"> {/* Adjusted typography */}
        <Icon className="w-5 h-5 mr-2 text-primary" />
        {title}
      </CardTitle>
    </CardHeader>
    <CardContent className="space-y-3">
      <p className="text-sm text-muted-foreground">{description}</p> {/* Adjusted typography */}
      <a href={href} target="_blank" rel="noopener noreferrer" className="w-full">
        <Button variant={variant} className="w-full">
          {buttonText} <ExternalLink className="w-4 h-4 ml-2" />
        </Button>
      </a>
    </CardContent>
  </Card>
);


const Index = () => {
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid'); // State for view mode

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
          <h1 className="text-4xl font-bold tracking-tight text-foreground"> {/* Larger, bolder H1 */}
            Dashboard
          </h1>
          <CaptureIdeaDialog onIdeaCaptured={handleRefetch}>
            <Button 
              variant="default" 
              className="w-full sm:w-auto text-base h-11 px-5 shadow-lg hover:shadow-xl transition-shadow bg-primary hover:bg-primary/90 dark:bg-primary dark:hover:bg-primary/90 flex-shrink-0" // Larger button
            >
              <Music className="w-5 h-5 mr-2" /> Capture New Idea
            </Button>
          </CaptureIdeaDialog>
        </div>
        {/* Removed welcome message */}
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
              className="pl-9 w-full h-10" // Taller input
              disabled // Placeholder for now
            />
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <Button variant="outline" disabled className="h-10 px-4"> {/* Taller buttons */}
              <Filter className="h-4 w-4 mr-2" /> Filter
            </Button>
            <Button variant="outline" disabled className="h-10 px-4"> {/* Taller buttons */}
              <ListOrdered className="h-4 w-4 mr-2" /> Sort
            </Button>
            {/* View Toggles */}
            <Button variant="outline" size="icon" onClick={() => setViewMode('grid')} className={cn("h-10 w-10", viewMode === 'grid' && 'bg-accent text-accent-foreground')}>
                <Grid3X3 className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" onClick={() => setViewMode('list')} className={cn("h-10 w-10", viewMode === 'list' && 'bg-accent text-accent-foreground')}>
                <ListOrdered className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Improvisation List (Will be redesigned as cards) */}
        <ImprovisationList />
        
        {/* Quick Links (Simplified and moved to bottom) */}
        <div className="space-y-4">
          <h2 className="text-2xl font-semibold text-foreground">Quick Tools & Links</h2> {/* Adjusted typography */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            <QuickLinkCard 
              href={GEMINI_URL} 
              icon={Zap} 
              title="AI Assistant" 
              description="Access Gemini for creative brainstorming, lyric ideas, or musical theory insights." 
              buttonText="Open Gemini" 
            />
            
            <QuickLinkCard 
              href={DISTROKID_URL} 
              icon={Music} 
              title="DistroKid" 
              description="Submit your finished compositions to all major streaming platforms." 
              buttonText="Go to DistroKid" 
              variant="default"
            />

            <QuickLinkCard 
              href={INSIGHT_TIMER_URL} 
              icon={Clock} 
              title="Insight Timer" 
              description="Upload your meditation music and guided tracks to a global audience." 
              buttonText="Go to Insight Timer" 
            />
          </div>
        </div>
      </main>

      <MadeWithDyad />
    </div>
  );
};

export default Index;