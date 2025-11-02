import React, { useState, useCallback } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import EditableField from './EditableField';
import { cn } from '@/lib/utils';

interface GenreSelectProps {
  value: string | null | undefined;
  label: string;
  onSave: (newValue: string) => Promise<void>;
  placeholder?: string;
}

const COMMON_GENRES = [
  "Ambient", "Classical", "Jazz", "New Age", "Electronic", 
  "Folk", "Soundtrack", "Pop", "Rock", "Hip Hop/Rap", "Experimental"
];

const GenreSelect: React.FC<GenreSelectProps> = ({ value, label, onSave, placeholder = 'Select or type a genre' }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [selectValue, setSelectValue] = useState(value || '');

  // Determine if the current value is a common genre
  const isCommonGenre = COMMON_GENRES.includes(value || '');

  const handleSelectChange = useCallback(async (newValue: string) => {
    if (newValue === 'custom') {
      // Switch to editable mode
      setIsEditing(true);
      setSelectValue(value || ''); // Keep current value if switching from a custom one
    } else {
      setSelectValue(newValue);
      await onSave(newValue);
    }
  }, [value, onSave]);

  const handleEditableSave = useCallback(async (newValue: string) => {
    await onSave(newValue);
    setIsEditing(false);
    setSelectValue(newValue);
  }, [onSave]);

  // If the user is actively editing (or if the current value is custom and they haven't selected a common one)
  if (isEditing || (!isCommonGenre && value && value.trim().length > 0)) {
    return (
      <EditableField
        value={value}
        label={label}
        onSave={handleEditableSave}
        placeholder={placeholder}
        className="flex-grow"
      />
    );
  }

  return (
    <Select value={value || ''} onValueChange={handleSelectChange}>
      <SelectTrigger className={cn("w-full", !value && "text-muted-foreground")}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {COMMON_GENRES.map((genre) => (
          <SelectItem key={genre} value={genre}>
            {genre}
          </SelectItem>
        ))}
        <SelectItem value="custom" className="font-semibold text-primary">
          + Enter Custom Genre
        </SelectItem>
      </SelectContent>
    </Select>
  );
};

export default GenreSelect;