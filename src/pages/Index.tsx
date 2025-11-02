import React from 'react';
import { MadeWithDyad } from "@/components/made-with-dyad";
import FileUploadForm, { FileUploadFormHandle } from "@/components/FileUploadForm";
import ImprovisationList from "@/components/ImprovisationList";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ExternalLink, Music, Clock } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import CompositionPipeline from "@/components/CompositionPipeline";
import QuickUploadButton from "@/components/QuickUploadButton"; // Import new button

const DISTROKID_URL = "https://distrokid.com/new/";
const INSIGHT_TIMER_URL = "https://teacher.insighttimer.com/tracks/create?type=audio";

const Index = () => {
  const queryClient = useQueryClient();
  const fileUploadRef = React.useRef<FileUploadFormHandle>(null);

  const handleUploadSuccess = () => {
    // Invalidate the query cache to force ImprovisationList to refetch
    queryClient.invalidateQueries({ queryKey: ['improvisations'] });
    queryClient.invalidateQueries({ queryKey: ['compositionStatusCounts'] }); // Invalidate pipeline count
  };
  
  const triggerQuickUpload = () => {
    fileUploadRef.current?.triggerFileInput();
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 md:p-8">
      <header className="mb-10">
        <h1 className="text-4xl font-extrabold text-center text-gray-900 dark:text-white tracking-tight">
          Composition & Analysis Hub
        </h1>
        <p className="text-center text-lg text-gray-600 dark:text-gray-400 mt-2 max-w-2xl mx-auto">
          Upload your audio files to generate AI-powered metadata and prepare your compositions for global distribution.
        </p>
      </header>
      
      <main className="max-w-5xl mx-auto space-y-10">
        
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          <CompositionPipeline /> {/* Pipeline on the left/top */}
          <QuickUploadButton onTriggerUpload={triggerQuickUpload} /> {/* Quick action on the right/bottom */}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <CardTitle className="flex items-center">
                <Music className="w-5 h-5 mr-2 text-primary" /> DistroKid
              </CardTitle>
              <CardDescription>
                Prepare your song metadata for streaming platforms like Spotify and Apple Music.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <a href={DISTROKID_URL} target="_blank" rel="noopener noreferrer">
                <Button variant="default" className="w-full">
                  Go to DistroKid Submission <ExternalLink className="w-4 h-4 ml-2" />
                </Button>
              </a>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <CardTitle className="flex items-center">
                <Clock className="w-5 h-5 mr-2 text-primary" /> Insight Timer
              </CardTitle>
              <CardDescription>
                Prepare your track details for meditation and wellness platforms.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <a href={INSIGHT_TIMER_URL} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" className="w-full">
                  Go to Insight Timer Track Upload <ExternalLink className="w-4 h-4 ml-2" />
                </Button>
              </a>
            </CardContent>
          </Card>
        </div>

        <FileUploadForm ref={fileUploadRef} onUploadSuccess={handleUploadSuccess} />
        <ImprovisationList />
      </main>

      <MadeWithDyad />
    </div>
  );
};

export default Index;