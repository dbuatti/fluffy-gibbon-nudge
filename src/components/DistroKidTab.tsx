import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Check, X, ArrowRight, AlertTriangle, Lightbulb, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { DISTROKID_URL } from '@/lib/constants';
import type { Improvisation } from '@/types/improvisation';

interface DistroKidTabProps {
  imp: ImprovisationData;
  isReady: boolean;
  handleUpdateIsSubmittedToDistroKid: (checked: boolean) => Promise<void>;
}

type ImprovisationData = Pick<Improvisation, 'id' | 'generated_name' | 'primary_genre' | 'secondary_genre' | 'artwork_url' | 'is_improvisation' | 'is_piano' | 'is_instrumental' | 'is_original_song' | 'has_explicit_lyrics' | 'is_submitted_to_distrokid'>;

/**
 * DistroKid submission prep.
 *
 * Every row here is read from the record. The previous version hardcoded
 * "Is Instrumental: true", "Explicit Lyrics: false" and a whole "Artwork
 * Compliance Check" that passed unconditionally, plus a decorative options
 * card with checkboxes that were never read and an artist/label input whose
 * values went nowhere. All of that is gone — the page now says what it knows
 * and links out for everything else.
 */
const DistroKidTab: React.FC<DistroKidTabProps> = ({ imp, isReady, handleUpdateIsSubmittedToDistroKid }) => {
  const hasArtwork = !!imp.artwork_url;

  /** A metadata row. `value === null` means "not set", shown as a dash. */
  const renderRow = (label: string, value: string | boolean | null) => {
    const isMissing = value === null || value === '';
    return (
      <div className="flex items-center justify-between py-2 border-b last:border-b-0">
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
        <span
          className={
            isMissing
              ? 'text-sm font-semibold text-muted-foreground'
              : 'text-sm font-semibold text-foreground'
          }
        >
          {typeof value === 'boolean' ? (
            value ? (
              <span className="flex items-center text-success"><Check className="w-4 h-4 mr-1" /> Yes</span>
            ) : (
              <span className="flex items-center text-muted-foreground"><X className="w-4 h-4 mr-1" /> No</span>
            )
          ) : (
            value || 'Not set'
          )}
        </span>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Release Metadata</CardTitle>
        </CardHeader>
        <CardContent>
          {renderRow('Song Title', imp.generated_name)}
          {renderRow('Primary Genre', imp.primary_genre)}
          {renderRow('Secondary Genre', imp.secondary_genre)}
          {renderRow('Instrumental', imp.is_instrumental)}
          {renderRow('Original Song', imp.is_original_song)}
          {renderRow('Explicit Lyrics', imp.has_explicit_lyrics)}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Artwork</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {hasArtwork ? (
            <>
              <img
                src={imp.artwork_url!}
                alt={imp.generated_name || 'Release artwork'}
                className="w-full max-w-xs aspect-square object-cover rounded-lg border border-primary/30 mx-auto"
              />
              <p className="text-xs text-muted-foreground text-center">
                Verify the cover at full size on the Assets tab — dimensions and file size are
                measured there rather than assumed here.
              </p>
            </>
          ) : (
            <div className="text-center p-6 border-2 border-dashed border-destructive/50 rounded-lg bg-destructive/5">
              <AlertTriangle className="w-8 h-8 mx-auto mb-3 text-destructive" />
              <p className="text-lg font-bold text-destructive mb-1">Artwork missing</p>
              <p className="text-sm text-muted-foreground mt-1">
                DistroKid rejects a release without cover art. Create it on the Assets tab.
              </p>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => {
                  window.location.href = `/improvisation/${imp.id}?tab=assets-downloads`;
                }}
              >
                Go to Artwork <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          )}

          <Separator />

          <p className="text-xs text-muted-foreground flex items-start gap-1.5">
            <Lightbulb className="w-3.5 h-3.5 mt-0.5 text-warning flex-shrink-0" />
            <span>Stores reject artwork that contains a website address, a store name, or any image that is pixelated or low quality.</span>
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Submit on DistroKid</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Uploading and pricing happen on DistroKid itself. Everything this song needs is on
            this page; use the link below when you are ready.
          </p>

          <Button asChild variant={isReady ? 'default' : 'outline'} className="w-full">
            <a href={DISTROKID_URL} target="_blank" rel="noopener noreferrer">
              Open DistroKid <ExternalLink className="w-4 h-4 ml-2" />
            </a>
          </Button>

          <Separator />

          <div className="flex items-center justify-between p-3 bg-success/5 border border-success/30 rounded-lg">
            <div className="space-y-1">
              <Label htmlFor="distrokid-submitted" className="text-base font-bold flex items-center text-success">
                <Check className="h-5 w-5 mr-2" /> Mark as submitted to DistroKid
              </Label>
              <p className="text-sm text-muted-foreground">
                Tick this once the track is live on DistroKid, so this page reflects reality.
              </p>
            </div>
            <Switch
              id="distrokid-submitted"
              checked={!!imp.is_submitted_to_distrokid}
              onCheckedChange={handleUpdateIsSubmittedToDistroKid}
              disabled={!isReady}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default DistroKidTab;
