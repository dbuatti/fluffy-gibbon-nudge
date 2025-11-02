import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { INSIGHT_BENEFITS, INSIGHT_PRACTICES, INSIGHT_THEMES } from '@/lib/insight-constants';
import { useUpdateImprovisation } from '@/hooks/useUpdateImprovisation';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface InsightTimerFormFieldsProps {
  improvisationId: string;
  initialBenefits: string[] | null;
  initialPractices: string | null;
  initialThemes: string[] | null;
}

const InsightTimerFormFields: React.FC<InsightTimerFormFieldsProps> = ({
  improvisationId,
  initialBenefits = [],
  initialPractices,
  initialThemes = [],
}) => {
  const updateMutation = useUpdateImprovisation(improvisationId);
  const isPending = updateMutation.isPending;

  // --- Benefits (Multi-Select, Max 3) ---
  const handleBenefitChange = (benefit: string, checked: boolean) => {
    let newBenefits = checked
      ? [...initialBenefits, benefit]
      : initialBenefits.filter(b => b !== benefit);

    // Enforce max 3 benefits
    if (newBenefits.length > 3) {
      newBenefits = newBenefits.slice(0, 3);
    }
    
    updateMutation.mutate({ insight_benefits: newBenefits });
  };

  // --- Practices (Single Select) ---
  const handlePracticeChange = (practice: string) => {
    updateMutation.mutate({ insight_practices: practice });
  };

  // --- Themes (Multi-Select) ---
  const handleThemeChange = (theme: string, checked: boolean) => {
    const newThemes = checked
      ? [...initialThemes, theme]
      : initialThemes.filter(t => t !== theme);
      
    updateMutation.mutate({ insight_themes: newThemes });
  };

  const renderCheckboxGroup = (title: string, options: { [key: string]: string[] }, selectedValues: string[], onChange: (value: string, checked: boolean) => void, maxSelection?: number) => (
    <Card className="shadow-none border">
      <CardHeader className="py-3 px-4 border-b">
        <CardTitle className="text-base font-semibold">
          {title} 
          {maxSelection && <span className="text-sm font-normal text-muted-foreground ml-2"> (Select up to {maxSelection})</span>}
          {isPending && <Loader2 className="h-4 w-4 ml-2 inline-block animate-spin text-primary" />}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 space-y-4">
        {Object.entries(options).map(([category, items]) => (
          <div key={category} className="space-y-2">
            <h4 className="text-sm font-bold text-primary">{category}</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {items.map(item => {
                const isChecked = selectedValues.includes(item);
                const isDisabled = maxSelection && selectedValues.length >= maxSelection && !isChecked;
                
                return (
                  <div key={item} className={cn("flex items-center space-x-2 p-2 rounded-md transition-colors", isDisabled ? "opacity-50 cursor-not-allowed" : "hover:bg-muted/50")}>
                    <Checkbox
                      id={item}
                      checked={isChecked}
                      onCheckedChange={(checked) => onChange(item, !!checked)}
                      disabled={isPending || isDisabled}
                    />
                    <Label htmlFor={item} className="text-sm font-normal cursor-pointer">
                      {item}
                    </Label>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );

  const renderRadioGroup = (title: string, options: { [key: string]: string[] }, selectedValue: string | null, onChange: (value: string) => void) => (
    <Card className="shadow-none border">
      <CardHeader className="py-3 px-4 border-b">
        <CardTitle className="text-base font-semibold">
          {title} 
          <span className="text-sm font-normal text-muted-foreground ml-2"> (Select one option)</span>
          {isPending && <Loader2 className="h-4 w-4 ml-2 inline-block animate-spin text-primary" />}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 space-y-4">
        <RadioGroup 
          value={selectedValue || ''} 
          onValueChange={onChange}
          disabled={isPending}
          className="space-y-4"
        >
          {Object.entries(options).map(([category, items]) => (
            <div key={category} className="space-y-2">
              <h4 className="text-sm font-bold text-primary">{category}</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {items.map(item => (
                  <div key={item} className="flex items-center space-x-2 p-2 rounded-md hover:bg-muted/50">
                    <RadioGroupItem value={item} id={item} />
                    <Label htmlFor={item} className="text-sm font-normal cursor-pointer">
                      {item}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </RadioGroup>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      {renderCheckboxGroup(
        "Benefits", 
        INSIGHT_BENEFITS, 
        initialBenefits, 
        handleBenefitChange, 
        3
      )}
      
      {renderRadioGroup(
        "Practices", 
        INSIGHT_PRACTICES, 
        initialPractices, 
        handlePracticeChange
      )}
      
      {renderCheckboxGroup(
        "Themes & Belief Systems", 
        INSIGHT_THEMES, 
        initialThemes, 
        handleThemeChange
      )}
    </div>
  );
};

export default InsightTimerFormFields;