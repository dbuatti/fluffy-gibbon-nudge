import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Home, Frown } from "lucide-react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error(
      "404 Error: User attempted to access non-existent route:",
      location.pathname,
    );
  }, [location.pathname]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background text-foreground p-4">
      <div className="text-center space-y-6">
        <Frown className="w-24 h-24 mx-auto text-primary" />
        <h1 className="text-6xl font-extrabold text-primary">404</h1>
        <p className="text-2xl text-muted-foreground font-medium">Oops! Page not found</p>
        <p className="text-lg text-neutral max-w-md mx-auto">
          The page you're looking for might have been removed, had its name changed, or is temporarily unavailable.
        </p>
        <Button asChild className="mt-6 px-8 py-4 text-lg">
          <a href="/">
            <Home className="w-5 h-5 mr-2" /> Return to Home
          </a>
        </Button>
      </div>
    </div>
  );
};

export default NotFound;