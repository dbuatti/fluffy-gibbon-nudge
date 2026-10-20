import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Music, Play, Download, ExternalLink, Clock, Calendar, Tag, FileAudio, FileVideo, FileText, ChevronLeft, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { format } from 'date-fns';

interface Props {
  params: Promise<{ id: string }>;
}

async function getMusicItem(id: string) {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
  const res = await fetch(`${baseUrl}/api/music/${id}`, {
    next: { revalidate: 60 },
  });
  if (!res.ok) return null;
  return res.json();
}

function formatDuration(seconds: number | null) {
  if (!seconds) return '—';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const item = await getMusicItem(id);
  if (!item) return { title: 'Not Found' };
  
  return {
    title: `${item.title} | Daniele Buatti`,
    description: item.description || `Listen to ${item.title} by Daniele Buatti`,
    openGraph: {
      title: item.title,
      description: item.description || `Listen to ${item.title} by Daniele Buatti`,
      images: item.artwork ? [item.artwork] : [],
      type: 'music.song',
      musicians: ['Daniele Buatti'],
    },
  };
}

export default async function MusicItemPage({ params }: Props) {
  const { id } = await params;
  const item = await getMusicItem(id);
  
  if (!item) notFound();

  return (
    <article className="min-h-screen bg-background">
      {/* Hero with artwork */}
      <header className="relative bg-gradient-to-b from-muted/50 to-background min-h-[60vh] md:min-h-[70vh]">
        {item.artwork && (
          <img
            src={item.artwork}
            alt={item.title}
            className="absolute inset-0 w-full h-full object-cover opacity-30"
            priority
          )}
        )}
        <div className="relative max-w-7xl mx-auto px-4 md:px-8 py-16 md:py-24">
          <Link
            href="/music"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8"
          >
            <ChevronLeft className="h-4 w-4" />
            Back to Portfolio
          </Link>
          
          <div className="max-w-3xl">
            <div className="flex flex-wrap gap-2 mb-4">
              <span className="bg-primary/10 text-primary text-xs px-3 py-1 rounded-full font-medium capitalize">
                {item.category}
              </span>
              {item.isPiano && <span className="bg-primary/10 text-primary text-xs px-3 py-1 rounded-full">🎹 Piano</span>}
              {item.isOriginalSong && <span className="bg-emerald-500/10 text-emerald-500 text-xs px-3 py-1 rounded-full">✦ Original</span>}
            </div>
            
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-foreground mb-4">
              {item.title}
            </h1>
            
            <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground mb-6">
              <span className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                {item.date}
              </span>
              {item.genre && (
                <span className="flex items-center gap-1">
                  <Music className="h-4 w-4" />
                  {item.genre}
                </span>
              )}
              {item.subGenre && <span>{item.subGenre}</span>}
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap gap-3 mt-6">
              {item.hasAudio && (
                <button className="bg-primary text-primary-foreground px-6 py-3 rounded-lg font-medium flex items-center gap-2 hover:bg-primary/90 transition-colors">
                  <Play className="h-5 w-5" />
                  Play Audio
                </button>
              )}
              {item.hasVideo && (
                <a href={`/music/${item.id}/video`} className="bg-muted text-foreground px-6 py-3 rounded-lg font-medium flex items-center gap-2 hover:bg-muted/80 transition-colors">
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polygon points="23 7 16 12 23 17 23 7" />
                    <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                  </svg>
                  Watch Video
                </a>
              )}
              {item.hasScore && (
                <a href={`/music/${item.id}/score`} className="bg-muted text-foreground px-6 py-3 rounded-lg font-medium flex items-center gap-2 hover:bg-muted/80 transition-colors">
                  <FileText className="h-5 w-5" />
                  View Score
                </a>
              )}
              <Link href={`/music/${item.id}/download`} className="border border-border/50 px-6 py-3 rounded-lg font-medium flex items-center gap-2 hover:bg-accent transition-colors">
                <Download className="h-5 w-5" />
                Download
              </Link>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 md:px-8 py-8">
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Main content */}
          <div className="lg:col-span-2 space-y-8">
            {/* Description */}
            {item.description && (
              <section className="prose prose-lg max-w-none">
                <h2 className="text-2xl font-bold mb-4">About</h2>
                <p className="text-muted-foreground whitespace-pre-wrap">{item.description}</p>
              </section>
            )}

            {/* Tags */}
            {item.tags.length > 0 && (
              <section>
                <h2 className="text-xl font-bold mb-3 flex items-center gap-2">
                  <Tag className="h-5 w-5 text-muted-foreground" />
                  Tags
                </h2>
                <div className="flex flex-wrap gap-2">
                  {item.tags.map((tag: string) => (
                    <Link
                      key={tag}
                      href={`/music?search=${encodeURIComponent(tag)}`}
                      className="bg-muted text-muted-foreground hover:bg-accent hover:text-foreground px-3 py-1 rounded-full text-sm transition-colors"
                    >
                      {tag}
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {/* Themes */}
            {item.themes && item.themes.length > 0 && (
              <section>
                <h2 className="text-xl font-bold mb-3 flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  Themes & Mood
                </h2>
                <div className="flex flex-wrap gap-2">
                  {item.themes.map((theme: string) => (
                    <span key={theme} className="bg-primary/10 text-primary px-3 py-1 rounded-full text-sm">
                      {theme}
                    </span>
                  ))}
                </div>
              </section>
            )}

            {/* Benefits/Practices */}
            {(item.benefits && item.benefits.length > 0) || (item.practices && item.practices.length > 0) && (
              <section>
                <h2 className="text-xl font-bold mb-3">Suggested For</h2>
                <div className="grid sm:grid-cols-2 gap-4">
                  {item.benefits && item.benefits.length > 0 && (
                    <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-4">
                      <h3 className="font-semibold text-emerald-600 mb-2 flex items-center gap-2">
                        <Sparkles className="h-4 w-4" />
                        Benefits
                      </h3>
                      <ul className="space-y-1 text-sm text-muted-foreground">
                        {item.benefits.map((b: string) => (
                          <li key={b} className="flex items-center gap-2">
                            <span className="h-1.5 w-1.5 bg-emerald-500 rounded-full" />
                            {b}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {item.practices && item.practices.length > 0 && (
                    <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
                      <h3 className="font-semibold text-blue-600 mb-2 flex items-center gap-2">
                        <Sparkles className="h-4 w-4" />
                        Practices
                      </h3>
                      <ul className="space-y-1 text-sm text-muted-foreground">
                        {item.practices.map((p: string) => (
                          <li key={p} className="flex items-center gap-2">
                            <span className="h-1.5 w-1.5 bg-blue-500 rounded-full" />
                            {p}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </section>
            )}
          </section>

          {/* Audio Player */}
          {item.hasAudio && (
            <section className="bg-muted/30 rounded-xl p-6">
              <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                <FileAudio className="h-5 w-5" />
                Listen
              </h2>
              <audio controls className="w-full" preload="metadata">
                <source src={`/api/music/${item.id}/audio`} type="audio/mpeg" />
                Your browser does not support the audio element.
              </audio>
            </section>
          )}
        </section>

        {/* Meta */}
        <section className="border-t border-border/50 pt-6">
          <h2 className="text-lg font-semibold mb-3">Details</h2>
          <dl className="grid sm:grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-muted-foreground">Date</dt>
              <dd className="font-medium">{item.date}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Category</dt>
              <dd className="font-medium capitalize">{item.category}</dd>
            </div>
            {item.genre && (
              <div>
                <dt className="text-muted-foreground">Genre</dt>
                <dd className="font-medium">{item.genre}</dd>
              </div>
            )}
            {item.subGenre && (
              <div>
                <dt className="text-muted-foreground">Sub-genre</dt>
                <dd className="font-medium">{item.subGenre}</dd>
              </div>
            )}
            <div>
              <dt className="text-muted-foreground">Piano</dt>
              <dd className="font-medium">{item.isPiano ? 'Yes 🎹' : 'No'}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Original</dt>
              <dd className="font-medium">{item.isOriginalSong ? 'Yes ✦' : 'No'}</dd>
            </div>
          </dl>
        </section>
      </section>
    </section>

    {/* Sidebar */}
    <aside className="space-y-6">
      {/* Quick Actions */}
      <div className="bg-muted/30 rounded-xl p-6 space-y-3 sticky top-24">
        <h3 className="font-semibold">Quick Actions</h3>
        <Link href={`/music/${item.id}/download`} className="block w-full">
          <button className="w-full bg-primary text-primary-foreground px-4 py-3 rounded-lg font-medium flex items-center justify-center gap-2 hover:bg-primary/90 transition-colors">
            <Download className="h-5 w-5" />
            Download All Formats
          </button>
        </Link>
        {item.hasAudio && (
          <a href={`/music/${item.id}/audio`} className="block">
            <button className="w-full border border-border/50 px-4 py-3 rounded-lg font-medium flex items-center justify-center gap-2 hover:bg-accent transition-colors">
              <Play className="h-5 w-5" />
              Stream Audio
            </button>
          </a>
        )}
        {item.hasVideo && (
          <a href={`/music/${item.id}/video`} className="block">
            <button className="w-full border border-border/50 px-4 py-3 rounded-lg font-medium flex items-center justify-center gap-2 hover:bg-accent transition-colors">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="23 7 16 12 23 17 23 7" />
                <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
              </svg>
              Watch Video
            </button>
          </a>
        )}
        {item.hasScore && (
          <a href={`/music/${item.id}/score`} className="block">
            <button className="w-full border border-border/50 px-4 py-3 rounded-lg font-medium flex items-center justify-center gap-2 hover:bg-accent transition-colors">
              <FileText className="h-5 w-5" />
              View Score
            </button>
          </a>
        )}
        <Link href="/music" className="block">
          <button className="w-full text-muted-foreground hover:text-foreground px-4 py-3 font-medium flex items-center justify-center gap-2 transition-colors">
            <ChevronLeft className="h-5 w-5" />
            Back to Portfolio
          </button>
        </Link>
      </div>
    </aside>
    </div>
  </main>
</article>
  );
}