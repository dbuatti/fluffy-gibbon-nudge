import React, { useState, useRef, useEffect } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Check, X, Edit2, Loader2 } from 'lucide-react';
import { showSuccess, showError } from '@/utils/toast';
import { cn } from '@/lib/utils';

// Common genres for quick selection (Comprehensive list for DistroKid/general use)
const COMMON_GENRES = [
    "Afrobeat",
    "Afropop",
    "Alternative",
    "Big Band",
    "Blues",
    "Children's Music",
    "Christian/Gospel",
    "Classical",
    "Comedy",
    "Country",
    "Dance",
    "Electronic",
    "Fitness & Workout",
    "Folk",
    "French Pop",
    "German Folk",
    "German Pop",
    "Hip Hop/Rap",
    "Holiday",
    "J-Pop",
    "Jazz",
    "K-Pop",
    "Latin",
    "Latin Urban",
    "Metal",
    "New Age",
    "Pop",
    "Punk",
    "R&B/Soul",
    "Reggae",
    "Rock",
    "Singer/Songwriter",
    "Soundtrack",
    "Spoken Word",
    "Vocal",
    "World",
];

interface GenreSelectProps {
    value: string | null | undefined;
    label: string;
    onSave: (newValue: string) => Promise<void>;
    placeholder?: string;
    disabled?: boolean;
}

const GenreSelect: React.FC<GenreSelectProps> = ({ 
    value, 
    label, 
    onSave, 
    placeholder = `Select or type ${label}`,
    disabled = false,
}) => {
    const [isEditing, setIsEditing] = useState(false);
    const [isCustomInput, setIsCustomInput] = useState(false);
    const [currentValue, setCurrentValue] = useState(value || '');
    const [isLoading, setIsLoading] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    // Effect to determine if the current value is a custom input
    useEffect(() => {
        const isValueCustom = value && !COMMON_GENRES.includes(value);
        // Only set isCustomInput if we are not actively editing, to prevent flicker
        if (!isEditing) {
            setIsCustomInput(isValueCustom);
        }
        setCurrentValue(value || '');
    }, [value, isEditing]);

    useEffect(() => {
        if (isEditing && isCustomInput && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isEditing, isCustomInput]);

    const handleSave = async (newValue: string) => {
        const trimmedValue = newValue.trim();
        if (trimmedValue === (value || '')) {
            setIsEditing(false);
            setIsCustomInput(!COMMON_GENRES.includes(trimmedValue));
            return;
        }
        
        if (trimmedValue === '') {
            showError(`${label} cannot be empty.`);
            return;
        }

        setIsLoading(true);
        try {
            await onSave(trimmedValue);
            showSuccess(`${label} updated successfully.`);
            setIsEditing(false);
            setIsCustomInput(!COMMON_GENRES.includes(trimmedValue));
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
        setIsCustomInput(value ? !COMMON_GENRES.includes(value) : false);
    };

    const handleSelectChange = (newValue: string) => {
        if (newValue === "+custom") {
            // Switch to text input mode
            setCurrentValue(value || ''); 
            setIsCustomInput(true);
            setIsEditing(true);
        } else {
            // Save selected common genre immediately
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

    // If actively editing in custom input mode
    if (isEditing && isCustomInput) {
        return (
            <div className="flex items-center space-x-2">
                <Input
                    ref={inputRef}
                    value={currentValue}
                    onChange={(e) => setCurrentValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Type custom genre"
                    className="h-8 flex-grow bg-background" // Explicitly set background
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

    // Default view: Always render the Select dropdown
    return (
        <div className="flex items-center space-x-2">
            <Select 
                value={value || ""} 
                onValueChange={handleSelectChange}
                disabled={isLoading}
            >
                <SelectTrigger className="h-8 flex-grow">
                    <SelectValue placeholder={placeholder} />
                </SelectTrigger>
                <SelectContent>
                    {COMMON_GENRES.map(genre => (
                        <SelectItem key={genre} value={genre}>{genre}</SelectItem>
                    ))}
                    {/* If a custom value is set, show it as a selected item */}
                    {isCustomInput && value && !COMMON_GENRES.includes(value) && (
                        <SelectItem key={value} value={value} className="font-semibold text-primary">
                            {value} (Custom)
                        </SelectItem>
                    )}
                    <SelectItem value="+custom" className="font-semibold text-primary">
                        + Enter Custom Genre
                    </SelectItem>
                </SelectContent>
            </Select>
            
            {/* Show edit button only if a custom value is currently selected (and we are not editing) */}
            {isCustomInput && !isEditing && (
                <Button 
                    onClick={() => setIsEditing(true)} 
                    size="icon" 
                    variant="ghost" 
                    className="h-8 w-8 flex-shrink-0"
                    title="Edit Custom Genre Text"
                >
                    <Edit2 className="h-4 w-4" />
                </Button>
            )}
        </div>
    );
};

export default GenreSelect;