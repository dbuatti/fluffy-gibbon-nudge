import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BookOpen, Clock, Users, Info, CheckCircle, XCircle } from 'lucide-react';
import InsightTimerDescriptionGenerator from './InsightTimerDescriptionGenerator';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';

interface ImprovisationData {
  id: string; // Added ID for generator
  generated_name: string | null;
  primary_genre: string | null;
  is_improvisation: boolean | null;
  insight_use: string | null; // NEW
  insight_audience: string | null; // NEW
}

interface InsightTimerTabProps {
  imp: ImprovisationData;
}

const InsightTimerTab: React.FC<InsightTimerTabProps> = ({ imp }) => {
  const isUseSet = !!imp.insight_use;
  const isAudienceSet = !!imp.insight_audience;
  const isReady = isUseSet && isAudienceSet;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl flex items-center">
            <Info className="w-5 h-5 mr-2" /> Insight Timer Preparation
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Insight Timer requires content to be categorized for meditation, sleep, or other wellness practices.
          </p>
          
          {/* Status Check */}
          <div className="p-4 border rounded-lg bg-muted/50 space-y-2">
            <div className="flex items-center justify-between">
                <h4 className="font-semibold flex items-center"><Clock className="w-4 h-4 mr-2" /> Primary Use:</h4>
                <Badge variant={isUseSet ? 'default' : 'destructive'}>
                    {isUseSet ? <CheckCircle className="w-3 h-3 mr-1" /> : <XCircle className="w-3 h-3 mr-1" />}
                    {imp.insight_use || 'Not Set'}
                </Badge>
            </div>
            <div className="flex items-center justify-between">
                <h4 className="font-semibold flex items-center"><Users className="w-4 h-4 mr-2" /> Target Audience:</h4>
                <Badge variant={isAudienceSet ? 'default' : 'destructive'}>
                    {isAudienceSet ? <CheckCircle className="w-3 h-3 mr-1" /> : <XCircle className="w-3 h-3 mr-1" />}
                    {imp.insight_audience || 'Not Set'}
                </Badge>
            </div>
            
            {!isReady && (
                <div className="pt-2 text-center">
                    <p className="text-sm text-red-600 dark:text-red-400 mb-2">
                        Required fields are missing. Click the Info icon next to the title to set them.
                    </p>
                    <Link to={`/improvisation/${imp.id}`}>
                        <Button size="sm" variant="destructive" className="w-full">
                            Set Metadata Now
                        </Button>
                    </Link>
                </div>
            )}
          </div>

          {/* Description Generator */}
          <InsightTimerDescriptionGenerator improvisationId={imp.id} />

          <div className="space-y-2 pt-4">
            <h4 className="font-semibold flex items-center"><BookOpen className="w-4 h-4 mr-2" /> Suggested Title</h4>
            <p className="text-lg font-mono bg-muted p-2 rounded">{imp.generated_name || 'Awaiting Analysis'}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default InsightTimerTab;