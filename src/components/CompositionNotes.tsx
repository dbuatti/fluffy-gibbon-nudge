import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input'; // Import Input for Zone 4
import { Save, Loader2, NotebookText, Check } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError } from '@/utils/toast';
import { cn } from '@/lib/utils';

interface NoteTab {
  id: string;
  title: string;
  color: string;
  content: string;
}

interface CompositionNotesProps {
  improvisationId: string;
  initialNotes: NoteTab[] | null;
  hasAudioFile: boolean; // New prop for scoping
}

const defaultNotes: NoteTab[] = [
  { id: 'zone1', title: 'Zone 1: Structure', color: 'bg-blue-100 dark:bg-blue-950', content: '' },
  { id: 'zone2', title: 'Zone 2: Mood/Vibe', color: 'bg-green-100 dark:bg-green-950', content: '' },
  { id: 'zone3', title: 'Zone 3: Technical', color: 'bg-yellow-100 dark:bg-yellow-950', content: '' },
  { id: 'zone4', title: 'Zone 4: Next Steps', color: 'bg-red-100 dark:bg-red-950', content: '' },
];

const CompositionNotes: React.FC<CompositionNotesProps> = ({ improvisationId, initialNotes, hasAudioFile }) => {
  // Ensure we use the initial notes if they exist, otherwise use defaults
  const initialData = initialNotes && initialNotes.length === 4 ? initialNotes : defaultNotes;
  const [notes, setNotes] = useState<NoteTab[]>(initialData);
  const [activeTab, setActiveTab] = useState(notes[0].id);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  // Debounced save function
  const saveNotes = useCallback(async (currentNotes: NoteTab[]) => {
    setSaveStatus('saving');
    try {
      const { error } = await supabase
        .from('improvisations')
        .update({ notes: currentNotes })
        .eq('id', improvisationId);

      if (error) throw error;

      setSaveStatus('saved');
      // Reset status after a short delay to show the checkmark
      setTimeout(() => setSaveStatus('idle'), 2000); 
    } catch (error) {
      console.error('Failed to save notes:', error);
      showError('Failed to autosave notes.');
      setSaveStatus('idle'); // Revert to idle on error
    }
  }, [improvisationId]);

  // Effect to debounce saving whenever notes change
  useEffect(() => {
    if (saveStatus === 'saved') return; // Don't trigger debounce immediately after a successful save reset

    const handler = setTimeout(() => {
      // Only save if content is actually different from the initial load (or if we just started typing)
      if (JSON.stringify(notes) !== JSON.stringify(initialNotes)) {
        saveNotes(notes);
      }
    }, 1500); // 1.5 second debounce

    return () => {
      clearTimeout(handler);
    };
  }, [notes, saveNotes, initialNotes]);


  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    setSaveStatus('idle'); // Indicate typing started
    setNotes(prevNotes => 
      prevNotes.map(note => 
        note.id === activeTab ? { ...note, content: e.target.value } : note
      )
    );
  };

  const renderSaveStatus = () => {
    switch (saveStatus) {
      case 'saving':
        return (
          <span className="flex items-center text-yellow-600 dark:text-yellow-400 text-sm">
            <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Autosaving...
          </span>
        );
      case 'saved':
        return (
          <span className="flex items-center text-green-600 dark:text-green-400 text-sm">
            <Check className="h-4 w-4 mr-2" /> Saved
          </span>
        );
      case 'idle':
      default:
        return (
          <span className="text-sm text-muted-foreground">
            Notes autosave automatically.
          </span>
        );
    }
  };
  
  // If the active tab is now hidden, switch to the first visible tab
  useEffect(() => {
      const isLocked = !hasAudioFile && (activeTab === 'zone3' || activeTab === 'zone4');
      if (isLocked) {
          setActiveTab('zone1');
      }
  }, [hasAudioFile, activeTab]);


  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center text-xl">
          <NotebookText className="w-5 h-5 mr-2" /> Creative Notes
        </CardTitle>
        {renderSaveStatus()}
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4 h-auto p-0">
            {notes.map((note) => {
                const isLocked = !hasAudioFile && (note.id === 'zone3' || note.id === 'zone4');
                return (
                    <TabsTrigger 
                        key={note.id} 
                        value={note.id} 
                        className={cn(
                            "py-2 text-xs md:text-sm transition-all",
                            note.color,
                            activeTab === note.id ? "shadow-md" : "opacity-70 hover:opacity-100",
                            isLocked && "opacity-30 cursor-not-allowed"
                        )}
                        disabled={isLocked}
                    >
                        {note.title.split(':')[0]}
                    </TabsTrigger>
                );
            })}
          </TabsList>
          
          {notes.map((note) => {
            const isLocked = !hasAudioFile && (note.id === 'zone3' || note.id === 'zone4');
            
            // Only render content for the active tab
            if (activeTab !== note.id) return null;

            return (
              <TabsContent key={note.id} value={note.id} className="mt-4">
                <div className={cn("p-4 rounded-lg border", note.color)}>
                  <h4 className="font-semibold mb-2">{note.title}</h4>
                  
                  {isLocked ? (
                      <div className="text-center p-10 bg-white/50 dark:bg-gray-900/50 rounded-md border-dashed border-2 border-gray-400 dark:border-gray-600">
                          <Loader2 className="h-6 w-6 mx-auto mb-2 animate-spin text-muted-foreground" />
                          <p className="text-muted-foreground">
                              Attach the audio file first to unlock technical analysis and next steps.
                          </p>
                      </div>
                  ) : note.id === 'zone4' ? (
                      <>
                          <Input
                              placeholder="The single most important next task (10-15 words)"
                              value={note.content}
                              onChange={handleContentChange}
                              maxLength={100} // Enforce short length
                              className="bg-white/50 dark:bg-gray-900/50 border-gray-300 dark:border-gray-700"
                          />
                          <p className="text-xs text-muted-foreground mt-1">
                              Focus: What is the single, most actionable task to move this idea forward?
                          </p>
                      </>
                  ) : (
                      <Textarea
                          placeholder={`Jot down your thoughts for ${note.title.toLowerCase()} here...`}
                          value={note.content}
                          onChange={handleContentChange}
                          rows={10}
                          className="min-h-[200px] bg-white/50 dark:bg-gray-900/50 border-gray-300 dark:border-gray-700"
                      />
                  )}
                </div>
              </TabsContent>
            );
          })}
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default CompositionNotes;