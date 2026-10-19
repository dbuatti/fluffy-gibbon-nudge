import React, { useState, useEffect } from 'react';
import { MadeWithDyad } from "@/components/made-with-dyad";
import ImprovisationList from "@/components/ImprovisationList";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ExternalLink, Music, Clock, Zap, Search, Filter, ListOrdered, Grid3X3, ArrowUpDown, ChevronRight } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import ImprovisationPipeline from "@/components/ImprovisationPipeline";
import CaptureIdeaDialog from "@/components/CaptureIdeaDialog";
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useSession } from '@/integrations/supabase/session-context';
import { supabase } from '@/integrations/supabase/client';
import DailyPromptCard from '@/components/DailyPromptCard';
import StreakCard from '@/components/StreakCard';
import { useStreakTracker } from '@/hooks/useStreakTracker';
import { GEMINI_URL, DISTROKID_URL, INSIGHT_TIMER_URL } from '@/lib/constants';
import type { SupabaseClient } from '@supabase/supabase-js';
import { format } from 'date-fns';

interface ImprovisationDate {
  created_at: string;
}

const fetchImprovisationDates = async (supabaseClient: SupabaseClient, sessionUserId: string): Promise<ImprovisationDate[]> => {
  const { data, error } = await supabaseClient
    .from('improvisations')
    .select('created_at')
    .eq('user_id', sessionUserId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return data as ImprovisationDate[];
};

const QuickLinkCard: React.FC<{ href: string, icon: React.ElementType, title: string, description: string, buttonText: string, variant?: "default" | "outline" }> = ({ href, icon: Icon, title, description, buttonText, variant = "outline" }) => (
  <Card className="group shadow-card-light dark:shadow-card-dark hover:shadow-xl dark:hover:shadow-2xl hover:-translate-y-0.5 transition-all duration-200">
    <CardHeader className="pb-2">
      <CardTitle className="flex items-center text-lg">
        <span className="h-8 w-8 mr-2.5 rounded-lg bg-primary/10 flex items-center justify-center">
          <Icon className="w-4 h-4 text-primary" />
        </span>
        {title}
      </CardTitle>
    </CardHeader>
    <CardContent className="space-y-3">
      <p className="text-sm text-muted-foreground">{description}</p>
      <a href={href} target="_blank" rel="noopener noreferrer" className="w-full block">
        <Button variant={variant} className="w-full">
          {buttonText} <ExternalLink className="w-4 h-4 ml-2" />
        </Button>
      </a>
    </CardContent>
  </Card>
);

const Greeting: React.FC = () => {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  return (
    <div>
      <p className="text-sm text-muted-foreground">{format(new Date(), 'EEEE, MMMM d')}</p>
      <h1 className="text-4xl font-bold tracking-tight text-foreground">
        {greeting}, <span className="text-brand-gradient">composer</span>
      </h1>
    </div>
  );
};

const Index = () => {
  const queryClient = useQueryClient();
  const { session, isLoading: isSessionLoading } = useSession();
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [sortOption, setSortOption] = useState<string>('created_at_desc');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isSortOpen, setIsSortOpen] = useState(false);

  const { data: improvisationDates } = useQuery<ImprovisationDate[]>({
    queryKey: ['improvisationDates'],
    queryFn: () => fetchImprovisationDates(supabase, session!.user.id),
    enabled: !isSessionLoading && !!session?.user,
    staleTime: 86400000,
    refetchOnWindowFocus: false,
    refetchInterval: 60000,
  });

  const { streak, todayActivity } = useStreakTracker(improvisationDates);
  const hasNoImprovisations = improvisationDates && improvisationDates.length === 0 && !isSessionLoading;

  const handleRefetch = () => {
    queryClient.invalidateQueries({ queryKey: ['improvisations'] });
    queryClient.invalidateQueries({ queryKey: ['improvisationStatusCounts'] });
    queryClient.invalidateQueries({ queryKey: ['improvisationDates'] });
  };

  useEffect(() => {
    document.title = 'Composer - AI Composer Hub';
  }, []);

  const sortLabel = sortOption.replace(/_/g, ' ').replace('created at', 'Date').replace('desc', '(Newest)').replace('asc', '(Oldest)').replace('name', 'Title');
  const filterLabel = filterStatus === 'all' ? 'All' : filterStatus.charAt(0).toUpperCase() + filterStatus.slice(1);

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <header className="mb-8 max-w-6xl mx-auto flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <Greeting />
        <CaptureIdeaDialog onIdeaCaptured={handleRefetch}>
          <Button className="w-full sm:w-auto text-base h-11 px-5 bg-gradient-to-r from-primary to-violet-600 hover:from-primary/90 hover:to-violet-600/90 shadow-lg shadow-primary/20 hover:shadow-xl transition-all">
            <Music className="w-5 h-5 mr-2" /> Capture New Idea
          </Button>
        </CaptureIdeaDialog>
      </header>

      <main className="max-w-6xl mx-auto space-y-10">

        {/* Hero: daily prompt + streak */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <DailyPromptCard />
          </div>
          <StreakCard streak={streak} todayActivity={todayActivity} />
        </div>

        {/* Improvisation Pipeline */}
        {hasNoImprovisations ? (
          <Card className="shadow-card-light dark:shadow-card-dark w-full">
            <CardContent className="text-center p-12">
              <div className="h-20 w-20 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-5">
                <Music className="w-10 h-10 text-primary" />
              </div>
              <h2 className="text-2xl font-bold mb-2 text-foreground">Welcome to AI Composer Hub!</h2>
              <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                Your creative space for capturing musical ideas, analyzing improvisations,
                and preparing them for distribution. Start by capturing your first idea!
              </p>
              <CaptureIdeaDialog onIdeaCaptured={handleRefetch}>
                <Button size="lg" className="text-base">
                  <Music className="w-5 h-5 mr-2" /> Capture Your First Idea
                </Button>
              </CaptureIdeaDialog>
            </CardContent>
          </Card>
        ) : (
          <ImprovisationPipeline />
        )}

        {/* Search, Filter, Sort, and View Toggles */}
        <div className="flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="relative w-full sm:w-1/2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search improvisations..."
                className="pl-9 w-full h-10"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                aria-label="Search improvisations"
              />
            </div>
            <div className="flex gap-2 w-full sm:w-auto">
              {/* Filter Dropdown */}
              <DropdownMenu open={isFilterOpen} onOpenChange={setIsFilterOpen}>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="h-10 px-4">
                    <Filter className="h-4 w-4 mr-2" /> <span className="hidden sm:inline">Filter:</span> {filterLabel}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuLabel>Filter by Status</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setFilterStatus('all')} className="justify-between">All {filterStatus === 'all' && <ChevronRight className="h-3.5 w-3.5" />}</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setFilterStatus('uploaded')} className="justify-between">Uploaded {filterStatus === 'uploaded' && <ChevronRight className="h-3.5 w-3.5" />}</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setFilterStatus('analyzing')} className="justify-between">Processing {filterStatus === 'analyzing' && <ChevronRight className="h-3.5 w-3.5" />}</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setFilterStatus('completed')} className="justify-between">Ready {filterStatus === 'completed' && <ChevronRight className="h-3.5 w-3.5" />}</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setFilterStatus('failed')} className="justify-between">Failed {filterStatus === 'failed' && <ChevronRight className="h-3.5 w-3.5" />}</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Sort Dropdown */}
              <DropdownMenu open={isSortOpen} onOpenChange={setIsSortOpen}>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="h-10 px-4">
                    <ArrowUpDown className="h-4 w-4 mr-2" /> <span className="hidden sm:inline">Sort:</span> {sortLabel}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>Sort by</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setSortOption('created_at_desc')} className="justify-between">Date (Newest First) {sortOption === 'created_at_desc' && <ChevronRight className="h-3.5 w-3.5" />}</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setSortOption('created_at_asc')} className="justify-between">Date (Oldest First) {sortOption === 'created_at_asc' && <ChevronRight className="h-3.5 w-3.5" />}</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setSortOption('name_asc')} className="justify-between">Title (A-Z) {sortOption === 'name_asc' && <ChevronRight className="h-3.5 w-3.5" />}</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setSortOption('name_desc')} className="justify-between">Title (Z-A) {sortOption === 'name_desc' && <ChevronRight className="h-3.5 w-3.5" />}</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Segmented View Toggle */}
              <div className="flex items-center rounded-md border border-input bg-background p-0.5">
                <Button variant="ghost" size="icon" onClick={() => setViewMode('grid')} className={cn("h-9 w-9 rounded", viewMode === 'grid' && 'bg-accent text-accent-foreground shadow-sm')} aria-label="Grid view" aria-pressed={viewMode === 'grid'}>
                  <Grid3X3 className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => setViewMode('list')} className={cn("h-9 w-9 rounded", viewMode === 'list' && 'bg-accent text-accent-foreground shadow-sm')} aria-label="List view" aria-pressed={viewMode === 'list'}>
                  <ListOrdered className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Improvisation List */}
        <ImprovisationList
          viewMode={viewMode}
          setViewMode={setViewMode}
          searchTerm={searchTerm}
          filterStatus={filterStatus}
          sortOption={sortOption}
        />

        {/* Quick Links */}
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-semibold text-foreground">Quick Tools & Links</h2>
            <span className="h-px flex-1 bg-border" aria-hidden />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            <QuickLinkCard href={GEMINI_URL} icon={Zap} title="AI Assistant" description="Access Gemini for creative brainstorming, lyric ideas, or musical theory insights." buttonText="Open Gemini" />
            <QuickLinkCard href={DISTROKID_URL} icon={Music} title="DistroKid" description="Submit your finished improvisations to all major streaming platforms." buttonText="Go to DistroKid" variant="default" />
            <QuickLinkCard href={INSIGHT_TIMER_URL} icon={Clock} title="Insight Timer" description="Upload your meditation music and guided tracks to a global audience." buttonText="Go to Insight Timer" />
          </div>
        </div>
      </main>

      <MadeWithDyad />
    </div>
  );
};

export default Index;