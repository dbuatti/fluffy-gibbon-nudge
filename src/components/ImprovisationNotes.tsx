import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Save, Loader2, NotebookText, Check, Lock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError } from '@/utils/toast';
import { cn } from '@/lib/utils';

interface NoteTab {
  id: string;
  title: string;
  color: string;
  content: string;
}

interface ImprovisationNotesProps {
  improvisationId: string; // Renamed prop
  initialNotes: NoteTab[] | null;
  hasAudioFile: boolean;
}

// Updated color definitions for a cleaner, more defined look
const defaultNotes: NoteTab[] = [
  { id: 'zone1', title: 'Zone 1: Structure (A-B-A, Verse/Chorus, etc.)', color: 'border-l-4 border-blue-500 bg-blue-50/50 dark:bg-blue-950/30', content: '' },
  { id: 'zone2', title: 'Zone 2: Mood/Vibe (Emotional intent, feeling, imagery)', color: 'border-l-4 border-purple-500 bg-purple-50/50 dark:bg-purple-950/30', content: '' },
  { id: 'zone3', title: 'Zone 3: Technical (Key, Tempo, Instrumentation, Mix notes)', color: 'border-l-4 border-yellow-500 bg-yellow-50/50 dark:bg-yellow-950/30', content: '' },
  { id: 'zone4', title: 'Zone 4: Next Steps (Single most actionable task)', color: 'border-l-4 border-red-500 bg-red-50/50 dark:bg-red-950/30', content: '' },
];

const ImprovisationNotes: React.FC<ImprovisationNotesProps> = ({ improvisationId, initialNotes, hasAudioFile }) => { // Renamed prop
  // Ensure we use the initial notes if they exist, otherwise use defaults
  const initialData = initialNotes && initialNotes.length === 4 ? initialNotes : defaultNotes;
  const [notes, setNotes] = useState<NoteTab[]>(initialData);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'unsaved'>('idle');

  // Debounced save function
  const saveNotes = useCallback(async (currentNotes: NoteTab[]) => {
    setSaveStatus('saving');
    try {
      const { error } = await supabase
        .from('improvisations') // Updated table name
        .update({ notes: currentNotes })
        .eq('id', improvisationId); // Updated variable

      if (error) throw error;

      setSaveStatus('saved');
      // Reset status after a short delay to show the checkmark
      setTimeout(() => setSaveStatus('idle'), 2000); 
    } catch (error) {
      console.error('Failed to save notes:', error);
      showError('Failed to autosave notes.');
      setSaveStatus('idle'); // Revert to idle on error
    }
  }, [improvisationId]); // Updated dependency


  // Effect to debounce saving whenever notes change
  useEffect(() => {
    // Check if notes have actually changed from the initial state or the last saved state
    const notesChanged = JSON.stringify(notes) !== JSON.stringify(initialNotes);

    if (saveStatus === 'saved') return; // Don't trigger debounce immediately after a successful save reset

    if (notesChanged) {
        // Set status to unsaved immediately when notes change
        if (saveStatus !== 'saving') {
            setSaveStatus('unsaved');
        }

        const handler = setTimeout(() => {
            saveNotes(notes);
        }, 1500); // 1.5 second debounce

        return () => {
            clearTimeout(handler);
        };
    } else {
        // If notes haven't changed back to initial state, set to idle
        setSaveStatus('idle');
    }
    
    return () => {}; // Cleanup for the effect if no timeout was set
  }, [notes, saveNotes, initialNotes, saveStatus]);


  const handleContentChange = (id: string, value: string) => {
    // Set status to unsaved immediately when typing starts
    setSaveStatus('unsaved'); 
    setNotes(prevNotes => 
      prevNotes.map(note => 
        note.id === id ? { ...note, content: value } : note
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
      case 'unsaved':
        return (
            <span className="flex items-center text-orange-600 dark:text-orange-400 text-sm">
                Unsaved changes...
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
  
  return (
    <Card id="improvisation-notes" className="shadow-lg dark:shadow-xl">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center text-xl">
          <NotebookText className="w-5 h-5 mr-2 text-primary" /> Creative Notes Workspace
        </CardTitle>
        {renderSaveStatus()}
      </CardHeader>
      <CardContent className="space-y-6">
        {notes.map((note) => {
          
          return (
            <div key={note.id} className={cn("p-4 rounded-lg border border-border shadow-inner-lg", note.color)}>
              <h4 className="font-semibold mb-2 text-lg">{note.title}</h4>
              
              {note.id === 'zone4' ? (
                  <>
                      <Input
                          placeholder="The single most important next task (10-15 words)"
                          value={note.content}
                          onChange={(e) => handleContentChange(note.id, e.target.value)}
                          maxLength={100}
                          className="bg-background/80 dark:bg-card/80 border-gray-300 dark:border-gray-700 focus:border-primary"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                          Focus: What is the single, most actionable task to move this idea forward?
                      </p>
                  </>
              ) : (
                  <Textarea
                      placeholder={`Jot down your thoughts for ${note.title.split(': ')[1].toLowerCase()} here...`}
                      value={note.content}
                      onChange={(e) => handleContentChange(note.id, e.target.value)}
                      rows={5}
                      className="min-h-[150px] bg-background/80 dark:bg-card/80 border-gray-300 dark:border-gray-700 focus:border-primary"
                  />
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
};

export default ImprovisationNotes;