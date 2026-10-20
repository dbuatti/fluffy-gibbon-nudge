import { Metadata } from 'next';
import { Music, Search, Filter, Grid3X3, ChevronRight, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { Suspense } from 'react';

export const metadata: Metadata = {
  title: 'Music Portfolio | Daniele Buatti',
  description: 'Composer · Pianist · Arranger · Music Director. Original compositions, arrangements, theatre scores, and works in progress.',
  openGraph: {
    title: 'Music Portfolio | Daniele Buatti',
    description: 'Original compositions, arrangements, theatre scores, and works in progress.',
    type: 'website',
  },
};

const CATEGORIES = [
  { key: 'all', label: 'All Music', icon: Sparkles, count: null },
  { key: 'compositions', label: 'Compositions', icon: Music, count: 0 },
  { key: 'arrangements', label: 'Arrangements', icon: Music, count: 0 },
  { key: 'theatre', label: 'Theatre & MD', icon: Music, count: 0 },
  { key: 'wip', label: 'Works in Progress', icon: Sparkles, count: 0 },
];

interface MusicCardProps {
  item: {
    id: string;
    title: string;
    date: string;
    category: string;
    artwork: string | null;
    description: string | null;
    tags: string[];
    hasAudio: boolean;
    hasVideo: boolean;
    hasScore: boolean;
    isPiano: boolean;
    isOriginalSong: boolean;
  };
}

function MusicCard({ item }: MusicCardProps) {
  return (
    <Link 
      href={`/music/${item.id}`}
      className="group block bg-background/50 hover:bg-background/80 transition-all duration-300 rounded-xl overflow-hidden border border-border/50 hover:border-primary/30"
    >
      <div className="relative aspect-square overflow-hidden bg-gradient-to-br from-muted/50 to-muted/30">
        {item.artwork ? (
          <img
            src={item.artwork}
            alt={item.title}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground/50 p-4">
            <Music className="h-12 w-12 mb-2" />
            <p className="text-xs text-center px-2">No artwork</p>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        <div className="absolute bottom-3 left-3 right-3 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 translate-y-2 group-hover:translate-y-0">
          {item.hasAudio && (
            <span className="bg-black/80 backdrop-blur text-white text-[10px] px-2 py-1 rounded-full flex items-center gap-1">
              <Music className="h-3 w-3" /> Audio
            </span>
          )}
          {item.hasVideo && (
            <span className="bg-black/80 backdrop-blur text-white text-[10px] px-2 py-1 rounded-full flex items-center gap-1">
              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="23 7 16 12 23 17 23 7" />
                <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
              </svg>
              Video
            </span>
          )}
        </div>
        <div className="absolute top-3 left-3">
          <span className="bg-primary/90 backdrop-blur text-primary-foreground text-[9px] px-1.5 py-0.5 rounded-full font-medium capitalize">
            {item.category}
          </span>
        </div>
      </div>
      <div className="p-4 space-y-2">
        <h3 className="font-semibold text-foreground line-clamp-1 group-hover:text-primary transition-colors">
          {item.title}
        </h3>
        <p className="text-xs text-muted-foreground">{item.date}</p>
        <div className="flex flex-wrap gap-1">
          {item.tags.slice(0, 3).map((tag: string) => (
            <span key={tag} className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
              {tag}
            </span>
          ))}
          {item.tags.length > 3 && (
            <span className="text-[10px] text-muted-foreground px-1.5 py-0.5">
              +{item.tags.length - 3}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 pt-2 border-t border-border/50">
          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
            {item.isPiano && <span className="text-primary">🎹</span>}
            {item.isOriginalSong && <span className="text-emerald-500">✦</span>}
          </span>
        </div>
      </div>
    </Link>
  );
}

async function getMusicData() {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
  const res = await fetch(`${baseUrl}/api/music?limit=50`, {
    next: { revalidate: 60 }, // ISR: revalidate every 60s
  });
  if (!res.ok) return { items: [], total: 0 };
  return res.json();
}

export default async function MusicPage() {
  const { items, total } = await getMusicData();
  
  // Count by category
  const categoryCounts = {
    compositions: items.filter(i => i.category === 'compositions').length,
    arrangements: items.filter(i => i.category === 'arrangements').length,
    theatre: items.filter(i => i.category === 'theatre').length,
    wip: items.filter(i => i.category === 'wip').length,
  };
  
  const categoriesWithCounts = CATEGORIES.map(cat => ({
    ...cat,
    count: cat.key === 'all' ? total : categoryCounts[cat.key as keyof typeof categoryCounts] || 0,
  }));

  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <header className="border-b border-border/50 bg-background/95 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Daniele Buatti</p>
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground">
                Music Portfolio
              </h1>
              <p className="mt-2 text-muted-foreground max-w-2xl">
                Composer · Pianist · Arranger · Music Director
              </p>
            </div>
            <div className="flex items-center gap-2">
              <a href="https://composerhub.vercel.app/admin" target="_blank" rel="noopener noreferrer">
                <span className="text-xs text-muted-foreground">Admin →</span>
              </a>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 md:px-8 py-8">
        {/* Category Tabs */}
        <nav className="mb-8" aria-label="Music categories">
          <div className="flex flex-wrap gap-2">
            {categoriesWithCounts.map((cat) => (
              <Link
                key={cat.key}
                href={`/music?category=${cat.key}`}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-all ${
                  cat.key === 'all'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted hover:bg-accent text-muted-foreground hover:text-foreground'
                }`}
              >
                <cat.icon className="h-4 w-4" />
                {cat.label}
                {cat.count !== null && (
                  <span className="bg-background/50 text-xs px-2 py-0.5 rounded-full">
                    {cat.count}
                  </span>
                )}
              </Link>
            )}
          </div>
        </nav>

        {/* Grid */}
        <Suspense fallback={<GridSkeleton />}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {total > 0 ? (
              items.map((item: any) => <MusicCard key={item.id} item={item} />)
            ) : (
              <div className="col-span-full text-center py-16">
                <Music className="h-16 w-16 mx-auto mb-4 text-muted-foreground/50" />
                <h2 className="text-xl font-semibold mb-2">No music yet</h2>
                <p className="text-muted-foreground">Your portfolio will appear here once you mark pieces as ready for release.</p>
              </div>
            )}
          </div>
        </Suspense>

        {/* Pagination */}
        {total > 20 && (
          <div className="mt-8 flex justify-center gap-2">
            <button className="px-4 py-2 border border-border/50 rounded-lg hover:bg-accent">
              Previous
            </button>
            <button className="px-4 py-2 bg-primary text-primary-foreground rounded-lg">
              Next
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

function GridSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="bg-background/50 rounded-xl overflow-hidden border border-border/50">
          <div className="aspect-square bg-muted/50 animate-pulse" />
          <div className="p-4 space-y-2">
            <div className="h-6 w-3/4 bg-muted/50 rounded animate-pulse" />
            <div className="h-4 w-1/4 bg-muted/50 rounded animate-pulse" />
            <div className="h-4 w-1/2 bg-muted/50 rounded animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  );
}

// We need to get data at the top level for the category counts
const { items, total } = await getMusicData();
const categoryCounts = {
  compositions: items.filter((i: any) => i.category === 'compositions').length,
  arrangements: items.filter((i: any) => i.category === 'arrangements').length,
  theatre: items.filter((i: any) => i.category === 'theatre').length,
  wip: items.filter((i: any) => i.category === 'wip').length,
};
const categoriesWithCounts = CATEGORIES.map(cat => ({
  ...cat,
  count: cat.key === 'all' ? total : categoryCounts[cat.key as keyof typeof categoryCounts] || 0,
}));