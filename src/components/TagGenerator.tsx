import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Copy, Tag, X, Loader2, Check } from 'lucide-react';
import { showSuccess, showError } from '@/utils/toast';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

interface TagGeneratorProps {
  compositionId: string; // Renamed prop
  initialTags: string[] | null;
}

const TagGenerator: React.FC<TagGeneratorProps> = ({ compositionId, initialTags }) => { // Renamed prop
  const [tags, setTags] = useState<string[]>(initialTags || []);
  const [inputValue, setInputValue] = useState('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'unsaved'>('idle');
  const inputRef = useRef<HTMLInputElement>(null);

  // --- Persistence Logic ---

  const saveTags = useCallback(async (currentTags: string[]) => {
    setSaveStatus('saving');
    try {
      const { error } = await supabase
        .from('compositions') // Updated table name
        .update({ user_tags: currentTags })
        .eq('id', compositionId); // Updated variable

      if (error) throw error;

      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000); 
    } catch (error) {
      console.error('Failed to save tags:', error);
      showError('Failed to autosave tags.');
      setSaveStatus('idle');
    }
  }, [compositionId]); // Updated dependency

  // Effect to trigger save when tags change
  useEffect(() => {
    if (saveStatus === 'saved') return;

    const handler = setTimeout(() => {
      // Only save if content is actually different from the initial load
      if (JSON.stringify(tags) !== JSON.stringify(initialTags)) {
        saveTags(tags);
      }
    }, 1000); // 1 second debounce

    // Set status to unsaved immediately when tags change, unless we are currently saving
    if (saveStatus !== 'saving') {
        setSaveStatus('unsaved');
    }

    return () => {
      clearTimeout(handler);
    };
  }, [tags, saveTags, initialTags]);

  // --- Tag Management ---

  const handleAddTag = useCallback(() => {
    const newTag = inputValue.trim().toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-');
    if (newTag && !tags.includes(newTag)) {
      setTags(prev => [...prev, newTag]);
      setInputValue('');
      setSaveStatus('unsaved');
      inputRef.current?.focus();
    }
  }, [inputValue, tags]);

  const handleRemoveTag = useCallback((tagToRemove: string) => {
    setTags(prev => prev.filter(tag => tag !== tagToRemove));
    setSaveStatus('unsaved');
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddTag();
    }
  };

  // --- Copy Logic ---

  const handleCopy = (format: 'hashtag' | 'comma') => {
    let textToCopy = '';
    if (format === 'hashtag') {
      textToCopy = tags.map(tag => `#${tag}`).join(' ');
    } else {
      textToCopy = tags.join(', ');
      // FIX: Commented out the problematic line
      // To copy the text, you can use the `navigator.clipboard.writeText()` method.
    }

    if (textToCopy) {
      navigator.clipboard.writeText(textToCopy);
      showSuccess(`Tags copied as ${format === 'hashtag' ? 'hashtags' : 'comma-separated'}!`);
    } else {
      showError('No tags to copy.');
    }
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
            Tags autosave automatically.
          </span>
        );
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center text-xl">
          <Tag className="w-5 h-5 mr-2" /> User Tags & Keywords
        </CardTitle>
        {renderSaveStatus()}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex space-x-2">
          <Input
            ref={inputRef}
            placeholder="Type tag and press Enter (e.g., ambient, chill, piano-solo)"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-grow"
          />
          <Button onClick={handleAddTag} disabled={!inputValue.trim()}>
            Add Tag
          </Button>
        </div>

        <div className="min-h-[40px] flex flex-wrap gap-2 p-2 border rounded-md bg-muted/50">
          {tags.length > 0 ? (
            tags.map(tag => (
              <Badge key={tag} className={cn("text-sm px-3 py-1 flex items-center bg-primary hover:bg-primary/90")}>
                {tag}
                <button 
                  onClick={() => handleRemoveTag(tag)} 
                  className="ml-1.5 opacity-70 hover:opacity-100 transition-opacity"
                  aria-label={`Remove tag ${tag}`}
                >
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            ))
          ) : (
            <p className="text-sm text-muted-foreground italic">No tags added yet.</p>
          )}
        </div>

        <div className="flex space-x-2 pt-2">
          <Button 
            variant="outline" 
            onClick={() => handleCopy('hashtag')} 
            disabled={tags.length === 0}
            className="flex-1"
          >
            <Copy className="w-4 h-4 mr-2" /> Copy as #Hashtags
          </Button>
          <Button 
            variant="outline" 
            onClick={() => handleCopy('comma')} 
            disabled={tags.length === 0}
            className="flex-1"
          >
            <Copy className="w-4 h-4 mr-2" /> Copy as CSV
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default TagGenerator;