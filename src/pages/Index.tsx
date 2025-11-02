import { MadeWithDyad } from "@/components/made-with-dyad";
import FileUploadForm from "@/components/FileUploadForm";
import ImprovisationList from "@/components/ImprovisationList";
import { useQueryClient } from "@tanstack/react-query";

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
          Piano Improvisation Analyzer
        </h1>
        <p className="text-center text-lg text-gray-600 dark:text-gray-400 mt-2">
          Upload your MP3/M4A files to generate unique names based on musical analysis.
        </p>
      </header>
      
      <main className="max-w-4xl mx-auto space-y-8">
        <FileUploadForm onUploadSuccess={handleUploadSuccess} />
        <ImprovisationList />
      </main>

      <MadeWithDyad />
    </div>
  );
};

export default Index;