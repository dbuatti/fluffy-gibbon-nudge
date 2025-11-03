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
        persistSession: true, // Ensure session persistence is enabled
        autoRefreshToken: true, // Ensure auto refresh is enabled
        detectSessionInUrl: true, // Detect session from URL hash
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
      setIsLoading(false);
    };

    getInitialSession();

    const { data: { subscription } } = supabaseClient.auth.onAuthStateChange((event, currentSession) => {
      console.log("SessionContextProvider: Auth state changed. Event:", event, "Session:", currentSession);
      setSession(currentSession);
      // The client's internal session state is automatically updated by onAuthStateChange.
      // Explicitly calling setSession here is generally not needed and can sometimes cause issues.
      // if (currentSession) {
      //   supabaseClient.auth.setSession(currentSession);
      // } else {
      //   // If signed out, the client's session is already cleared by onAuthStateChange.
      //   // Explicitly setting an empty session might interfere.
      //   // supabaseClient.auth.setSession({ access_token: '', refresh_token: '' });
      // }
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