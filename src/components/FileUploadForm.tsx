import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Upload, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useSession } from '@/integrations/supabase/session-context';
import { showError, showSuccess } from '@/utils/toast';

interface FileUploadFormProps {
  onUploadSuccess: () => void;
}

const FileUploadForm: React.FC<FileUploadFormProps> = ({ onUploadSuccess }) => {
  const { session } = useSession();
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    // Check for MP3 (audio/mpeg) or M4A (audio/mp4)
    if (selectedFile && (selectedFile.type === 'audio/mpeg' || selectedFile.type === 'audio/mp4')) {
      setFile(selectedFile);
    } else {
      setFile(null);
      showError('Please select a valid MP3 or M4A audio file.');
    }
  };

  const handleUpload = async () => {
    if (!file || !session) return;

    setIsUploading(true);

    const user = session.user;
    const fileExtension = file.name.split('.').pop();
    // Path format: user_id/timestamp.ext
    const filePath = `${user.id}/${Date.now()}.${fileExtension}`;
    const bucketName = 'piano_improvisations';

    try {
      // 1. Upload file to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from(bucketName)
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) throw uploadError;

      // 2. Insert record into the database and get the new ID
      const { data: dbData, error: dbError } = await supabase
        .from('improvisations')
        .insert({
          user_id: user.id,
          file_name: file.name,
          storage_path: filePath,
          status: 'analyzing',
        })
        .select('id')
        .single();

      if (dbError || !dbData) {
        // If DB insertion fails, try to clean up the uploaded file
        await supabase.storage.from(bucketName).remove([filePath]);
        throw dbError || new Error("Failed to retrieve new improvisation ID.");
      }
      
      const improvisationId = dbData.id;

      // 3. Trigger the analysis Edge Function
      const { error: functionError } = await supabase.functions.invoke('analyze-improvisation', {
        body: {
          improvisationId: improvisationId,
          storagePath: filePath,
        },
      });

      if (functionError) {
        // If the function invocation fails, the status remains 'analyzing'
        console.error('Failed to invoke analysis function:', functionError);
        showError('File uploaded, but failed to start analysis process.');
      } else {
        showSuccess(`File "${file.name}" uploaded successfully and analysis started!`);
      }
      
      setFile(null);
      onUploadSuccess(); // Notify parent component to refresh list

    } catch (error) {
      console.error('Upload failed:', error);
      showError(`Failed to upload file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Card className="w-full max-w-lg mx-auto">
      <CardHeader>
        <CardTitle>Upload Improvisation</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Input 
          id="audio-file" 
          type="file" 
          accept=".mp3, .m4a" 
          onChange={handleFileChange} 
          disabled={isUploading}
        />
        {file && (
          <p className="text-sm text-muted-foreground">
            Selected: {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
          </p>
        )}
        <Button 
          onClick={handleUpload} 
          disabled={!file || isUploading} 
          className="w-full"
        >
          {isUploading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Analyzing...
            </>
          ) : (
            <>
              <Upload className="mr-2 h-4 w-4" />
              Start Analysis
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
};

export default FileUploadForm;