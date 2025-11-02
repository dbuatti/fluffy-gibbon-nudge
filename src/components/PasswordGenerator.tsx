import React, { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Slider } from '@/components/ui/slider';
import { Copy, RefreshCw } from 'lucide-react';
import { showSuccess, showError } from '@/utils/toast';
import { cn } from '@/lib/utils';

const generatePassword = (length: number, includeUppercase: boolean, includeNumbers: boolean, includeSymbols: boolean): string => {
  const lower = 'abcdefghijklmnopqrstuvwxyz';
  const upper = includeUppercase ? 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' : '';
  const numbers = includeNumbers ? '0123456789' : '';
  const symbols = includeSymbols ? '!@#$%^&*()_+[]{}|;:,.<>?' : '';

  const allChars = lower + upper + numbers + symbols;
  if (allChars.length === 0) return '';

  let password = '';
  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * allChars.length);
    password += allChars[randomIndex];
  }
  return password;
};

const PasswordGenerator: React.FC = () => {
  const [length, setLength] = useState(16);
  const [includeUppercase, setIncludeUppercase] = useState(true);
  const [includeNumbers, setIncludeNumbers] = useState(true);
  const [includeSymbols, setIncludeSymbols] = useState(true);
  const [password, setPassword] = useState(generatePassword(16, true, true, true));

  const handleGenerate = useCallback(() => {
    const newPassword = generatePassword(length, includeUppercase, includeNumbers, includeSymbols);
    setPassword(newPassword);
  }, [length, includeUppercase, includeNumbers, includeSymbols]);

  const handleCopy = () => {
    if (password) {
      navigator.clipboard.writeText(password);
      showSuccess('Password copied to clipboard!');
    } else {
      showError('No password generated.');
    }
  };

  // Determine password strength (simple heuristic)
  const strength = (includeUppercase ? 1 : 0) + (includeNumbers ? 1 : 0) + (includeSymbols ? 1 : 0) + (length > 12 ? 1 : 0);
  
  const strengthClasses = cn(
    "h-2 rounded-full transition-all",
    strength === 0 && "bg-gray-300 w-1/4",
    strength === 1 && "bg-red-500 w-1/4",
    strength === 2 && "bg-yellow-500 w-2/4",
    strength === 3 && "bg-blue-500 w-3/4",
    strength >= 4 && "bg-green-500 w-full",
  );

  return (
    <div className="space-y-6 p-4">
      <div className="flex space-x-2">
        <Input 
          type="text" 
          value={password} 
          readOnly 
          className="flex-grow font-mono text-lg"
        />
        <Button variant="outline" size="icon" onClick={handleCopy} title="Copy Password">
          <Copy className="h-4 w-4" />
        </Button>
        <Button size="icon" onClick={handleGenerate} title="Generate New Password">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-2">
        <Label>Password Strength</Label>
        <div className="w-full bg-gray-200 rounded-full h-2 dark:bg-gray-700">
          <div className={strengthClasses}></div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="length">Length: {length}</Label>
          <Slider
            id="length"
            min={8}
            max={32}
            step={1}
            value={[length]}
            onValueChange={([val]) => setLength(val)}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="uppercase"
              checked={includeUppercase}
              onCheckedChange={(checked) => setIncludeUppercase(!!checked)}
            />
            <Label htmlFor="uppercase">Include Uppercase</Label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="numbers"
              checked={includeNumbers}
              onCheckedChange={(checked) => setIncludeNumbers(!!checked)}
            />
            <Label htmlFor="numbers">Include Numbers</Label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="symbols"
              checked={includeSymbols}
              onCheckedChange={(checked) => setIncludeSymbols(!!checked)}
            />
            <Label htmlFor="symbols">Include Symbols</Label>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PasswordGenerator;