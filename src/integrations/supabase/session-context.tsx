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
  const [isLoading, setIsLoading] = useState(true);
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

    const getInitialSession = async () => {
      const { data: { session: initialSession }, error } = await supabaseClient.auth.getSession();
      if (error) {
        console.error("Error fetching initial session:", error);
      }
      setSession(initialSession);
      // Explicitly set the session on the client after fetching it.
      // This might help ensure the client's internal state is fully synchronized.
      if (initialSession) {
        supabaseClient.auth.setSession(initialSession);
      }
      setIsLoading(false);
      console.log("SessionContextProvider: Initial session loaded. Session:", initialSession, "isLoading:", false);
    };

    getInitialSession();

    const { data: { subscription } } = supabaseClient.auth.onAuthStateChange((event, currentSession) => {
      console.log("SessionContextProvider: Auth state changed. Event:", event, "Session:", currentSession);
      setSession(currentSession);
      // The onAuthStateChange listener automatically updates the client's internal session.
      // No need for explicit supabaseClient.auth.setSession() here.
    });

    return () => {
      console.log("SessionContextProvider: Unsubscribing from auth state changes.");
      subscription.unsubscribe();
    };
  }, [supabaseClient]);

  console.log("SessionContextProvider: Render. Session:", session, "isLoading:", isLoading);

  return (
    <SessionContext.Provider value={{ session, isLoading, supabase: supabaseClient }}>
      {children}
    </SessionContext.Provider>
  );
};