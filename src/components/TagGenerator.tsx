import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { X, Sparkles, Copy, Loader2 } from 'lucide-react';
import { showSuccess, showError } from '@/utils/toast';
import { supabase } from '@/integrations/supabase/client'; // Assuming supabase client is imported directly
import { useSession } from '@/integrations/supabase/session-context';

interface TagGeneratorProps {
  compositionId: string;
  initialTags: string[];
  onTagsUpdate: (tags: string[]) => void;
  generatedName: string;
  primaryGenre: string;
  secondaryGenre: string | null;
  mood: string;
}

const TagGenerator: React.FC<TagGeneratorProps> = ({
  compositionId,
  initialTags,
  onTagsUpdate,
  generatedName,
  primaryGenre,
  secondaryGenre,
  mood,
}) => {
  const [tags, setTags] = useState<string[]>(initialTags);
  const [inputValue, setInputValue] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const { session } = useSession();

  useEffect(() => {
    setTags(initialTags);
  }, [initialTags]);

  const handleAddTag = () => {
    if (inputValue.trim() && !tags.includes(inputValue.trim())) {
      const newTags = [...tags, inputValue.trim()];
      setTags(newTags);
      onTagsUpdate(newTags);
      setInputValue('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    const newTags = tags.filter((tag) => tag !== tagToRemove);
    setTags(newTags);
    onTagsUpdate(newTags);
  };

  const handleGenerateTags = async () => {
    if (!session?.user) {
      showError("You must be logged in to generate tags.");
      return;
    }

    setIsGenerating(true);
    showSuccess("Generating tags with AI...");

    try {
      const { data, error } = await supabase.functions.invoke('generate-tags', {
        body: JSON.stringify({
          compositionId,
          generatedName,
          primaryGenre,
          secondaryGenre,
          mood,
        }),
      });

      if (error) {
        throw new Error(error.message);
      }

      if (data && data.tags) {
        const newTags = Array.from(new Set([...tags, ...data.tags])); // Merge and deduplicate
        setTags(newTags);
        onTagsUpdate(newTags);
        showSuccess("Tags generated successfully!");
      } else {
        showError("AI did not return any tags.");
      }
    } catch (err) {
      console.error('Error generating tags:', err);
      showError(`Failed to generate tags: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopyTags = () => {
    const textToCopy = tags.join(', ');
    if (textToCopy) {
      navigator.clipboard.writeText(textToCopy)
        .then(() => showSuccess("Tags copied to clipboard!"))
        .catch((err) => showError("Failed to copy tags."));
    } else {
      showError("No tags to copy.");
    }
  };

  return (
    <Card className="shadow-card-light dark:shadow-card-dark">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-xl font-semibold">Tags</CardTitle>
        <div className="flex space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleGenerateTags}
            disabled={isGenerating}
          >
            {isGenerating ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4 mr-2" />
            )}
            Generate with AI
          </Button>
          <Button variant="outline" size="sm" onClick={handleCopyTags}>
            <Copy className="h-4 w-4 mr-2" /> Copy All
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2 mb-4">
          {tags.map((tag) => (
            <Badge key={tag} variant="secondary" className="pr-1">
              {tag}
              <X
                className="ml-1 h-3 w-3 cursor-pointer hover:text-destructive"
                onClick={() => handleRemoveTag(tag)}
              />
            </Badge>
          ))}
        </div>
        <div className="flex space-x-2">
          <Input
            placeholder="Add a tag..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === 'Enter') {
                handleAddTag();
              }
            }}
          />
          <Button onClick={handleAddTag}>Add</Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default TagGenerator;