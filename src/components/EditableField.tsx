import React, { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Check, X, Edit2, Loader2 } from 'lucide-react';
import { showError } from '@/utils/toast'; // ADDED

interface EditableFieldProps {
  value: string | null | undefined;
  label: string;
  onSave: (newValue: string) => Promise<void>;
  className?: string;
  placeholder?: string;
}

const EditableField: React.FC<EditableFieldProps> = ({ value, label, onSave, className = '', placeholder = 'Click to edit' }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [currentValue, setCurrentValue] = useState(value || '');
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Update internal state if external value changes (e.g., after a successful save or refetch)
  useEffect(() => {
    setCurrentValue(value || '');
  }, [value]);

  const handleStartEdit = () => {
    setIsEditing(true);
    // Focus the input field after the state transition
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setCurrentValue(value || ''); // Revert to original value
  };

  const handleSave = async () => {
    const trimmedValue = currentValue.trim();
    const originalValue = (value || '').trim();
    
    // 1. Check if the value has actually changed
    if (trimmedValue === originalValue) {
      setIsEditing(false);
      return; // No change, exit silently
    }
    
    // 2. Check for empty value (if original was not empty)
    if (!trimmedValue && originalValue) {
        showError(`The ${label} cannot be empty.`);
        setCurrentValue(originalValue); // Revert to original
        setIsEditing(false);
        return;
    }

    setIsLoading(true);
    try {
      await onSave(trimmedValue);
      setIsEditing(false);
    } catch (e) {
      // Error handled by the mutation hook, but we revert state here
      setCurrentValue(value || '');
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  };

  if (isEditing) {
    return (
      <div className="flex items-center space-x-2 w-full">
        <Input
          ref={inputRef}
          value={currentValue}
          onChange={(e) => setCurrentValue(e.target.value)}
          onBlur={handleSave} // Save on blur
          onKeyDown={handleKeyDown}
          disabled={isLoading}
          className="flex-grow"
        />
        <Button 
          onClick={handleSave} 
          size="icon" 
          variant="ghost" 
          disabled={isLoading}
          className="h-8 w-8"
        >
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4 text-green-500" />}
        </Button>
        <Button 
          onClick={handleCancel} 
          size="icon" 
          variant="ghost" 
          disabled={isLoading}
          className="h-8 w-8"
        >
          <X className="h-4 w-4 text-red-500" />
        </Button>
      </div>
    );
  }

  return (
    <div 
      className={`flex items-center group cursor-pointer hover:bg-muted/50 p-1 rounded transition-colors ${className}`}
      onClick={handleStartEdit}
      title={`Click to edit ${label}`}
    >
      <span className="truncate flex-grow">
        {value || <span className="text-muted-foreground italic">{placeholder}</span>}
      </span>
      <Edit2 className="h-4 w-4 ml-2 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
    </div>
  );
};

export default EditableField;