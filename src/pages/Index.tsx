import { MadeWithDyad } from "@/components/made-with-dyad";
import FileUploadForm from "@/components/FileUploadForm";
import ImprovisationList from "@/components/ImprovisationList";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ExternalLink, Music, Clock } from "lucide-react";

const DISTROKID_URL = "https://distrokid.com/new/";
const INSIGHT_TIMER_URL = "https://teacher.insighttimer.com/tracks/create?type=audio";

const Index = () => {
  const queryClient = useQueryClient();

  const handleUploadSuccess = () => {
    // Invalidate the query cache to force ImprovisationList to refetch
    queryClient.invalidateQueries({ queryKey: ['improvisations'] });
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 md:p-8">
      <header className="mb-8">
        <h1 className="text-4xl font-extrabold text-center text-gray-900 dark:text-white">
          Composition & Analysis Tracker
        </h1>
        <p className="text-center text-lg text-gray-600 dark:text-gray-400 mt-2">
          Upload your audio files to generate metadata and prepare for distribution.
        </p>
      </header>
      
      <main className="max-w-4xl mx-auto space-y-8">
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <a href={DISTROKID_URL} target="_blank" rel="noopener noreferrer">
            <Button variant="default" className="w-full sm:w-auto">
              <Music className="w-4 h-4 mr-2" /> Upload New DistroKid Song <ExternalLink className="w-4 h-4 ml-2" />
            </Button>
          </a>
          <a href={INSIGHT_TIMER_URL} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" className="w-full sm:w-auto">
              <Clock className="w-4 h-4 mr-2" /> New Track for Insight Timer <ExternalLink className="w-4 h-4 ml-2" />
            </Button>
          </a>
        </div>

        <FileUploadForm onUploadSuccess={handleUploadSuccess} />
        <ImprovisationList />
      </main>

      <MadeWithDyad />
    </div>
  );
};

export default Index;