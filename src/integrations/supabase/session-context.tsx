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
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    console.log("SessionContextProvider: Initializing...");
    supabase.auth.getSession().then(({ data: { session } }) => {
      console.log("SessionContextProvider: Initial getSession data:", session);
      setSession(session);
      setIsLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      console.log("SessionContextProvider: Auth state changed. Event:", _event, "Session:", session);
      setSession(session);
      setIsLoading(false); // Ensure isLoading is false after any state change
    });

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