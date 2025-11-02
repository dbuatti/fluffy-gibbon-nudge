import React, { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Check, X, Edit2, Loader2 } from 'lucide-react';
import { showSuccess, showError } from '@/utils/toast';
import { cn } from '@/lib/utils';

interface EditableFieldProps {
  value: string | null | undefined;
  label: string;
  onSave: (newValue: string) => Promise<void>;
  className?: string;
  placeholder?: string;
  // FIX: Add disabled prop
  disabled?: boolean; 
}

const EditableField: React.FC<EditableFieldProps> = ({ 
  value, 
  label, 
  onSave, 
  className, 
  placeholder = `Enter ${label}`,
  disabled = false, // Default to false
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [currentValue, setCurrentValue] = useState(value || '');
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isEditing]);

  const handleSave = async () => {
    if (currentValue === (value || '')) {
      setIsEditing(false);
      return;
    }
    
    if (currentValue.trim() === '') {
        showError(`${label} cannot be empty.`);
        return;
    }

    setIsLoading(true);
    try {
      await onSave(currentValue);
      showSuccess(`${label} updated successfully.`);
      setIsEditing(false);
    } catch (error) {
      console.error('Failed to save field:', error);
      showError(`Failed to update ${label}.`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    setCurrentValue(value || '');
    setIsEditing(false);
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
      <div className={cn("flex items-center space-x-2", className)}>
        <Input
          ref={inputRef}
          value={currentValue}
          onChange={(e) => setCurrentValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="h-8 flex-grow"
          disabled={isLoading}
        />
        <Button 
          onClick={handleSave} 
          size="icon" 
          variant="ghost" 
          className="h-8 w-8"
          disabled={isLoading}
        >
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4 text-green-500" />}
        </Button>
        <Button 
          onClick={handleCancel} 
          size="icon" 
          variant="ghost" 
          className="h-8 w-8"
          disabled={isLoading}
        >
          <X className="h-4 w-4 text-red-500" />
        </Button>
      </div>
    );
  }

  return (
    <div className={cn("flex items-center group", className)}>
      <span className={cn("truncate", !value && "text-muted-foreground italic")}>
        {value || placeholder}
      </span>
      {!disabled && (
        <Button 
          onClick={() => setIsEditing(true)} 
          size="icon" 
          variant="ghost" 
          className="h-6 w-6 ml-2 opacity-0 group-hover:opacity-100 transition-opacity p-0"
        >
          <Edit2 className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
};

export default EditableField;