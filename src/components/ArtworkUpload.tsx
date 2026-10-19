import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Upload, Loader2, Image as ImageIcon, XCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { upscaleToMinSize, toSquareExport, RELEASE_EXPORT_SIZE } from '@/lib/image-compliance';
import { useSession } from '@/integrations/supabase/session-context';

interface ArtworkUploadProps {
  improvisationId: string;
  onUploadSuccess: (newArtworkUrl: string) => void;
  currentArtworkUrl: string | null;
}

// Max file size: 20 MB — matches Insight Timer's artwork limit
const MAX_FILE_SIZE_BYTES = 20971520; 

const ArtworkUpload: React.FC<ArtworkUploadProps> = ({ improvisationId, onUploadSuccess, currentArtworkUrl }) => {
  const { session } = useSession();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [prepareSquare, setPrepareSquare] = useState(true);

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
        showError('File size exceeds the 20MB limit. Please compress or use a smaller file.');
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
    // Path format: user_id/artwork/improvisation_id.ext
    // (extension finalized after the upscale step below, since upscaling
    //  re-encodes to JPEG)
    const filePath = `${user.id}/artwork/${improvisationId}.${file.name.split('.').pop() || 'jpg'}`;
    const bucketName = 'piano_improvisations';

    try {
      // 0. Guarantee release-platform minimums — Insight Timer rejects
      //    anything under 1600×1600, so small uploads are upscaled
      //    automatically. By default uploads also become a square
      //    3000×3000 JPEG, the shape every release platform expects.
      let blobToUpload: Blob = file;
      let uploadPath = filePath;
      try {
        if (prepareSquare) {
          blobToUpload = await toSquareExport(file, RELEASE_EXPORT_SIZE);
          uploadPath = `${user.id}/artwork/${improvisationId}.jpg`;
        } else {
          const upscaled = await upscaleToMinSize(file);
          if (upscaled !== file) {
            // Re-encoded to JPEG — make the extension match
            blobToUpload = upscaled;
            uploadPath = `${user.id}/artwork/${improvisationId}.jpg`;
          }
        }
      } catch {
        // If the image can't be decoded, upload as-is and let the server decide
      }

      // 1. Upload file to Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from(bucketName)
        .upload(uploadPath, blobToUpload, {
          cacheControl: '3600',
          upsert: true, // Use upsert to replace existing artwork for this improvisation
        });

      if (uploadError) throw uploadError;

      // 2. Get the public URL of the uploaded file
      const { data: publicUrlData } = supabase.storage.from(bucketName).getPublicUrl(uploadPath);
      const newArtworkUrl = publicUrlData.publicUrl;

      // 3. Update the existing improvisation record with the new artwork_url
      const { error: dbError } = await supabase
        .from('improvisations')
        .update({ artwork_url: newArtworkUrl })
        .eq('id', improvisationId);

      if (dbError) {
        // If DB update fails, consider deleting the uploaded file to prevent orphaned files
        await supabase.storage.from(bucketName).remove([uploadPath]);
        throw dbError;
      }
      
      showSuccess(
        blobToUpload !== file
          ? `Artwork uploaded — release-ready ${prepareSquare ? `${RELEASE_EXPORT_SIZE}×${RELEASE_EXPORT_SIZE}` : 'upscaled'} JPEG`
          : 'Artwork uploaded and linked successfully!',
      );
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
    <div className="p-4 border rounded-lg bg-warning/5 dark:bg-warning/10 border-warning/30 space-y-3">
        <h3 className="text-lg font-semibold flex items-center text-warning">
            <Upload className="h-5 w-5 mr-2" /> Manual Artwork Upload
        </h3>
        <p className="text-sm text-muted-foreground">
            If you have custom artwork, upload it here. This will override any AI-generated artwork.
            JPG/PNG, max 20 MB. Leave the release option on for a square 3000×3000 JPEG —
            the format Insight Timer and streaming platforms expect. Small images are upscaled automatically.
        </p>

        <label className="flex items-start gap-2 rounded-md border bg-background/60 p-2 text-sm cursor-pointer">
            <Checkbox
                checked={prepareSquare}
                onCheckedChange={(checked) => setPrepareSquare(checked === true)}
                disabled={isUploading}
                className="mt-0.5"
            />
            <span>
                <span className="font-medium">Prepare release art</span>
                <span className="block text-xs text-muted-foreground">
                    Centre-crop to a {RELEASE_EXPORT_SIZE}×{RELEASE_EXPORT_SIZE} square JPEG. Turn off to keep the original crop.
                </span>
            </span>
        </label>
        
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
                    aria-label="Clear selected file"
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