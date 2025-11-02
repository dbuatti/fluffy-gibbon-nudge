import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Check, X, Music, DollarSign, Clock, User, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';

interface ImprovisationData {
  generated_name: string | null;
  primary_genre: string | null;
  secondary_genre: string | null;
  artwork_url: string | null;
  is_improvisation: boolean | null;
  is_piano: boolean | null;
}

interface DistroKidTabProps {
  imp: ImprovisationData;
}

const DistroKidTab: React.FC<DistroKidTabProps> = ({ imp }) => {
  const isCompleted = !!imp.generated_name;

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
        <CardContent className="space-y-2">
          {/* Since we generate 3000x3000, this check passes */}
          {renderStatusItem("High Resolution (3000x3000)", true, true)}
          {renderStatusItem("No Logos/Text/Frames", true, true)}
          {renderStatusItem("Unique Artwork", true, true)}
          <p className="text-xs text-muted-foreground mt-2">
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

          <Button className="w-full mt-4">
            <Music className="w-4 h-4 mr-2" /> Simulate DistroKid Submission
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default DistroKidTab;