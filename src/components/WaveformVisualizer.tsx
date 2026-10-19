import React from 'react';
import { cn } from '@/lib/utils';

interface WaveformVisualizerProps {
  /** Public URL of the audio to analyse. */
  src: string;
  duration: number;
  currentTime: number;
  isPlaying: boolean;
  onSeek: (time: number) => void;
  className?: string;
}

const PEAK_COUNT = 100;

/**
 * Decode the real audio and reduce it to `count` peak magnitudes.
 *
 * This used to draw a static random pattern that looked like a waveform but
 * had no relationship to the audio — it never changed between songs and could
 * not be trusted. Decoding once per URL and caching by URL keeps it honest and
 * still cheap.
 */
const peakCache = new Map<string, number[]>();

async function computePeaks(src: string, count: number): Promise<number[]> {
  const cached = peakCache.get(src);
  if (cached) return cached;

  const res = await fetch(src);
  if (!res.ok) throw new Error(`Could not fetch audio (HTTP ${res.status})`);
  const arrayBuffer = await res.arrayBuffer();

  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AudioCtx();
  try {
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    const channel = audioBuffer.getChannelData(0);
    const blockSize = Math.max(1, Math.floor(channel.length / count));
    const peaks: number[] = [];

    for (let i = 0; i < count; i++) {
      const start = i * blockSize;
      const end = Math.min(start + blockSize, channel.length);
      let peak = 0;
      for (let j = start; j < end; j++) {
        const v = Math.abs(channel[j]);
        if (v > peak) peak = v;
      }
      peaks.push(peak);
    }

    // Normalise so a quiet recording still fills the strip.
    const max = Math.max(...peaks, 0.0001);
    const normalised = peaks.map((p) => p / max);
    peakCache.set(src, normalised);
    return normalised;
  } finally {
    void ctx.close();
  }
}

const WaveformVisualizer: React.FC<WaveformVisualizerProps> = ({
  src,
  duration,
  currentTime,
  isPlaying,
  onSeek,
  className,
}) => {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [peaks, setPeaks] = React.useState<number[] | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    setPeaks(null);
    computePeaks(src, PEAK_COUNT)
      .then((p) => { if (!cancelled) setPeaks(p); })
      .catch(() => { if (!cancelled) setPeaks([]); });
    return () => { cancelled = true; };
  }, [src]);

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current || duration === 0) return;

    const rect = containerRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = clickX / rect.width;
    const newTime = percentage * duration;

    onSeek(newTime);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (duration === 0) return;
    const step = duration * 0.05;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      onSeek(Math.min(duration, currentTime + step));
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      onSeek(Math.max(0, currentTime - step));
    }
  };

  return (
    <div
      ref={containerRef}
      role="slider"
      tabIndex={0}
      aria-label="Audio position"
      aria-valuemin={0}
      aria-valuemax={Math.round(duration)}
      aria-valuenow={Math.round(currentTime)}
      className={cn(
        'w-full h-12 flex items-center cursor-pointer rounded-md overflow-hidden bg-muted/50 transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      title="Click to seek audio position"
    >
      {peaks === null || peaks.length === 0
        ? // Loading (or an undecodable file): a neutral bar rather than a fake waveform.
          <div className="w-full h-1 rounded-full bg-primary/20" />
        : peaks.map((peak, index) => {
            const peakTime = (index / peaks.length) * duration;
            const isPast = peakTime <= currentTime;
            const height = Math.max(6, Math.round(peak * 100));

            return (
              <div
                key={index}
                className={cn(
                  'flex-1 mx-[0.5px] rounded-full transition-colors duration-100',
                  isPast ? 'bg-primary' : 'bg-primary/30',
                  isPlaying && isPast && 'shadow-md shadow-primary/50',
                )}
                style={{ height: `${height}%` }}
              />
            );
          })}
    </div>
  );
};

export default WaveformVisualizer;
