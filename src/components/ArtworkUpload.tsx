import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Upload, Loader2, Image as ImageIcon, XCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { useSession } from '@/integrations/supabase/session-context';
import { cn } from '@/lib/utils';

interface ArtworkUploadProps {
  improvisationId: string;
  onUploadSuccess: (newArtworkUrl: string) => void;
  currentArtworkUrl: string | null;
}

// Max file size: 5 MB (5 * 1024 * 1024 bytes)
const MAX_FILE_SIZE_BYTES = 5242880; 

const ArtworkUpload: React.FC<ArtworkUploadProps> = ({ improvisationId, onUploadSuccess, currentArtworkUrl }) => {
  const { session } = useSession();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    const acceptedMimeTypes = ['image/jpeg', 'image/png'];
    
    if (!selectedFile) {
        setFile(null);
        return;
    }

    if (!acceptedMimeTypes.includes(selectedFile.type)) {
      setFile(null);
      showError('Please select a valid JPG or PNG image file.');
      return;
    }

    if (selectedFile.size > MAX_FILE_SIZE_BYTES) {
        setFile(null);
        showError('File size exceeds the 5MB limit. Please compress or use a smaller file.');
        return;
    }

    setFile(selectedFile);
  };

  const handleUpload = async () => {
    if (!file || !session) {
        showError("Please select a file and ensure you are signed in.");
        return;
    }

    setIsUploading(true);

    const user = session.user;
    const fileExtension = file.name.split('.').pop();
    // Path format: user_id/artwork/improvisation_id.ext
    const filePath = `${user.id}/artwork/${improvisationId}.${fileExtension}`;
    const bucketName = 'piano_improvisations';

    try {
      // 1. Upload file to Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from(bucketName)
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: true, // Use upsert to replace existing artwork for this improvisation
        });

      if (uploadError) throw uploadError;

      // 2. Get the public URL of the uploaded file
      const { data: publicUrlData } = supabase.storage.from(bucketName).getPublicUrl(filePath);
      const newArtworkUrl = publicUrlData.publicUrl;

      // 3. Update the existing improvisation record with the new artwork_url
      const { error: dbError } = await supabase
        .from('improvisations')
        .update({ artwork_url: newArtworkUrl })
        .eq('id', improvisationId);

      if (dbError) {
        // If DB update fails, consider deleting the uploaded file to prevent orphaned files
        await supabase.storage.from(bucketName).remove([filePath]);
        throw dbError;
      }
      
      showSuccess('Artwork uploaded and linked successfully!');
      setFile(null); // Clear selected file
      onUploadSuccess(newArtworkUrl); // Notify parent component with the new URL

    } catch (error) {
      console.error('Artwork upload failed:', error);
      showError(`Failed to upload artwork: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsUploading(false);
    }
  };

  const handleClearSelectedFile = () => {
    setFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = ''; // Clear the file input visually
    }
  };

  return (
    <div className="p-4 border rounded-lg bg-yellow-50/50 dark:bg-yellow-950/50 space-y-3">
        <h3 className="text-lg font-semibold flex items-center text-yellow-700 dark:text-yellow-300">
            <Upload className="h-5 w-5 mr-2" /> Manual Artwork Upload
        </h3>
        <p className="text-sm text-muted-foreground">
            If you have custom artwork, upload it here. This will override any AI-generated artwork.
            (JPG/PNG, Max 5MB, 3000x3000 recommended)
        </p>
        
        <Input 
            id="artwork-file-attach" 
            type="file" 
            accept=".jpg, .jpeg, .png" 
            onChange={handleFileChange} 
            disabled={isUploading}
            ref={fileInputRef}
            className="hidden" // Hide the default input
        />
        
        {!file ? (
            <Button 
                onClick={() => fileInputRef.current?.click()} 
                variant="outline" 
                className="w-full h-10 border-dashed border-2"
                disabled={isUploading}
            >
                <ImageIcon className="mr-2 h-4 w-4" /> Choose JPG or PNG File
            </Button>
        ) : (
            <div className="flex items-center space-x-2">
                <p className="text-sm text-muted-foreground flex-grow truncate">
                    Selected: <span className="font-semibold text-primary">{file.name}</span> ({(file.size / 1024 / 1024).toFixed(2)} MB)
                </p>
                <Button 
                    onClick={handleClearSelectedFile} 
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    title="Clear selected file"
                >
                    <XCircle className="h-4 w-4" />
                </Button>
            </div>
        )}

        <Button 
            onClick={handleUpload} 
            disabled={isUploading || !file} 
            className="w-full"
        >
            {isUploading ? (
                <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Uploading Artwork...
                </>
            ) : (
                <>
                    <Upload className="mr-2 h-4 w-4" />
                    Upload Custom Artwork
                </>
            )}
        </Button>
    </div>
  );
};

export default ArtworkUpload;