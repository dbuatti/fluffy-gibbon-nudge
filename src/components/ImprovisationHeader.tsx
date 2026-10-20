import React from 'react';
import { RefreshCw, Sparkles, Loader2, Palette, FolderOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import EditableField from './EditableField';
import ImprovisationMetadataDialog from './ImprovisationMetadataDialog';
import ImprovisationSettingsSheet from './ImprovisationSettingsSheet';
import { useTitleGenerator } from '@/hooks/useTitleGenerator';
import { useUpdateImprovisation } from '@/hooks/useUpdateImprovisation';
import { format } from 'date-fns';
import { displaySessionDate } from '@/lib/display-title';
import TitleBar from './TitleBar';
import FolderPathLine, { getSongFolderPath } from './FolderPathLine';
import { openFolderInFinder } from '@/lib/local-bridge';
import type { Improvisation, AnalysisData } from '@/types/improvisation';
import { useNavigate } from 'react-router-dom';

interface ImprovisationHeaderProps {
  imp: Improvisation;
  isCoreMetadataComplete: boolean;
  handleDelete: () => void;
  isDeleting: boolean;
  // Handlers passed down from parent
  handleUpdatePrimaryGenre: (v: string) => Promise<void>;
  handleUpdateSecondaryGenre: (v: string) => Promise<void>;
  handleUpdateAnalysisData: (key: keyof AnalysisData, newValue: string) => Promise<void>;
  handleUpdateIsImprovisation: (value: string) => Promise<void>;
}

const ImprovisationHeader: React.FC<ImprovisationHeaderProps> = ({
  imp,
  isCoreMetadataComplete,
  handleDelete,
  isDeleting,
  // Handlers
  handleUpdatePrimaryGenre,
  handleUpdateSecondaryGenre,
  handleUpdateAnalysisData,
  handleUpdateIsImprovisation,
}) => {
  const updateMutation = useUpdateImprovisation(imp.id);
  const navigate = useNavigate();
  const handleUpdateName = (newName: string) => updateMutation.mutateAsync({ generated_name: newName });
  const { isGenerating, handleRandomGenerate, handleAIGenerate } = useTitleGenerator(imp.id, handleUpdateName);
  const songFolderPath = getSongFolderPath(imp);

  const titleContent = (
    <div className="flex flex-col items-start">
      <div className="flex items-center space-x-2">
        {/* EDITABLE TITLE */}
        <EditableField
          value={imp.generated_name}
          label="Improvisation Title"
          onSave={handleUpdateName}
          className="text-3xl font-bold p-0"
          placeholder="Click to set title"
          disabled={isGenerating}
        />
      </div>
      <p className="text-sm text-muted-foreground mt-1">
        {imp.session_date ? `Session: ${imp.session_date}` : `Created: ${imp.created_at ? format(new Date(imp.created_at), 'MMM dd, yyyy HH:mm') : 'N/A'}`}
      </p>
      {/* Immutable link back to the local folder — always visible, even after renames */}
      <FolderPathLine imp={imp} full className="mt-0.5" />
    </div>
  );

  const actionButtons = (
    <>
      {isGenerating && (
        <Badge variant="secondary" className="flex items-center text-sm px-3 py-1 bg-primary/15 text-primary">
          <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generating Title...
        </Badge>
      )}
      <Button
        onClick={handleRandomGenerate}
        size="icon"
        variant="outline"
        title="Generate Random Title"
        aria-label="Generate Random Title"
        disabled={isGenerating || updateMutation.isPending}
        className="h-8 w-8"
      >
        <RefreshCw className="h-4 w-4" />
      </Button>
      <Button
        onClick={handleAIGenerate}
        size="icon"
        variant="outline"
        title="Generate AI Title (Based on Analysis & Notes)"
        aria-label="Generate AI Title"
        disabled={isGenerating || updateMutation.isPending}
        className="h-8 w-8"
      >
        <Sparkles className="h-4 w-4 text-violet-500" />
      </Button>
      <Button
        onClick={() => navigate('/generative-art?improvisationId=' + imp.id)}
        size="icon"
        variant="outline"
        title="Create Artwork for this improvisation"
        aria-label="Create Artwork"
        className="h-8 w-8"
      >
        <Palette className="h-4 w-4 text-pink-500" />
      </Button>
      {songFolderPath && (
        <Button
          onClick={() => openFolderInFinder(songFolderPath)}
          size="icon"
          variant="outline"
          title={`Open this song's folder in Finder\n${songFolderPath}`}
          aria-label="Open Folder in Finder"
          className="h-8 w-8"
        >
          <FolderOpen className="h-4 w-4 text-sky-500" />
        </Button>
      )}
      <ImprovisationMetadataDialog
        imp={imp}
        isPending={updateMutation.isPending}
        isCoreMetadataComplete={isCoreMetadataComplete}
        handleUpdatePrimaryGenre={handleUpdatePrimaryGenre}
        handleUpdateSecondaryGenre={handleUpdateSecondaryGenre}
        handleUpdateAnalysisData={handleUpdateAnalysisData}
        handleUpdateIsImprovisation={handleUpdateIsImprovisation}
      />
      <ImprovisationSettingsSheet
        improvisationId={imp.id}
        improvisationName={imp.generated_name || imp.file_name || 'Untitled Idea'}
        handleDelete={handleDelete}
        isDeleting={isDeleting}
      />
    </>
  );

  return (
    <TitleBar
      title={titleContent}
      backLink="/"
      actions={actionButtons}
      className="mb-0"
    />
  );
};

export default ImprovisationHeader;