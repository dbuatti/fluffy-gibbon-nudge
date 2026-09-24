import { useEffect } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import { supabase } from '@/integrations/supabase/client';
import { useSession } from '@/integrations/supabase/session-context';
import { Navigate, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import PasswordGenerator from '@/components/PasswordGenerator';
import { Key, ArrowLeft } from 'lucide-react';

const Signup = () => {
  const { session, isLoading } = useSession();

  useEffect(() => {
    document.title = 'Sign Up - AI Composer Hub';
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-primary to-violet-600 flex items-center justify-center shadow-lg shadow-primary/30">
            <Sparkles className="h-6 w-6 text-white" />
          </div>
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (session) {
    return <Navigate to="/" replace />;
  }

  const activeTheme = typeof document !== 'undefined' && document.documentElement.classList.contains('dark')

  return (
    <div className="min-h-screen flex items-stretch bg-background">
      {/* Brand panel */}
      <div className="hidden lg:flex w-1/2 relative overflow-hidden items-center justify-center p-12 bg-gradient-to-br from-violet-600 via-primary to-primary/90 text-white">
        <div className="absolute inset-0 opacity-20" aria-hidden>
          <div className="absolute -top-24 -right-16 h-72 w-72 rounded-full bg-white/30 blur-3xl" />
          <div className="absolute bottom-0 -left-16 h-72 w-72 rounded-full bg-blue-300/40 blur-3xl" />
        </div>
        <div className="relative max-w-md space-y-6">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center">
              <Sparkles className="h-6 w-6" />
            </div>
            <span className="text-xl font-bold tracking-tight">AI Composer Hub</span>
          </div>
          <h1 className="text-4xl font-bold leading-tight tracking-tight">
            Your creative home for composing with AI.
          </h1>
          <p className="text-white/80 text-lg leading-relaxed">
            Create an account to log ideas, generate artwork prompts, prepare metadata, and track submissions
            across every platform.
          </p>
        </div>
      </div>

      {/* Auth form */}
      <div className="flex-1 flex items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-md space-y-6">
          <Link to="/login" className="flex items-center text-sm text-muted-foreground hover:text-primary">
            <ArrowLeft className="h-4 w-4 mr-1" /> Back to Sign In
          </Link>

          <div className="space-y-1 text-center">
            <h2 className="text-2xl font-bold tracking-tight text-foreground">Create an Account</h2>
            <p className="text-sm text-muted-foreground">
              Start capturing your musical ideas today.
            </p>
          </div>

          <div className="p-6 sm:p-8 rounded-2xl border border-border bg-card shadow-card-light dark:shadow-none">
            <Auth
              supabaseClient={supabase}
              providers={['google']}
              appearance={{
                theme: ThemeSupa,
                variables: {
                  default: {
                    colors: {
                      brand: 'hsl(var(--primary))',
                      brandAccent: 'hsl(var(--primary-foreground))',
                    },
                  },
                },
              }}
              theme={activeTheme ? 'dark' : 'light'}
              redirectTo={window.location.origin + '/'}
              view="sign_up"
            />

            <div className="text-center pt-4">
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="link" className="text-sm text-muted-foreground hover:text-primary">
                    <Key className="h-4 w-4 mr-2" /> Generate Strong Password
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[425px]">
                  <DialogHeader>
                    <DialogTitle>Strong Password Generator</DialogTitle>
                  </DialogHeader>
                  <PasswordGenerator />
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Signup;