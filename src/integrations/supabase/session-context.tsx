import React, { useState, useEffect, useContext } from 'react';
import { Session } from '@supabase/supabase-js';
import { supabase } from './client';

interface SessionContextType {
  session: Session | null;
  isLoading: boolean;
}

const SessionContext = React.createContext<SessionContextType | undefined>(undefined);

export const useSession = () => {
  const context = useContext(SessionContext);
  if (context === undefined) {
    throw new Error('useSession must be used within a SessionContextProvider');
  }
  return context;
};

export const SessionContextProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true); // Start as true

  useEffect(() => {
    console.log("SessionContextProvider: Initializing useEffect...");

    // This listener will fire immediately with 'INITIAL_SESSION' event
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, currentSession) => {
      console.log("SessionContextProvider: Auth state changed. Event:", event, "Session:", currentSession);
      setSession(currentSession);
      setIsLoading(false); // Set isLoading to false once we have a definitive session state
    });

    // No need for supabase.auth.getSession() here, as onAuthStateChange handles the initial session.
    // This simplifies the logic and ensures isLoading is only set to false once.

    return () => {
      console.log("SessionContextProvider: Unsubscribing from auth state changes.");
      subscription.unsubscribe();
    };
  }, []);

  console.log("SessionContextProvider: Render. Session:", session, "isLoading:", isLoading);

  return (
    <SessionContext.Provider value={{ session, isLoading }}>
      {children}
    </SessionContext.Provider>
  );
};