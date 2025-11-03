import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Music, LayoutDashboard, LogOut, Settings, Sparkles, User, Menu, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useSession } from '@/integrations/supabase/session-context';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import ThemeToggle from './ThemeToggle';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/improvisations', icon: Music, label: 'Improvisations' }, // Updated route and label
  { to: '/composition-script', icon: FileText, label: 'Local Script' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

const SidebarContent: React.FC<{ onLinkClick?: () => void }> = ({ onLinkClick }) => {
  const { session } = useSession();
  const location = useLocation();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    // No need to navigate, the SessionContextProvider handles redirect to /login
  };

  return (
    <div className="flex flex-col h-full p-4">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-2">
          <Sparkles className="h-6 w-6 text-primary" />
          <h1 className="text-xl font-bold tracking-tight">AI Composer Hub</h1>
        </div>
        <ThemeToggle />
      </div>

      <nav className="flex-grow space-y-1">
        {navItems.map((item) => (
          <Link 
            key={item.to} 
            to={item.to} 
            onClick={onLinkClick}
            className={cn(
              "flex items-center p-3 rounded-lg transition-colors",
              location.pathname === item.to
                ? "bg-primary text-primary-foreground shadow-md"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <item.icon className="h-5 w-5 mr-3" />
            <span className="font-medium">{item.label}</span>
          </Link>
        ))}
      </nav>

      <Separator className="my-4" />

      {session ? (
        <div className="space-y-2">
          <div className="flex items-center p-3 rounded-lg bg-muted/50">
            <User className="h-5 w-5 mr-3 text-muted-foreground" />
            <span className="text-sm font-medium truncate">{session.user.email}</span>
          </div>
          <Button 
            onClick={handleLogout} 
            variant="ghost" 
            className="w-full justify-start text-destructive hover:bg-destructive/10"
          >
            <LogOut className="h-5 w-5 mr-3" />
            Sign Out
          </Button>
        </div>
      ) : (
        <Link to="/login">
          <Button className="w-full">Sign In</Button>
        </Link>
      )}
    </div>
  );
};

const Sidebar: React.FC = () => {
  const isMobile = useIsMobile();
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  if (isMobile) {
    // Mobile: Use a Sheet (Drawer)
    return (
      <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="fixed top-4 left-4 z-50">
            <Menu className="h-6 w-6" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-[280px] p-0">
          <SidebarContent onLinkClick={() => setIsSheetOpen(false)} />
        </SheetContent>
      </Sheet>
    );
  }

  // Desktop: Fixed Sidebar
  return (
    <div className="fixed top-0 left-0 h-full w-[280px] border-r bg-sidebar dark:bg-background/50 dark:border-r-border/50 shadow-xl z-30">
      <SidebarContent />
    </div>
  );
};

export default Sidebar;