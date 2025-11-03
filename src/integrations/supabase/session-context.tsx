import React, { useState, useEffect, useContext } from 'react';
import { Session, SupabaseClient } from '@supabase/supabase-js';
import { createClient, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './client'; // Import createClient and constants

interface SessionContextType {
  session: Session | null;
  isLoading: boolean;
  supabase: SupabaseClient; // Add supabase client to the context
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
  // Create the Supabase client once and keep it stable
  const [supabaseClient] = useState(() => createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY));

  useEffect(() => {
    console.log("SessionContextProvider: Initializing useEffect...");

    // Set the initial session if available
    supabaseClient.auth.getSession().then(({ data: { session: initialSession } }) => {
      setSession(initialSession);
      setIsLoading(false);
    });

    // Listen for auth state changes
    const { data: { subscription } } = supabaseClient.auth.onAuthStateChange((event, currentSession) => {
      console.log("SessionContextProvider: Auth state changed. Event:", event, "Session:", currentSession);
      setSession(currentSession);
      // The client's session is automatically updated by onAuthStateChange,
      // but explicitly setting it can be useful for clarity or if other parts
      // of the app need to react to the client's internal state.
      if (currentSession) {
        supabaseClient.auth.setSession(currentSession);
      } else {
        // If signed out, clear the session from the client
        supabaseClient.auth.setSession({ access_token: '', refresh_token: '' });
      }
    });

    return () => {
      console.log("SessionContextProvider: Unsubscribing from auth state changes.");
      subscription.unsubscribe();
    };
  }, [supabaseClient]); // Depend on supabaseClient to ensure effect runs once after client is stable

  console.log("SessionContextProvider: Render. Session:", session, "isLoading:", isLoading);

  return (
    <SessionContext.Provider value={{ session, isLoading, supabase: supabaseClient }}>
      {children}
    </SessionContext.Provider>
  );
};