import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, Music, ListMusic, ArrowRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { MadeWithDyad } from '@/components/made-with-dyad';
import { cn } from '@/lib/utils';

interface ModeCardProps {
  to: string;
  icon: React.ElementType;
  title: string;
  tagline: string;
  description: string;
  accent: string;
  features: string[];
}

const ModeCard: React.FC<ModeCardProps> = ({ to, icon: Icon, title, tagline, description, accent, features }) => (
  <Link to={to} className="block group h-full">
    <Card className={cn(
      "h-full flex flex-col justify-between p-8 shadow-card-light dark:shadow-card-dark",
      "hover:shadow-2xl transition-all duration-200 border-2 border-transparent hover:-translate-y-1",
      accent
    )}>
      <CardContent className="p-0 space-y-6">
        <div className="flex items-center justify-between">
          <div className="h-16 w-16 rounded-2xl bg-primary/10 dark:bg-primary/20 flex items-center justify-center">
            <Icon className="h-9 w-9 text-primary" />
          </div>
          <ArrowRight className="h-6 w-6 text-primary opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>

        <div>
          <h2 className="text-3xl font-bold tracking-tight text-foreground">{title}</h2>
          <p className="text-sm font-medium text-primary mt-1">{tagline}</p>
        </div>

        <p className="text-muted-foreground leading-relaxed">{description}</p>

        <ul className="space-y-2">
          {features.map((feature) => (
            <li key={feature} className="flex items-start text-sm text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-primary mt-1.5 mr-2 flex-shrink-0" />
              {feature}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  </Link>
);

const Home: React.FC = () => {
  useEffect(() => {
    document.title = 'AI Composer Hub';
  }, []);

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-10">
        <header className="text-center pt-8 md:pt-12">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20 mb-6">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium text-primary">Choose your workspace</span>
          </div>
          <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight text-foreground">
            AI Composer Hub
          </h1>
          <p className="text-lg text-muted-foreground mt-4 max-w-2xl mx-auto">
            Pick a mode to get started. Compose new pieces or track how you arrange your music for different ensembles.
          </p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-4">
          <ModeCard
            to="/composer"
            icon={Music}
            title="Composer"
            tagline="Write, capture & finish new pieces"
            description="Capture spontaneous ideas, run them through the AI pipeline, add notes and artwork, and get them ready for release."
            accent="hover:border-primary"
            features={[
              'Capture new ideas instantly',
              'AI analysis & artwork generation',
              'Creative notes, tags & metadata',
              'Distribution prep (DistroKid, Insight Timer)',
            ]}
          />

          <ModeCard
            to="/arranging"
            icon={ListMusic}
            title="Arranging"
            tagline="Rework pieces for new ensembles"
            description="Track every arrangement of your compositions — the instrumentation, key, tempo, score and audio links, plus your notes."
            accent="hover:border-primary"
            features={[
              'Track arrangements of your tracks',
              'Instrumentation, key, tempo & genre',
              'Notes and progress status per arrangement',
              'Keep score & audio file links organized',
            ]}
          />
        </div>
      </div>

      <MadeWithDyad />
    </div>
  );
};

export default Home;