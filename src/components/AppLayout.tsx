import React from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import { useIsMobile } from '@/hooks/use-mobile';

const AppLayout: React.FC = () => {
  const isMobile = useIsMobile();
  
  // Calculate padding based on mobile/desktop view
  const contentPadding = isMobile ? 'pt-16' : 'pl-[280px]';

  return (
    <div className="min-h-screen flex flex-col">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-md">
        Skip to main content
      </a>
      <Sidebar />
      <main id="main-content" className={contentPadding + " flex-grow"}>
        <Outlet />
      </main>
    </div>
  );
};

export default AppLayout;