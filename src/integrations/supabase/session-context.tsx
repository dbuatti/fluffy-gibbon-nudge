import React, { useState, useEffect, useContext } from 'react';
import { Session, SupabaseClient } from '@supabase/supabase-js';
import { createClient, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './client';

interface SessionContextType {
  session: Session | null;
  isLoading: boolean;
  supabase: SupabaseClient;
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
  const [supabaseClient] = useState(() =>
    createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  );

  useEffect(() => {
    console.log("SessionContextProvider: Initializing useEffect...");

    // Listen for auth state changes
    const { data: { subscription } } = supabaseClient.auth.onAuthStateChange((event, currentSession) => {
      console.log("SessionContextProvider: Auth state changed. Event:", event, "Session:", currentSession);
      setSession(currentSession);
      setIsLoading(false); // Set loading to false once the initial session is determined
    });

    // Cleanup subscription on unmount
    return () => {
      console.log("SessionContextProvider: Unsubscribing from auth state changes.");
      subscription.unsubscribe();
    };
  }, [supabaseClient]); // Depend on supabaseClient to ensure listener is set up once

  console.log("SessionContextProvider: Render. Session:", session, "isLoading:", isLoading);

  return (
    <SessionContext.Provider value={{ session, isLoading, supabase: supabaseClient }}>
      {children}
    </SessionContext.Provider>
  );
};