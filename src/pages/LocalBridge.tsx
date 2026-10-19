import React, { useEffect } from 'react';
import { TerminalSquare, Wifi, Monitor } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LocalBridgePanel } from '@/components/LocalBridgePanel';

const LocalBridge: React.FC = () => {
  useEffect(() => {
    document.title = 'Local Bridge - AI Composer Hub';
  }, []);

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <header className="mb-6 max-w-4xl mx-auto">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <TerminalSquare className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Local Bridge</h1>
            <p className="text-sm text-muted-foreground">
              Connect the web app to your Mac's Workflow Picker scripts, Logic Pro, Meld Studio, and NAS.
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main panel */}
          <div className="lg:col-span-2">
            <LocalBridgePanel />
          </div>

          {/* Side info */}
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Wifi className="h-4 w-4 text-primary" />
                  Connection modes
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground space-y-2">
                <p><strong className="text-foreground">Local:</strong> host = <code>127.0.0.1</code> (same machine)</p>
                <p><strong className="text-foreground">Remote:</strong> host = your Mac's Tailscale IP (e.g. <code>100.74.213.103</code>)</p>
                <p className="pt-1">Change the host in the panel's <em>Bridge Configuration</em> section.</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Monitor className="h-4 w-4 text-primary" />
                  Terminal commands
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs space-y-2">
                <div>
                  <p className="text-muted-foreground mb-1">Restart bridge:</p>
                  <code className="block bg-muted px-2 py-1 rounded font-mono text-[10px]">pm2 restart composer-hub-bridge</code>
                </div>
                <div>
                  <p className="text-muted-foreground mb-1">View logs:</p>
                  <code className="block bg-muted px-2 py-1 rounded font-mono text-[10px]">pm2 logs composer-hub-bridge</code>
                </div>
                <div>
                  <p className="text-muted-foreground mb-1">NAS sync (dry run):</p>
                  <code className="block bg-muted px-2 py-1 rounded font-mono text-[10px]">cd ~/Music/Logic/_Scripts && node sync-to-nas.js</code>
                </div>
                <div>
                  <p className="text-muted-foreground mb-1">NAS sync (apply):</p>
                  <code className="block bg-muted px-2 py-1 rounded font-mono text-[10px]">node sync-to-nas.js --apply</code>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
};

export default LocalBridge;