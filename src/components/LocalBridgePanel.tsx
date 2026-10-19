import React, { useState, useEffect } from 'react';
import {
  TerminalSquare,
  CheckCircle,
  AlertTriangle,
  Loader2,
  Zap,
  Music,
  Video,
  FolderOpen,
  LinkIcon,
  RefreshCw,
  Settings,
  Upload,
  HardDrive,
  ChevronRight,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Label } from '@/components/ui/label';
import { useLocalBridge, useRealtimeSyncStatus } from '@/lib/local-bridge';
import { showSuccess, showError } from '@/utils/toast';
import { cn } from '@/lib/utils';

const WorkflowButton = ({
  icon: Icon,
  label,
  desc,
  mode,
  onClick,
  disabled,
  loading,
  color,
}: {
  icon: React.ElementType;
  label: string;
  desc: string;
  mode: string;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  color: string;
}) => (
  <Button
    variant="outline"
    className={cn(
      'w-full justify-start gap-1.5 p-1.5 rounded-lg transition-colors',
      'hover:bg-primary/5 border-primary/20',
      'disabled:opacity-50 disabled:cursor-not-allowed'
    )}
    onClick={onClick}
    disabled={disabled || loading}
    style={{ borderColor: color }}
  >
    <div className={cn('h-6 w-6 rounded-md flex items-center justify-center flex-shrink-0', `${color}/10`)}>
      <Icon className="h-3 w-3" style={{ color }} />
    </div>
    <div className="flex-1 min-w-0 text-left">
      <div className="font-medium text-xs truncate leading-tight">{label}</div>
      <div className="text-[10px] text-muted-foreground truncate leading-tight">{desc}</div>
    </div>
    {loading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground flex-shrink-0" />}
  </Button>
);

const StatusIndicator = ({
  label,
  connected,
  value,
}: { label: string; connected?: boolean; value?: string }) => (
  <div className="flex items-center gap-1.5 text-muted-foreground">
    {connected !== undefined && (
      <span className={cn('h-1.5 w-1.5 rounded-full', connected ? 'bg-green-500' : 'bg-red-500')} />
    )}
    <span className="font-medium">{label}</span>
    {value && <span className="text-foreground ml-auto">{value}</span>}
    {connected !== undefined && !value && (
      <span className="text-foreground ml-auto">{connected ? '●' : '○'}</span>
    )}
  </div>
);

const CollapsibleSection = ({
  title,
  icon: Icon,
  isOpen,
  onToggle,
  children,
}: {
  title: string;
  icon: React.ElementType;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) => (
  <div className="border border-border/50 rounded-lg overflow-hidden">
    <button
      onClick={onToggle}
      className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium text-foreground hover:bg-accent transition-colors"
      aria-expanded={isOpen}
    >
      <span className="flex items-center gap-2">
        <Icon className="h-3 w-3 text-primary" />
        {title}
      </span>
      <ChevronRight className={cn('h-3 w-3 text-muted-foreground transition-transform', isOpen && 'rotate-90')} />
    </button>
    {isOpen && (
      <div className="px-3 pb-3 border-t border-border/50 animate-in slide-in-from-top-2 duration-150">
        {children}
      </div>
    )}
  </div>
);

const SyncStatusDisplay: React.FC = () => {
  const { items, counts, loading, error, refetch } = useRealtimeSyncStatus();

  if (!items && !error) return <div className="text-xs text-muted-foreground">Loading sync status…</div>;
  if (error) return <div className="text-xs text-red-500">{error}</div>;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs flex-wrap">
        <Badge variant="outline" className="gap-1 text-[10px]">
          <CheckCircle className="h-3 w-3 text-green-600" />
          Ready: {counts.readyForRelease}
        </Badge>
        <Badge variant="outline" className="gap-1 text-[10px]">
          <AlertTriangle className="h-3 w-3 text-amber-600" />
          Stale: {counts.staleNoAudio}
        </Badge>
        <Badge variant="outline" className="text-[10px]">Total: {counts.total}</Badge>
        <Button variant="ghost" size="icon" onClick={refetch} disabled={loading} className="h-6 w-6 ml-auto">
          <RefreshCw className={cn('h-3 w-3', loading && 'animate-spin')} />
        </Button>
      </div>

      {items.length > 0 && (
        <div className="max-h-48 overflow-y-auto space-y-1">
          {items.slice(0, 8).map((item) => (
            <div key={item.id} className="flex items-center gap-2 p-2 bg-muted/50 rounded text-xs">
              <Badge variant={item.is_ready_for_release ? 'default' : 'outline'} className="text-xs px-2 py-0.5">
                {item.status}
              </Badge>
              <span className="flex-1 truncate font-medium">{item.generated_name}</span>
              {item.workflow_mode && (
                <Badge variant="secondary" className="text-xs px-2 py-0.5">
                  {item.workflow_mode}
                </Badge>
              )}
              {item.storage_path && <Music className="h-3 w-3 text-green-600" title="Has audio" />}
              {item.video_path && <Video className="h-3 w-3 text-blue-600" title="Has video" />}
            </div>
          ))}
          {items.length > 8 && (
            <div className="text-xs text-muted-foreground text-center py-1">
              +{items.length - 8} more…
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export const LocalBridgePanel: React.FC = () => {
  const {
    connected,
    status,
    loading,
    launchPicker,
    checkConnection,
    hasToken,
    configureToken,
  } = useLocalBridge();
  const [tokenInput, setTokenInput] = useState('');
  const [showTokenSetup, setShowTokenSetup] = useState(false);

  const handleLaunch = async (mode: string, extras: Record<string, unknown> = {}) => {
    await launchPicker({ mode: mode as any, ...extras });
  };

  const showToast = (success: boolean, title: string, description?: string) => {
    if (success) showSuccess(description || title);
    else showError(description || title);
  };

  // Collapsible sections
  const [showSystem, setShowSystem] = useState(true);
  const [showWorkflows, setShowWorkflows] = useState(true);
  const [showAudio, setShowAudio] = useState(true);
  const [showSync, setShowSync] = useState(true);
  const [showConfig, setShowConfig] = useState(false);

  const handleUploadAudio = async () => {
    try {
      const res = await launchPicker({ mode: 'upload_audio' });
      if (res?.success) {
        showToast(true, 'Audio upload started', res.data?.message);
      } else {
        showToast(false, 'Upload failed', res?.error);
      }
    } catch (e) {
      showToast(false, 'Error', String(e));
    }
  };

  const handleSyncNAS = async () => {
    try {
      const res = await launchPicker({ mode: 'sync_nas' });
      if (res?.success) {
        showToast(true, 'NAS sync started', res.data?.message);
      } else {
        showToast(false, 'Sync failed', res?.error);
      }
    } catch (e) {
      showToast(false, 'Error', String(e));
    }
  };

  if (!hasToken) {
    return (
      <>
      <Card className="border-orange-500/30 bg-orange-50/30 dark:bg-orange-900/10">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-orange-600 dark:text-orange-400">
            <AlertTriangle className="h-3 w-3" />
            Local Bridge Not Configured
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Connect the web app to your local Workflow Picker scripts. This enables launching
            recording sessions, opening Logic projects, and syncing status directly from here.
          </p>
          <Button variant="outline" className="w-full" onClick={() => setShowTokenSetup(true)}>
            <Settings className="h-3 w-3 mr-2" />
            Set Up Bridge Connection
          </Button>
        </CardContent>
      </Card>
      <LocalBridgeTokenSetup open={showTokenSetup} onClose={() => setShowTokenSetup(false)} />
      </>
    );
  }

  return (
    <>
    <Card className={cn('transition-colors', connected ? 'border-green-500/30' : 'border-red-500/30')}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <TerminalSquare className="h-3 w-3 text-primary" />
            Local Bridge
            <Badge variant={connected ? 'default' : 'destructive'} className="ml-2">
              {connected ? 'Connected' : 'Disconnected'}
            </Badge>
          </CardTitle>
          <Button variant="ghost" size="icon" onClick={checkConnection} disabled={loading}>
            <RefreshCw className={cn('h-3 w-3', loading && 'animate-spin')} />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* System Status Indicators */}
        {status && (
          <div className="grid grid-cols-2 gap-2 text-xs">
            <StatusIndicator label="Meld Studio" connected={status.meldConnected} />
            <StatusIndicator label="Logic Pro" connected={status.logicRunning} />
            <StatusIndicator label="NAS (Moon Prism)" connected={status.nasMounted} />
            <StatusIndicator label="Bridge Uptime" value={`${Math.floor(status.uptimeSeconds / 60)}m`} />
          </div>
        )}

        <Separator />

        {/* Workflow Launcher Buttons */}
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Launch Workflow</h4>

          <WorkflowButton
            icon={Video}
            label="TikTok / Shorts"
            desc="Streaming template + Meld TikTok scene + upload page"
            mode="tiktok"
            onClick={() => handleLaunch('tiktok')}
            color="text-pink-600"
            disabled={!connected || loading}
            loading={loading}
          />

          <WorkflowButton
            icon={Video}
            label="IG Story (Quick Capture)"
            desc="Streaming template + Meld IG scene, no upload step"
            mode="ig_story"
            onClick={() => handleLaunch('ig_story')}
            color="text-purple-600"
            disabled={!connected || loading}
            loading={loading}
          />

          <WorkflowButton
            icon={Music}
            label="Piano Improvisation"
            desc="Felt/Piano template + daily prompt + Composer Hub entry"
            mode="piano_improvisation"
            onClick={() => handleLaunch('piano_improvisation', { sound: 'felt_piano', film: true })}
            color="text-blue-600"
            disabled={!connected || loading}
            loading={loading}
          />

          <WorkflowButton
            icon={FolderOpen}
            label="Deep Composition"
            desc="Mount NAS + Logic/Sibelius templates + dated project folder"
            mode="deep_composition"
            onClick={() => handleLaunch('deep_composition')}
            color="text-green-600"
            disabled={!connected || loading}
            loading={loading}
          />

          <WorkflowButton
            icon={Zap}
            label="Finish Take"
            desc="Pair newest Logic capture with Meld video → Movies folder"
            mode="finish_take"
            onClick={() => handleLaunch('finish_take')}
            color="text-amber-600"
            disabled={!connected || loading}
            loading={loading}
          />
        </div>

        <Separator />

        {/* Audio & Video Actions */}
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Audio & Video</h4>

          <WorkflowButton
            icon={Upload}
            label="Upload Latest Audio"
            desc="Find bounced audio in latest Logic project & upload to Composer Hub"
            mode="upload_audio"
            onClick={handleUploadAudio}
            color="text-emerald-600"
            disabled={!connected || loading}
            loading={loading}
          />

          <WorkflowButton
            icon={HardDrive}
            label="Sync to NAS"
            desc="Copy local captures to Moon Prism backup (run when home)"
            mode="sync_nas"
            onClick={handleSyncNAS}
            color="text-cyan-600"
            disabled={!connected || loading}
            loading={loading}
          />
        </div>

        <Separator />

        {/* Sync Status */}
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Sync Status</h4>
          <SyncStatusDisplay />
        </div>

        {/* Token Management */}
        <div>
          <details className="group">
            <summary className="flex items-center justify-between text-xs text-muted-foreground cursor-pointer">
              <span>Bridge Configuration</span>
              <TerminalSquare className="h-3 w-3 opacity-50 group-hover:opacity-100" />
            </summary>
            <div className="mt-2 space-y-2 text-xs">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Label htmlFor="bridge-port">Port:</Label>
                <code id="bridge-port" className="px-2 py-1 bg-muted rounded text-xs">
                  {status?.config?.port || '34567'}
                </code>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Label htmlFor="bridge-token">Token:</Label>
                <code id="bridge-token" className="px-2 py-1 bg-muted rounded text-xs flex-1 truncate">
                  {tokenInput || '••••••••••••••••••••••••••••••••'}
                </code>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => navigator.clipboard.writeText(tokenInput || '')}>
                  <LinkIcon className="h-3 w-3" />
                </Button>
              </div>
              <Button variant="ghost" size="sm" onClick={() => { configureToken(''); setShowTokenSetup(true); }}>
                Regenerate Token
              </Button>
            </div>
          </details>
        </div>
      </CardContent>
    </Card>
    <LocalBridgeTokenSetup open={showTokenSetup} onClose={() => setShowTokenSetup(false)} />
  </>
  );
};

// Token Setup Dialog (renders in portal or inline)
export const LocalBridgeTokenSetup: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const [token, setToken] = useState('');
  const [copied, setCopied] = useState(false);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Configure Local Bridge</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            1. Start the bridge server on your Mac:
            <code className="block mt-1 p-2 bg-muted rounded text-xs">cd ~/Music/Logic/_Scripts && node local-bridge.js</code>
          </p>
          <p className="text-sm text-muted-foreground">
            2. Copy the config below to <code className="bg-muted px-1 rounded">~/.config/composer-hub/bridge-config.json</code>
          </p>
          <div className="p-2 bg-muted rounded text-xs font-mono whitespace-pre-wrap overflow-auto max-h-40">
            {JSON.stringify({
              token,
              port: 34567,
              allowedOrigins: ['https://composerhub.vercel.app', 'http://localhost:5173'],
            }, null, 2)}
          </div>
          <div className="flex gap-2">
            <Button onClick={() => { navigator.clipboard.writeText(token); setCopied(true); setTimeout(() => setCopied(false), 2000); }}>
              {copied ? 'Copied!' : 'Copy Config'}
            </Button>
            <Button variant="outline" onClick={onClose}>Done</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};