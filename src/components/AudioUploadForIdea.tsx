import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Upload, Loader2, Music } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useSession } from '@/integrations/supabase/session-context';
import { showError, showSuccess } from '@/utils/toast';

interface AudioUploadForIdeaProps {
  compositionId: string; // Renamed prop
  isCompositionTypeImprovisation: boolean; // Renamed prop
  onUploadSuccess: () => void;
}

// Max file size: 250 MB (250 * 1024 * 1024 bytes)
const MAX_FILE_SIZE_BYTES = 262144000; 

const AudioUploadForIdea: React.FC<AudioUploadForIdeaProps> = ({ compositionId, isCompositionTypeImprovisation, onUploadSuccess }) => { // Renamed props
  const { session } = useSession();
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    const acceptedMimeTypes = ['audio/mpeg', 'audio/mp4', 'audio/x-m4a'];
    
    if (!selectedFile) {
        setFile(null);
        return;
    }

    if (!acceptedMimeTypes.includes(selectedFile.type)) {
      setFile(null);
      showError('Please select a valid MP3 or M4A audio file.');
      return;
    }

    if (selectedFile.size > MAX_FILE_SIZE_BYTES) {
        setFile(null);
        showError('File size exceeds the 250MB limit. Please compress or use a smaller file.');
        return;
    }

    setFile(selectedFile);
  };

  const handleUpload = async () => {
    if (!file || !session) return;

    setIsUploading(true);

    const user = session.user;
    const fileExtension = file.name.split('.').pop();
    // Path format: user_id/timestamp.ext
    const filePath = `${user.id}/${Date.now()}.${fileExtension}`;
    const bucketName = 'audio_compositions'; // Updated bucket name

    try {
      // 1. Upload file to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from(bucketName)
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) throw uploadError;

      // 2. Update the existing database record with file details and set status to analyzing
      // NOTE: We still use 'analyzing' status here to trigger the title/artwork generation in the background.
      const { error: dbError } = await supabase
        .from('compositions') // Updated table name
        .update({
          file_name: file.name,
          storage_path: filePath,
          status: 'analyzing', // Use 'analyzing' to trigger background title/artwork generation
        })
        .eq('id', compositionId); // Updated variable

      if (dbError) {
        // If DB update fails, try to clean up the uploaded file
        await supabase.storage.from(bucketName).remove([filePath]);
        throw dbError;
      }
      
      // 3. Trigger the analysis Edge Function (now only handles title/artwork generation)
      const { error: functionError } = await supabase.functions.invoke('analyze-improvisation', {
        body: {
          compositionId: compositionId, // Updated parameter name
          storagePath: filePath,
          fileName: file.name,
          isImprovisation: isCompositionTypeImprovisation, // Updated parameter name
        },
      });

      if (functionError) {
        console.error('Failed to invoke analysis function:', functionError);
        showError('File uploaded, but failed to start background processing.');
      } else {
        showSuccess(`Audio file attached and background processing started!`);
      }
      
      setFile(null);
      onUploadSuccess(); // Notify parent component to refetch details

    } catch (error) {
      console.error('Upload failed:', error);
      showError(`Failed to upload file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center text-xl">
            <Music className="h-5 w-5 mr-2" /> Attach Audio File
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Input 
          id="audio-file-attach" 
          type="file" 
          accept=".mp3, .m4a" 
          onChange={handleFileChange} 
          disabled={isUploading}
          ref={fileInputRef}
          className="hidden"
        />
        
        {!file && (
          <Button 
            onClick={() => fileInputRef.current?.click()} 
            variant="outline" 
            className="w-full h-12 border-dashed border-2"
            disabled={isUploading}
          >
            <Upload className="mr-2 h-4 w-4" /> Select MP3 or M4A File (Max 250MB)
          </Button>
        )}

        {file && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Selected: <span className="font-semibold text-primary">{file.name}</span> ({(file.size / 1024 / 1024).toFixed(2)} MB)
            </p>
            <Button 
              onClick={handleUpload} 
              disabled={isUploading} 
              className="w-full"
            >
              {isUploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Uploading & Processing...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Upload File & Start Background Processing
                </>
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default AudioUploadForIdea;