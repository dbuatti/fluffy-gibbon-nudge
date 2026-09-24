import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Home, Frown, Search } from "lucide-react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error(
      "404 Error: User attempted to access non-existent route:",
      location.pathname,
    );
    document.title = '404 Not Found - AI Composer Hub';
  }, [location.pathname]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background text-foreground p-4">
      <div className="text-center space-y-6 max-w-lg">
        <div className="mx-auto w-24 h-24 rounded-3xl bg-primary/10 flex items-center justify-center">
          <Search className="w-12 h-12 text-primary" />
        </div>
        <div className="space-y-1">
          <p className="text-6xl font-extrabold text-brand-gradient">404</p>
          <p className="text-2xl text-muted-foreground font-medium">Page not found</p>
        </div>
        <p className="text-lg text-muted-foreground">
          The page you're looking for might have been removed, had its name changed, or is temporarily unavailable.
        </p>
        <Button asChild className="mt-6 px-8 py-4 text-lg">
          <Link to="/">
            <Home className="w-5 h-5 mr-2" /> Return Home
          </Link>
        </Button>
      </div>
    </div>
  );
};

export default NotFound;