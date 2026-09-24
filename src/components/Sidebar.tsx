import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LogOut, Settings, Sparkles, User, Menu, FileText, BookOpen, Home, Music, ListMusic } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useSession } from '@/integrations/supabase/session-context';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import ThemeToggle from './ThemeToggle';

interface NavItem {
  to: string;
  icon: React.ElementType;
  label: string;
  matchPrefix?: string[];
}

const navItems: NavItem[] = [
  { to: '/', icon: Home, label: 'Home' },
  { to: '/composer', icon: Music, label: 'Composer', matchPrefix: ['/improvisation/'] },
  { to: '/arranging', icon: ListMusic, label: 'Arranging' },
  { to: '/composition-script', icon: FileText, label: 'Local Script' },
  { to: '/settings', icon: Settings, label: 'Settings' },
  { to: '/instructions', icon: BookOpen, label: 'Instructions' },
];

const SidebarContent: React.FC<{ onLinkClick?: () => void }> = ({ onLinkClick }) => {
  const { session } = useSession();
  const location = useLocation();

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const email = session?.user?.email || '';
  const userInitial = email ? email.charAt(0).toUpperCase() : '?';

  return (
    <div className="flex flex-col h-full p-4">
      {/* Brand */}
      <div className="flex items-center justify-between mb-8">
        <Link to="/" onClick={onLinkClick} className="flex items-center space-x-2.5 group">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-primary to-violet-600 dark:to-violet-500 flex items-center justify-center shadow-md shadow-primary/20 group-hover:shadow-lg group-hover:shadow-primary/30 transition-shadow">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          <div className="leading-tight">
            <h1 className="text-base font-bold tracking-tight text-foreground">AI Composer Hub</h1>
            <p className="text-[11px] text-muted-foreground">From spark to submission</p>
          </div>
        </Link>
        <ThemeToggle />
      </div>

      {/* Nav */}
      <nav className="flex-grow space-y-1">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest px-3 mb-2">
          Workspace
        </p>
        {navItems.map((item) => {
          const active = item.matchPrefix
            ? location.pathname === item.to || item.matchPrefix.some(p => location.pathname.startsWith(p))
            : location.pathname === item.to;
          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={onLinkClick}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                active
                  ? "bg-primary/10 text-primary shadow-sm"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              <item.icon className={cn("h-[18px] w-[18px]", active && "text-primary")} strokeWidth={2.2} />
              <span>{item.label}</span>
              {active && (
                <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" aria-hidden />
              )}
            </Link>
          );
        })}
      </nav>

      <Separator className="my-4" />

      {/* User footer */}
      {session ? (
        <div className="space-y-2">
          <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-muted/60">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="bg-primary/15 text-primary text-sm font-semibold">
                {userInitial}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate text-foreground">{email}</p>
              <p className="text-[11px] text-muted-foreground">Signed in</p>
            </div>
          </div>
          <Button
            onClick={handleLogout}
            variant="ghost"
            className="w-full justify-start gap-3 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
          >
            <LogOut className="h-[18px] w-[18px]" />
            Sign Out
          </Button>
        </div>
      ) : (
        <Link to="/login">
          <Button className="w-full">
            <User className="h-4 w-4" /> Sign In
          </Button>
        </Link>
      )}
    </div>
  );
};

const Sidebar: React.FC = () => {
  const isMobile = useIsMobile();
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  if (isMobile) {
    return (
      <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="fixed top-4 left-4 z-50" aria-label="Open navigation menu">
            <Menu className="h-6 w-6" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-[280px] p-0 bg-sidebar dark:bg-sidebar">
          <SidebarContent onLinkClick={() => setIsSheetOpen(false)} />
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <div className="fixed top-0 left-0 h-full w-[280px] bg-sidebar dark:bg-sidebar/80 dark:backdrop-blur-md border-r border-sidebar-border shadow-xl z-30">
      <SidebarContent />
    </div>
  );
};

export default Sidebar;