import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useSession } from '@/integrations/supabase/session-context';

const ProtectedRoute: React.FC = () => {
  const { session, isLoading } = useSession();

  if (isLoading) {
    // Optionally show a spinner or loading state
    return <div className="min-h-screen flex items-center justify-center">Loading authentication...</div>;
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
};

export default ProtectedRoute;