import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BookOpen, Clock, Users } from 'lucide-react';
import InsightTimerDescriptionGenerator from './InsightTimerDescriptionGenerator'; // Import new component

interface ImprovisationData {
  id: string; // Added ID for generator
  generated_name: string | null;
  primary_genre: string | null;
  is_improvisation: boolean | null;
}

interface InsightTimerTabProps {
  imp: ImprovisationData;
}

const InsightTimerTab: React.FC<InsightTimerTabProps> = ({ imp }) => {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Insight Timer Preparation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Insight Timer requires content to be categorized for meditation, sleep, or other wellness practices.
          </p>
          
          {/* Description Generator */}
          <InsightTimerDescriptionGenerator improvisationId={imp.id} />

          <div className="space-y-2 pt-4">
            <h4 className="font-semibold flex items-center"><BookOpen className="w-4 h-4 mr-2" /> Suggested Title</h4>
            <p className="text-lg font-mono bg-muted p-2 rounded">{imp.generated_name || 'Awaiting Analysis'}</p>
          </div>

          <div className="space-y-2">
            <h4 className="font-semibold flex items-center"><Clock className="w-4 h-4 mr-2" /> Primary Use</h4>
            <p className="text-sm text-muted-foreground">
              Based on the mood and tempo analysis, this piece is suitable for:
            </p>
            <ul className="list-disc list-inside ml-4 text-sm">
              <li>Meditation / Focus</li>
              <li>Sleep / Relaxation</li>
            </ul>
          </div>

          <div className="space-y-2">
            <h4 className="font-semibold flex items-center"><Users className="w-4 h-4 mr-2" /> Best Suited For</h4>
            <p className="text-sm text-muted-foreground">
              This piece is generally suitable for:
            </p>
            <ul className="list-disc list-inside ml-4 text-sm">
              <li>Everyone</li>
              <li>Complete beginners</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default InsightTimerTab;