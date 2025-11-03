import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TitleBarProps {
  title: React.ReactNode;
  backLink?: string;
  actions?: React.ReactNode;
  className?: string;
}

const TitleBar: React.FC<TitleBarProps> = ({ title, backLink = '/', actions, className }) => {
  return (
    <div className={cn("flex flex-col md:flex-row md:justify-between md:items-center gap-4 mb-6", className)}>
      {/* Back Link */}
      <Link to={backLink} className="flex items-center text-sm text-muted-foreground hover:text-primary transition-colors order-1 md:order-1">
        <ArrowLeft className="w-4 h-4 mr-1" /> Back
      </Link>

      {/* Title */}
      <div className="flex-grow order-2 md:order-2">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">
          {title}
        </h1>
      </div>

      {/* Actions */}
      {actions && (
        <div className="flex-shrink-0 flex items-center space-x-2 order-3 md:order-3">
          {actions}
        </div>
      )}
    </div>
  );
};

export default TitleBar;