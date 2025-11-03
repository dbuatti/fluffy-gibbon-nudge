import React from 'react';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

const PipelineArrow: React.FC<{ className?: string }> = ({ className }) => {
  return (
    <div className={cn("hidden md:flex items-center justify-center mx-1", className)}>
      <ArrowRight className="h-5 w-5 text-muted-foreground" />
    </div>
  );
};

export default PipelineArrow;