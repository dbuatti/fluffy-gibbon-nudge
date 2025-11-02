import React, { useState, useRef, useEffect } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Check, X, Edit2, Loader2 } from 'lucide-react';
import { showSuccess, showError } from '@/utils/toast';
import { cn } from '@/lib/utils';

// Common genres for quick selection
const COMMON_GENRES = [
    "Classical",
    "Ambient",
    "Jazz",
    "Electronic",
    "New Age",
    "Soundtrack",
    "Folk",
    "Pop",
];

interface GenreSelectProps {
    value: string | null | undefined;
    label: string;
    onSave: (newValue: string) => Promise<void>;
    placeholder?: string;
    // FIX: Add disabled prop
    disabled?: boolean;
}

const GenreSelect: React.FC<GenreSelectProps> = ({ 
    value, 
    label, 
    onSave, 
    placeholder = `Select or type ${label}`,
    disabled = false, // Default to false
}) => {
    const [isEditing, setIsEditing] = useState(false);
    const [isCustomInput, setIsCustomInput] = useState(false);
    const [currentValue, setCurrentValue] = useState(value || '');
    const [isLoading, setIsLoading] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        // If the current value is not in the common list, switch to custom input mode
        if (value && !COMMON_GENRES.includes(value) && !isEditing) {
            setIsCustomInput(true);
        } else if (!value) {
            setIsCustomInput(false);
        }
    }, [value, isEditing]);

    useEffect(() => {
        if (isEditing && isCustomInput && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isEditing, isCustomInput]);

    const handleSave = async (newValue: string) => {
        if (newValue === (value || '')) {
            setIsEditing(false);
            setIsCustomInput(!COMMON_GENRES.includes(newValue));
            return;
        }
        
        if (newValue.trim() === '') {
            showError(`${label} cannot be empty.`);
            return;
        }

        setIsLoading(true);
        try {
            await onSave(newValue);
            showSuccess(`${label} updated successfully.`);
            setIsEditing(false);
            // Determine if we should stay in custom input mode after saving
            setIsCustomInput(!COMMON_GENRES.includes(newValue));
        } catch (error) {
            console.error('Failed to save genre:', error);
            showError(`Failed to update ${label}.`);
        } finally {
            setIsLoading(false);
        }
    };

    const handleCancel = () => {
        setCurrentValue(value || '');
        setIsEditing(false);
        // Reset custom input state based on original value
        setIsCustomInput(value ? !COMMON_GENRES.includes(value) : false);
    };

    const handleSelectChange = (newValue: string) => {
        if (newValue === "+custom") {
            setCurrentValue(value || ''); // Keep current value if switching to custom input
            setIsCustomInput(true);
            setIsEditing(true);
        } else {
            handleSave(newValue);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            handleSave(currentValue);
        } else if (e.key === 'Escape') {
            handleCancel();
        }
    };

    // If disabled, show read-only text
    if (disabled) {
        return (
            <span className={cn("truncate text-sm font-semibold", !value && "text-muted-foreground italic")}>
                {value || placeholder}
            </span>
        );
    }

    // If editing in custom input mode
    if (isEditing && isCustomInput) {
        return (
            <div className="flex items-center space-x-2">
                <Input
                    ref={inputRef}
                    value={currentValue}
                    onChange={(e) => setCurrentValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Type custom genre"
                    className="h-8 flex-grow"
                    disabled={isLoading}
                />
                <Button 
                    onClick={() => handleSave(currentValue)} 
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

    // Default view (Select or Read-only custom text)
    if (isCustomInput) {
        // Display custom genre with an edit button
        return (
            <div className="flex items-center group">
                <span className="truncate text-sm font-semibold">
                    {value}
                </span>
                <Button 
                    onClick={() => setIsEditing(true)} 
                    size="icon" 
                    variant="ghost" 
                    className="h-6 w-6 ml-2 opacity-0 group-hover:opacity-100 transition-opacity p-0"
                >
                    <Edit2 className="h-3 w-3" />
                </Button>
            </div>
        );
    }

    // Select view (This is the default dropdown view)
    return (
        <Select 
            value={value || ""} 
            onValueChange={handleSelectChange}
            disabled={isLoading}
        >
            <SelectTrigger className="h-8">
                <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent>
                {COMMON_GENRES.map(genre => (
                    <SelectItem key={genre} value={genre}>{genre}</SelectItem>
                ))}
                <SelectItem value="+custom" className="font-semibold text-primary">
                    + Enter Custom Genre
                </SelectItem>
            </SelectContent>
        </Select>
    );
};

export default GenreSelect;