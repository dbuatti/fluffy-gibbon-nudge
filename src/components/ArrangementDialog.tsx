import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Loader2, Save, Link2, ListMusic, SlidersHorizontal, NotebookText } from 'lucide-react';
import { showError, showSuccess } from '@/utils/toast';
import { useSession } from '@/integrations/supabase/session-context';
import { supabase } from '@/integrations/supabase/client';
import type { Arrangement, ArrangementStatus } from '@/types/arrangement';
import { ARRANGEMENT_STATUS_OPTIONS } from '@/types/arrangement';

interface ArrangementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  arrangement: Arrangement | null;
  onSaved: () => void;
}

const STATUS_LABELS: Record<ArrangementStatus, string> = {
  draft: 'Draft',
  in_progress: 'In Progress',
  completed: 'Completed',
  archived: 'Archived',
};

const ArrangementDialog: React.FC<ArrangementDialogProps> = ({ open, onOpenChange, arrangement, onSaved }) => {
  const { session } = useSession();
  const [isSaving, setIsSaving] = useState(false);
  const [title, setTitle] = useState('');
  const [sourceTrack, setSourceTrack] = useState('');
  const [status, setStatus] = useState<ArrangementStatus>('in_progress');
  const [instrumentation, setInstrumentation] = useState('');
  const [key, setKey] = useState('');
  const [tempo, setTempo] = useState('');
  const [genre, setGenre] = useState('');
  const [notes, setNotes] = useState('');
  const [fileLinks, setFileLinks] = useState('');

  useEffect(() => {
    if (!open) return;
    setTitle(arrangement?.title || '');
    setSourceTrack(arrangement?.source_track || '');
    setStatus(arrangement?.status || 'in_progress');
    setInstrumentation(arrangement?.instrumentation || '');
    setKey(arrangement?.key || '');
    setTempo(arrangement?.tempo || '');
    setGenre(arrangement?.genre || '');
    setNotes(arrangement?.notes || '');
    setFileLinks(arrangement?.file_links?.join('\n') || '');
  }, [open, arrangement]);

  const handleSave = async () => {
    if (!session) {
      showError('You must be signed in to save an arrangement.');
      return;
    }
    if (!title.trim()) {
      showError('Please provide a title for the arrangement.');
      return;
    }

    setIsSaving(true);

    const payload = {
      title: title.trim(),
      source_track: sourceTrack.trim() || null,
      status,
      instrumentation: instrumentation.trim() || null,
      key: key.trim() || null,
      tempo: tempo.trim() || null,
      genre: genre.trim() || null,
      notes: notes.trim() || null,
      file_links: fileLinks.split('\n').map(l => l.trim()).filter(Boolean),
    };

    try {
      if (arrangement) {
        const { error } = await supabase
          .from('arrangements')
          .update(payload)
          .eq('id', arrangement.id);
        if (error) throw error;
        showSuccess(`Arrangement "${payload.title}" updated.`);
      } else {
        const { error } = await supabase
          .from('arrangements')
          .insert({ ...payload, user_id: session.user.id });
        if (error) throw error;
        showSuccess(`Arrangement "${payload.title}" created!`);
      }
      onOpenChange(false);
      onSaved();
    } catch (error) {
      console.error('Failed to save arrangement:', error);
      showError(`Failed to save arrangement: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{arrangement ? 'Edit Arrangement' : 'New Arrangement'}</DialogTitle>
          <DialogDescription>
            Track how you are reworking this piece for different ensembles or occasions.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="arr-title">Title</Label>
              <Input
                id="arr-title"
                placeholder="E.g., String Quartet Version"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={isSaving}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="arr-source">Source Track</Label>
              <Input
                id="arr-source"
                placeholder="E.g., Unspoken Lament"
                value={sourceTrack}
                onChange={(e) => setSourceTrack(e.target.value)}
                disabled={isSaving}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="arr-status">Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as ArrangementStatus)} disabled={isSaving}>
                <SelectTrigger id="arr-status" className="w-full">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  {ARRANGEMENT_STATUS_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="arr-key">Key</Label>
              <Input
                id="arr-key"
                placeholder="E.g., D minor"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                disabled={isSaving}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="arr-tempo">Tempo</Label>
              <Input
                id="arr-tempo"
                placeholder="E.g., 96 bpm"
                value={tempo}
                onChange={(e) => setTempo(e.target.value)}
                disabled={isSaving}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="arr-instrumentation" className="flex items-center">
                <ListMusic className="w-4 h-4 mr-1" /> Instrumentation / Ensemble
              </Label>
              <Input
                id="arr-instrumentation"
                placeholder="E.g., String quartet, Big band, Solo piano"
                value={instrumentation}
                onChange={(e) => setInstrumentation(e.target.value)}
                disabled={isSaving}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="arr-genre" className="flex items-center">
                <SlidersHorizontal className="w-4 h-4 mr-1" /> Genre
              </Label>
              <Input
                id="arr-genre"
                placeholder="E.g., Neoclassical"
                value={genre}
                onChange={(e) => setGenre(e.target.value)}
                disabled={isSaving}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="arr-notes" className="flex items-center">
              <NotebookText className="w-4 h-4 mr-1" /> Notes
            </Label>
            <Textarea
              id="arr-notes"
              placeholder="Arrangement choices, form changes, voicing decisions, next steps..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              className="min-h-[120px]"
              disabled={isSaving}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="arr-links" className="flex items-center">
              <Link2 className="w-4 h-4 mr-1" /> Audio / Score File Links
            </Label>
            <Textarea
              id="arr-links"
              placeholder={'One link per line. E.g.\nhttps://drive.google.com/.../score.pdf\nhttps://logic.cloud/.../mix.aif'}
              value={fileLinks}
              onChange={(e) => setFileLinks(e.target.value)}
              rows={3}
              className="min-h-[80px] font-mono text-xs"
              disabled={isSaving}
            />
            <p className="text-xs text-muted-foreground">Paste one URL per line for the audio file, score PDF, or project files.</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            {arrangement ? 'Save Changes' : 'Create Arrangement'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ArrangementDialog;