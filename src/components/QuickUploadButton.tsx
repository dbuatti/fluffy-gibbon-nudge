import React from 'react';
import { Button } from '@/components/ui/button';
import { Upload } from 'lucide-react';
import { showSuccess } from '@/utils/toast';

interface QuickUploadButtonProps {
  onTriggerUpload: () => void;
}

const QuickUploadButton: React.FC<QuickUploadButtonProps> = ({ onTriggerUpload }) => {
  const handleQuickUpload = () => {
    onTriggerUpload();
    showSuccess("Ready to capture your idea! Select your audio file now.");
  };

  return (
    <Button 
      onClick={handleQuickUpload} 
      variant="secondary" 
      className="w-full md:w-auto text-lg h-12 px-6 shadow-md hover:shadow-lg transition-shadow"
    >
      <Upload className="w-5 h-5 mr-2" /> Capture New Idea
    </Button>
  );
};

export default QuickUploadButton;