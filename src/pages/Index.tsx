import React, { useState } from 'react';
import { MadeWithDyad } from "@/components/made-with-dyad";
import ImprovisationList from "@/components/ImprovisationList";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ExternalLink, Music, Clock, Sparkles, Zap, Search, Filter, ListOrdered, Grid3X3 } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import CompositionPipeline from "@/components/CompositionPipeline";
import CaptureIdeaDialog from "@/components/CaptureIdeaDialog";
import { parseISO, format, subDays } from 'date-fns';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useSession } from '@/integrations/supabase/session-context'; // Import useSession

const DISTROKID_URL = "https://distrokid.com/new/";
const INSIGHT_TIMER_URL = "https://teacher.insighttimer.com/tracks/create?type=audio";
const GEMINI_URL = "https://gemini.google.com/app/0569ed6eee7e8c1a";

interface Improvisation {
  created_at: string;
}

const fetchImprovisationDates = async (supabase: any, sessionUserId: string): Promise<Improvisation[]> => {
  console.log("fetchImprovisationDates: Attempting to fetch dates for user:", sessionUserId);
  console.log("fetchImprovisationDates: Supabase client session:", supabase.auth.currentSession); // Add this line
  const { data, error } = await supabase
    .from('improvisations')
    .select('created_at')
    .eq('user_id', sessionUserId) // Filter by user_id
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  console.log("fetchImprovisationDates: Fetched data:", data);
  return data as Improvisation[];
};

const useStreakTracker = (data: Improvisation[] | undefined) => {
  if (!data || data.length === 0) return { streak: 0, todayActivity: false };

  const activityDates = new Set(
    data.map(item => format(parseISO(item.created_at), 'yyyy-MM-dd'))
  );
  
  let currentStreak = 0;
  const todayString = format(new Date(), 'yyyy-MM-dd');
  
  const todayActivity = activityDates.has(todayString); // Define todayActivity here
  
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
      <CardTitle className="flex items-center text-xl">
        <Icon className="w-5 h-5 mr-2 text-primary" />
        {title}
      </CardTitle>
    </CardHeader>
    <CardContent className="space-y-3">
      <p className="text-sm text-muted-foreground">{description}</p>
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
  const { session, isLoading: isSessionLoading, supabase } = useSession(); // Use useSession
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [sortOption, setSortOption] = useState<string>('created_at_desc');

  console.log("Index: Render. Session:", session, "isSessionLoading:", isSessionLoading);

  const { data: improvisations } = useQuery<Improvisation[]>({
    queryKey: ['improvisationDates'],
    queryFn: () => fetchImprovisationDates(supabase, session!.user.id), // Pass supabase client and user ID to fetcher
    enabled: !isSessionLoading && !!session?.user, // Only enable if session is loaded and user exists
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
          <h1 className="text-4xl font-bold tracking-tight text-foreground">
            Dashboard
          </h1>
          <CaptureIdeaDialog onIdeaCaptured={handleRefetch}>
            <Button 
              variant="default" 
              className="w-full sm:w-auto text-base h-11 px-5 shadow-lg hover:shadow-xl transition-shadow bg-primary hover:bg-primary/90 dark:bg-primary dark:hover:bg-primary/90 flex-shrink-0"
            >
              <Music className="w-5 h-5 mr-2" /> Capture New Idea
            </Button>
          </CaptureIdeaDialog>
        </div>
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
              className="pl-9 w-full h-10"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            {/* Filter Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="h-10 px-4">
                  <Filter className="h-4 w-4 mr-2" /> Filter: {filterStatus === 'all' ? 'All' : filterStatus.charAt(0).toUpperCase() + filterStatus.slice(1)}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Filter by Status</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setFilterStatus('all')}>All</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setFilterStatus('uploaded')}>Needs Audio</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setFilterStatus('analyzing')}>Processing</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setFilterStatus('completed')}>Ready</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setFilterStatus('failed')}>Failed</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Sort Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="h-10 px-4">
                  <ListOrdered className="h-4 w-4 mr-2" /> Sort: {sortOption.replace(/_/g, ' ').replace('created at', 'Date').replace('desc', '(Newest)').replace('asc', '(Oldest)').replace('name', 'Title')}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Sort by</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setSortOption('created_at_desc')}>Date (Newest First)</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSortOption('created_at_asc')}>Date (Oldest First)</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSortOption('name_asc')}>Title (A-Z)</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSortOption('name_desc')}>Title (Z-A)</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* View Toggles */}
            <Button variant="outline" size="icon" onClick={() => setViewMode('grid')} className={cn("h-10 w-10", viewMode === 'grid' && 'bg-accent text-accent-foreground')}>
                <Grid3X3 className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" onClick={() => setViewMode('list')} className={cn("h-10 w-10", viewMode === 'list' && 'bg-accent text-accent-foreground')}>
                <ListOrdered className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Improvisation List */}
        <ImprovisationList 
          viewMode={viewMode} 
          setViewMode={setViewMode} // Pass setViewMode to ImprovisationList
          searchTerm={searchTerm} 
          filterStatus={filterStatus} 
          sortOption={sortOption} 
        />
        
        {/* Quick Links */}
        <div className="space-y-4">
          <h2 className="text-2xl font-semibold text-foreground">Quick Tools & Links</h2>
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