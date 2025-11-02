import React from 'react';
import { cn } from '@/lib/utils';

interface WaveformVisualizerProps {
  duration: number;
  currentTime: number;
  isPlaying: boolean;
  onSeek: (time: number) => void;
  className?: string;
}

// Generate a simple, static, visually pleasing waveform pattern
const generateWaveformPeaks = (count: number): number[] => {
  const peaks = [];
  for (let i = 0; i < count; i++) {
    // Generate peaks that are generally higher in the middle and taper off
    const normalizedIndex = Math.abs(i - count / 2) / (count / 2);
    const baseHeight = 0.2 + 0.8 * (1 - normalizedIndex * normalizedIndex);
    const randomFactor = 0.8 + Math.random() * 0.4; // Add some randomness
    peaks.push(Math.min(1, baseHeight * randomFactor));
  }
  return peaks;
};

const PEAK_COUNT = 100;
const PEAKS = generateWaveformPeaks(PEAK_COUNT);

const WaveformVisualizer: React.FC<WaveformVisualizerProps> = ({
  duration,
  currentTime,
  isPlaying,
  onSeek,
  className,
}) => {
  const containerRef = React.useRef<HTMLDivElement>(null);

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current || duration === 0) return;

    const rect = containerRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = clickX / rect.width;
    const newTime = percentage * duration;
    
    onSeek(newTime);
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        "w-full h-12 flex items-center cursor-pointer rounded-md overflow-hidden bg-muted/50 transition-shadow",
        className
      )}
      onClick={handleClick}
      title="Click to seek audio position"
    >
      {PEAKS.map((peak, index) => {
        const peakTime = (index / PEAK_COUNT) * duration;
        const isPast = peakTime <= currentTime;
        
        // Scale height from 10% to 100%
        const height = Math.max(10, Math.round(peak * 100)); 

        return (
          <div
            key={index}
            className={cn(
              "flex-1 mx-[0.5px] rounded-full transition-colors duration-100",
              isPast ? "bg-primary" : "bg-primary/30",
              isPlaying && isPast && "shadow-md shadow-primary/50"
            )}
            style={{ height: `${height}%` }}
          />
        );
      })}
    </div>
  );
};

export default WaveformVisualizer;