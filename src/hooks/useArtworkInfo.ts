import { useEffect, useState } from 'react';
import { getImageDimensions, describeImage, INSIGHT_TIMER_MIN_DIM, INSIGHT_TIMER_MAX_BYTES } from '@/lib/image-compliance';

export function useArtworkInfo(artworkUrl: string | null | undefined) {
  const [artworkInfo, setArtworkInfo] = useState<string | null>(null);
  const [artworkReady, setArtworkReady] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!artworkUrl) {
      setArtworkInfo(null);
      setArtworkReady(null);
      return;
    }
    (async () => {
      try {
        const res = await fetch(artworkUrl!);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        const dims = await getImageDimensions(blob);
        if (cancelled) return;
        setArtworkInfo(describeImage(blob, dims));
        setArtworkReady(
          Math.min(dims.width, dims.height) >= INSIGHT_TIMER_MIN_DIM
          && blob.size <= INSIGHT_TIMER_MAX_BYTES,
        );
      } catch {
        if (!cancelled) {
          setArtworkInfo(null);
          setArtworkReady(null);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [artworkUrl]);

  return { artworkInfo, artworkReady };
}