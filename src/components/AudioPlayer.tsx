import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Play, Pause, Volume2, VolumeX, Loader2, Music } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AudioPlayerProps {
  storagePath: string;
  fileName: string;
  publicUrl: string;
}

const formatTime = (seconds: number): string => {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
};

const AudioPlayer: React.FC<AudioPlayerProps> = ({ storagePath, fileName, publicUrl }) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1); // 0 to 1
  const [isMuted, setIsMuted] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // --- Event Handlers ---

  const handleLoadedMetadata = useCallback(() => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
      setIsLoaded(true);
    }
  }, []);

  const handleTimeUpdate = useCallback(() => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  }, []);

  const handleEnded = useCallback(() => {
    setIsPlaying(false);
    setCurrentTime(0);
  }, []);

  const handlePlayPause = useCallback(() => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play().catch(e => {
          console.error("Playback failed:", e);
          setError("Playback failed. Check browser permissions or file format.");
        });
      }
      setIsPlaying(!isPlaying);
    }
  }, [isPlaying]);

  const handleSeek = useCallback((value: number[]) => {
    if (audioRef.current) {
      audioRef.current.currentTime = value[0];
      setCurrentTime(value[0]);
    }
  }, []);

  const handleVolumeChange = useCallback((value: number[]) => {
    const newVolume = value[0] / 100;
    if (audioRef.current) {
      audioRef.current.volume = newVolume;
      setIsMuted(newVolume === 0);
    }
    setVolume(newVolume);
  }, []);

  const handleMuteToggle = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  }, [isMuted]);

  // --- Effect for attaching listeners ---
  useEffect(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.addEventListener('loadedmetadata', handleLoadedMetadata);
      audio.addEventListener('timeupdate', handleTimeUpdate);
      audio.addEventListener('ended', handleEnded);
      audio.addEventListener('play', () => setIsPlaying(true));
      audio.addEventListener('pause', () => setIsPlaying(false));
      audio.addEventListener('error', (e) => {
        console.error("Audio error:", e);
        let errorMessage = "Error loading audio file.";
        // Check for specific error codes (e.g., NETWORK_ERR=2, DECODE_ERR=3, SRC_NOT_SUPPORTED=4)
        if (audio.error?.code === 4) {
            errorMessage = "File not found, format unsupported, or Supabase Storage permissions are incorrect.";
        }
        setError(errorMessage);
      });
      
      // Set initial volume
      audio.volume = volume;

      return () => {
        audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
        audio.removeEventListener('timeupdate', handleTimeUpdate);
        audio.removeEventListener('ended', handleEnded);
        audio.removeEventListener('play', () => setIsPlaying(true));
        audio.removeEventListener('pause', () => setIsPlaying(false));
        audio.removeEventListener('error', () => {});
      };
    }
  }, [handleLoadedMetadata, handleTimeUpdate, handleEnded, volume]);

  if (error) {
    return (
      <Card className="p-4 bg-red-50 dark:bg-red-950 border-red-500">
        <p className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      </Card>
    );
  }

  return (
    <Card className="w-full shadow-lg">
      <CardContent className="p-4 space-y-3">
        <audio ref={audioRef} src={publicUrl} preload="metadata" />

        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Button 
              onClick={handlePlayPause} 
              size="icon" 
              variant="ghost" 
              disabled={!isLoaded}
            >
              {isLoaded ? (
                isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />
              ) : (
                <Loader2 className="h-5 w-5 animate-spin" />
              )}
            </Button>
            
            <div className="text-sm font-medium truncate max-w-[200px] sm:max-w-none">
              {fileName}
            </div>
          </div>

          <div className="flex items-center space-x-3">
            {/* Volume Control */}
            <Button 
              onClick={handleMuteToggle} 
              size="icon" 
              variant="ghost"
            >
              {isMuted || volume === 0 ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
            </Button>
            <div className="w-20 hidden sm:block">
              <Slider
                min={0}
                max={100}
                step={1}
                value={[isMuted ? 0 : volume * 100]}
                onValueChange={handleVolumeChange}
                aria-label="Volume"
              />
            </div>
          </div>
        </div>

        {/* Progress Bar and Time */}
        <div className="flex items-center space-x-3">
          <span className="text-xs text-muted-foreground w-10 flex-shrink-0">
            {formatTime(currentTime)}
          </span>
          <div className="flex-grow">
            <Slider
              min={0}
              max={duration}
              step={0.1}
              value={[currentTime]}
              onValueChange={handleSeek}
              disabled={!isLoaded}
              aria-label="Seek"
            />
          </div>
          <span className="text-xs text-muted-foreground w-10 flex-shrink-0 text-right">
            {isLoaded ? formatTime(duration) : '--:--'}
          </span>
        </div>
      </CardContent>
    </Card>
  );
};

export default AudioPlayer;