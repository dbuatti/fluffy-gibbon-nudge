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
      <Sidebar />
      <main className={contentPadding + " flex-grow"}>
        <Outlet />
      </main>
    </div>
  );
};

export default AppLayout;