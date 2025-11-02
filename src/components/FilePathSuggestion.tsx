import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Copy, FolderOpen } from 'lucide-react';
import { showSuccess, showError } from '@/utils/toast';

interface FilePathSuggestionProps {
  generatedName: string | null;
  primaryGenre: string | null;
  isCompleted: boolean;
}

const FilePathSuggestion: React.FC<FilePathSuggestionProps> = ({ generatedName, primaryGenre, isCompleted }) => {
  
  if (!isCompleted) {
    return null;
  }

  const cleanName = generatedName?.replace(/[^a-zA-Z0-9\s-]/g, '').trim().replace(/\s+/g, '_') || 'Untitled_Composition';
  const genre = primaryGenre || 'Uncategorized';
  const year = new Date().getFullYear();

  // Example path structure: [Genre]/[Year]/[Generated Name].mp3
  const suggestedPath = `${genre}/${year}/${cleanName}.mp3`;

  const handleCopy = () => {
    if (suggestedPath) {
      navigator.clipboard.writeText(suggestedPath);
      showSuccess('Suggested file path copied to clipboard!');
    } else {
      showError('Cannot generate file path yet.');
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center text-xl">
          <FolderOpen className="w-5 h-5 mr-2 text-blue-500" /> Local Folder Organization
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Use this path to organize your audio file on your computer.
        </p>
        <div className="flex space-x-2">
          <Input 
            type="text" 
            value={suggestedPath} 
            readOnly 
            className="flex-grow font-mono text-sm bg-muted"
          />
          <Button size="icon" onClick={handleCopy} title="Copy Path">
            <Copy className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default FilePathSuggestion;