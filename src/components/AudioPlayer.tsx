import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Play, Pause, Loader2, Volume2, VolumeX, AlertTriangle, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

interface AudioPlayerProps {
  publicUrl: string;
  fileName: string;
  storagePath: string;
  onClearFile: () => void; // New prop to handle clearing the file path
}

const formatTime = (seconds: number): string => {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${remainingSeconds < 10 ? '0' : ''}${remainingSeconds}`;
};

const AudioPlayer: React.FC<AudioPlayerProps> = ({ publicUrl, fileName, onClearFile }) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // --- Handlers ---

  const handlePlayPause = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      if (isPlaying) {
        audio.pause();
      } else {
        audio.play().catch(e => {
          console.error("Playback failed:", e);
          setError("Playback failed. Ensure browser allows autoplay or try clicking again.");
        });
      }
      setIsPlaying(!isPlaying);
    }
  }, [isPlaying]);

  const handleTimeUpdate = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      setCurrentTime(audio.currentTime);
    }
  }, []);

  const handleLoadedMetadata = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      setDuration(audio.duration);
    }
  }, []);

  const handleLoadedData = useCallback(() => {
    setIsLoaded(true);
    setError(null); // Clear error on successful load
  }, []);

  const handleEnded = useCallback(() => {
    setIsPlaying(false);
    setCurrentTime(0);
  }, []);

  const handleSeek = useCallback((value: number[]) => {
    const audio = audioRef.current;
    if (audio) {
      audio.currentTime = value[0];
      setCurrentTime(value[0]);
    }
  }, []);

  const handleVolumeChange = useCallback((value: number[]) => {
    const audio = audioRef.current;
    const newVolume = value[0] / 100;
    if (audio) {
      audio.volume = newVolume;
      setVolume(newVolume);
      if (newVolume > 0) {
        setIsMuted(false);
      }
    }
  }, []);

  const handleMuteToggle = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  }, [isMuted]);

  // FIX: Changed type from React.SyntheticEvent to native DOM Event
  const handleError = useCallback((e: Event) => {
    console.error("Audio error:", e);
    
    // Reset states to reflect failure
    setIsLoaded(false); 
    setIsPlaying(false); 
    
    const errorMessage = `Failed to load audio file. This often indicates the file is missing in Supabase Storage or the public access policy is incorrect. URL: ${publicUrl}`;
    setError(errorMessage);
    console.error(errorMessage);
  }, [publicUrl]);

  // --- Effects ---

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) {
      // Attach all event listeners
      audio.addEventListener('loadedmetadata', handleLoadedMetadata);
      audio.addEventListener('loadeddata', handleLoadedData);
      audio.addEventListener('timeupdate', handleTimeUpdate);
      audio.addEventListener('ended', handleEnded);
      audio.addEventListener('error', handleError); // Attach error handler

      // Cleanup function
      return () => {
        audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
        audio.removeEventListener('loadeddata', handleLoadedData);
        audio.removeEventListener('timeupdate', handleTimeUpdate);
        audio.removeEventListener('ended', handleEnded);
        audio.removeEventListener('error', handleError);
      };
    }
  }, [handleLoadedMetadata, handleLoadedData, handleTimeUpdate, handleEnded, handleError]);

  // Reset states if publicUrl changes (e.g., user uploads a new file)
  useEffect(() => {
    setIsPlaying(false);
    setIsLoaded(false);
    setCurrentTime(0);
    setDuration(0);
    setError(null);
  }, [publicUrl]);

  // --- Render ---

  const PlayPauseIcon = isPlaying ? Pause : Play;
  const VolumeIcon = isMuted || volume === 0 ? VolumeX : Volume2;

  return (
    <Card className="p-4">
      <CardContent className="p-0 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold truncate">{fileName}</h3>
          {error && (
            <Badge variant="destructive" className="flex items-center">
              <AlertTriangle className="h-4 w-4 mr-1" /> Error
            </Badge>
          )}
        </div>

        {/* Main Controls */}
        <div className="flex items-center space-x-4">
          <Button 
            onClick={handlePlayPause} 
            size="icon" 
            disabled={!isLoaded || error !== null}
            className={cn(
                "flex-shrink-0",
                !isLoaded && "bg-gray-400 hover:bg-gray-400"
            )}
          >
            {!isLoaded && error === null ? (
                <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
                <PlayPauseIcon className="h-5 w-5" />
            )}
          </Button>

          {/* Time Slider */}
          <div className="flex-grow flex items-center space-x-3">
            <span className="text-sm text-muted-foreground w-10 text-right">{formatTime(currentTime)}</span>
            <Slider
              value={[currentTime]}
              max={duration}
              step={0.1}
              onValueChange={handleSeek}
              disabled={!isLoaded || error !== null}
              className="flex-grow"
            />
            <span className="text-sm text-muted-foreground w-10">{formatTime(duration)}</span>
          </div>

          {/* Volume Controls */}
          <div className="flex items-center space-x-2 w-32 flex-shrink-0">
            <Button onClick={handleMuteToggle} variant="ghost" size="icon" className="h-8 w-8">
              <VolumeIcon className="h-4 w-4" />
            </Button>
            <Slider
              value={[isMuted ? 0 : volume * 100]}
              max={100}
              step={1}
              onValueChange={handleVolumeChange}
              disabled={error !== null}
            />
          </div>
        </div>
        
        {/* Error Message Display */}
        {error && (
            <div className="p-3 bg-red-50 dark:bg-red-950/50 border border-red-300 rounded-lg mt-4 flex justify-between items-center">
                <p className="text-sm text-red-700 dark:text-red-300 font-medium flex items-center">
                    <AlertTriangle className="h-4 w-4 mr-2 flex-shrink-0" />
                    {error}
                </p>
                <Button 
                    onClick={onClearFile} 
                    variant="destructive" 
                    size="sm" 
                    className="flex-shrink-0 ml-4"
                >
                    <Trash2 className="h-4 w-4 mr-2" /> Clear Audio File
                </Button>
            </div>
        )}

        {/* Hidden Audio Element */}
        <audio ref={audioRef} src={publicUrl} preload="metadata" crossOrigin="anonymous" />
      </CardContent>
    </Card>
  );
};

export default AudioPlayer;