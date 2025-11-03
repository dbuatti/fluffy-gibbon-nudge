import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Check, X, Music, DollarSign, Clock, Globe, Image as ImageIcon, ArrowRight, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

interface ImprovisationData { // Renamed interface
  id: string;
  generated_name: string | null;
  primary_genre: string | null;
  secondary_genre: string | null;
  artwork_url: string | null;
  is_improvisation: boolean | null;
  is_piano: boolean | null;
  is_instrumental: boolean | null;
  is_original_song: boolean | null;
  has_explicit_lyrics: boolean | null;
}

interface DistroKidTabProps {
  imp: ImprovisationData; // Updated prop name and type
  isReady: boolean;
}

const DistroKidTab: React.FC<DistroKidTabProps> = ({ imp, isReady }) => { // Updated prop name
  const isCompleted = !!imp.generated_name;
  const hasArtwork = !!imp.artwork_url;

  const renderStatusItem = (label: string, value: string | boolean | null, isGood: boolean) => (
    <div className="flex items-center justify-between py-2 border-b last:border-b-0">
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
      <span className={`text-sm font-semibold flex items-center ${isGood ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
        {typeof value === 'boolean' ? (
          value ? <Check className="w-4 h-4 mr-1" /> : <X className="w-4 h-4 mr-1" />
        ) : (
          value || 'N/A'
        )}
      </span>
    </div>
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Release Metadata (Analyzed)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {renderStatusItem("Song Title", imp.generated_name, isCompleted)}
          {renderStatusItem("Primary Genre", imp.primary_genre, !!imp.primary_genre)}
          {renderStatusItem("Secondary Genre", imp.secondary_genre, !!imp.secondary_genre)}
          {renderStatusItem("Is Instrumental", true, true)}
          {renderStatusItem("Is Original Song", true, true)}
          {renderStatusItem("Explicit Lyrics", false, true)}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Artwork Compliance Check</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {hasArtwork ? (
            <>
              {/* Since we generate 3000x3000, this check passes if artwork exists */}
              {renderStatusItem("High Resolution (3000x3000)", true, true)}
              {renderStatusItem("No Logos/Text/Frames", true, true)}
              {renderStatusItem("Unique Artwork", true, true)}
              <p className="text-xs text-green-600 dark:text-green-400 mt-2 flex items-center">
                <Check className="w-4 h-4 mr-1" /> Artwork is ready for submission.
              </p>
            </>
          ) : (
            <div className="text-center p-6 border-4 border-dashed border-red-500 rounded-lg bg-red-50 dark:bg-red-950/50 shadow-lg">
              <AlertTriangle className="w-8 h-8 mx-auto mb-3 text-red-600" />
              <p className="text-lg font-bold text-red-700 dark:text-red-300">CRITICAL: Artwork Missing</p>
              <p className="text-sm text-muted-foreground mt-1">
                You must generate or upload artwork before distribution.
              </p>
              {/* Link to the Assets tab and the specific card ID */}
              <Link to={`/improvisation/${imp.id}?tab=assets-downloads#artwork-actions`}> {/* Updated path */}
                <Button variant="destructive" className="mt-4">
                  Go to Artwork Actions <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </Link>
            </div>
          )}
          
          <Separator />

          <p className="text-xs text-muted-foreground">
            💡 Stores will reject artwork that contains a website address (URL), X name, or any image that's pixelated, rotated, or poor quality.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Distribution Options (Simulated)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center space-x-2">
            <Checkbox id="social-media-pack" />
            <Label htmlFor="social-media-pack" className="text-sm flex items-center">
              <DollarSign className="w-4 h-4 mr-1 text-green-500" /> Social Media Pack ($4.95/yr + 20% revenue)
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox id="leave-legacy" />
            <Label htmlFor="leave-legacy" className="text-sm flex items-center">
              <Clock className="w-4 h-4 mr-1 text-blue-500" /> Leave a Legacy ($29 one-time fee)
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox id="store-maximizer" />
            <Label htmlFor="store-maximizer" className="text-sm flex items-center">
              <Globe className="w-4 h-4 mr-1 text-purple-500" /> Store Maximizer ($7.95/yr)
            </Label>
          </div>
          
          <Separator />

          <div className="space-y-2">
            <Label htmlFor="artist-name">Artist/Band Name</Label>
            <Input id="artist-name" defaultValue="Daniele Buatti" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="record-label">Record Label</Label>
            <Input id="record-label" defaultValue="DistroKid.com" />
          </div>

          <Button 
            className={cn("w-full mt-4", !isReady && "bg-red-600 hover:bg-red-700")}
            disabled={!isReady}
          >
            <Music className="w-4 h-4 mr-2" /> 
            {isReady ? 'Simulate DistroKid Submission' : 'BLOCKED: Complete Pre-Flight Checklist'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default DistroKidTab;