import React from 'react';
import { RefreshCw, Sparkles, Loader2, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import EditableField from './EditableField';
import ImprovisationMetadataDialog from './ImprovisationMetadataDialog';
import ImprovisationSettingsSheet from './ImprovisationSettingsSheet';
import { useTitleGenerator } from '@/hooks/useTitleGenerator';
import { useUpdateImprovisation } from '@/hooks/useUpdateImprovisation'; // Renamed hook
import { format } from 'date-fns';
import TitleBar from './TitleBar';

interface AnalysisData {
  simulated_key?: string;
  simulated_tempo?: number;
  mood?: string;
  [key: string]: any;
}

interface Improvisation { // Renamed interface
  id: string;
  generated_name: string | null;
  file_name: string | null;
  created_at: string;
  status: 'uploaded' | 'analyzing' | 'completed' | 'failed';
  is_ready_for_release: boolean | null;
  is_improvisation: boolean | null;
  is_piano: boolean | null;
  is_instrumental: boolean | null;
  is_original_song: boolean | null;
  has_explicit_lyrics: boolean | null;
  primary_genre: string | null;
  secondary_genre: string | null;
  analysis_data: AnalysisData | null;
  insight_content_type: string | null;
  insight_language: string | null;
  insight_primary_use: string | null;
  insight_audience_level: string | null;
  insight_audience_age: string[] | null;
  insight_voice: string | null;
}

interface ImprovisationHeaderProps {
  imp: Improvisation; // Updated prop name and type
  isCoreMetadataComplete: boolean;
  handleDelete: () => void;
  isDeleting: boolean;
  // Handlers passed down from parent
  handleUpdatePrimaryGenre: (v: string) => Promise<void>;
  handleUpdateSecondaryGenre: (v: string) => Promise<void>;
  handleUpdateAnalysisData: (key: keyof AnalysisData, newValue: string) => Promise<void>;
  handleUpdateIsImprovisation: (value: string) => Promise<void>;
  handleUpdateIsPiano: (checked: boolean) => Promise<void>;
  handleUpdateIsInstrumental: (checked: boolean) => Promise<void>;
  handleUpdateIsOriginalSong: (checked: boolean) => Promise<void>;
  handleUpdateHasExplicitLyrics: (checked: boolean) => Promise<void>;
  handleUpdateInsightContentType: (value: string) => Promise<void>;
  handleUpdateInsightLanguage: (value: string) => Promise<void>;
  handleUpdateInsightPrimaryUse: (value: string) => Promise<void>;
  handleUpdateInsightAudienceLevel: (value: string) => Promise<void>;
  handleUpdateInsightAudienceAge: (value: string[]) => Promise<void>;
  handleUpdateInsightVoice: (value: string) => Promise<void>;
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
  handleUpdateIsPiano,
  handleUpdateIsInstrumental,
  handleUpdateIsOriginalSong,
  handleUpdateHasExplicitLyrics,
  handleUpdateInsightContentType,
  handleUpdateInsightLanguage,
  handleUpdateInsightPrimaryUse,
  handleUpdateInsightAudienceLevel,
  handleUpdateInsightAudienceAge,
  handleUpdateInsightVoice,
}) => {
  const updateMutation = useUpdateImprovisation(imp.id); // Updated hook
  const handleUpdateName = (newName: string) => updateMutation.mutateAsync({ generated_name: newName });
  const { isGenerating, handleRandomGenerate, handleAIGenerate } = useTitleGenerator(imp.id, handleUpdateName);

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
        Created: {imp.created_at ? format(new Date(imp.created_at), 'MMM dd, yyyy HH:mm') : 'N/A'}
      </p>
    </div>
  );

  const actionButtons = (
    <>
      {isGenerating && (
        <Badge variant="secondary" className="flex items-center text-sm px-3 py-1 bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300">
          <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generating Title...
        </Badge>
      )}
      <Button
        onClick={handleRandomGenerate}
        size="icon"
        variant="outline"
        title="Generate Random Title"
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
        disabled={isGenerating || updateMutation.isPending}
        className="h-8 w-8"
      >
        <Sparkles className="h-4 w-4 text-purple-500" />
      </Button>
      <ImprovisationMetadataDialog
        imp={imp} // Updated prop name
        isPending={updateMutation.isPending}
        isCoreMetadataComplete={isCoreMetadataComplete}
        handleUpdatePrimaryGenre={handleUpdatePrimaryGenre}
        handleUpdateSecondaryGenre={handleUpdateSecondaryGenre}
        handleUpdateAnalysisData={handleUpdateAnalysisData}
        handleUpdateIsImprovisation={handleUpdateIsImprovisation}
        handleUpdateIsPiano={handleUpdateIsPiano}
        handleUpdateIsInstrumental={handleUpdateIsInstrumental}
        handleUpdateIsOriginalSong={handleUpdateIsOriginalSong}
        handleUpdateHasExplicitLyrics={handleUpdateHasExplicitLyrics}
        handleUpdateInsightContentType={handleUpdateInsightContentType}
        handleUpdateInsightLanguage={handleUpdateInsightLanguage}
        handleUpdateInsightPrimaryUse={handleUpdateInsightPrimaryUse}
        handleUpdateInsightAudienceLevel={handleUpdateInsightAudienceLevel}
        handleUpdateInsightAudienceAge={handleUpdateInsightAudienceAge}
        handleUpdateInsightVoice={handleUpdateInsightVoice}
      />
      <ImprovisationSettingsSheet
        improvisationId={imp.id} // Updated prop name
        improvisationName={imp.generated_name || imp.file_name || 'Untitled Idea'} // Updated prop name
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