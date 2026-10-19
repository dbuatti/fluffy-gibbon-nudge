/**
 * Local Bridge API — TypeScript contract for the HTTP bridge server
 * running on the user's Mac (~/Music/Logic/_Scripts/local-bridge.js).
 *
 * The bridge binds to 127.0.0.1:34567 (configurable) and accepts requests
 * from https://composerhub.vercel.app with a shared secret Bearer token.
 *
 * Run locally: node local-bridge.js
 * Config: ~/.config/composer-hub/bridge-config.json
 */

export const BRIDGE_DEFAULT_PORT = 34567;
export const BRIDGE_CONFIG_PATH = '~/.config/composer-hub/bridge-config.json';

// ============================================================================
// Request/Response Types
// ============================================================================

export interface BridgeConfig {
  port: number;
  token: string;           // Shared secret (generated on first run)
  allowedOrigins: string[]; // ['https://composerhub.vercel.app', 'http://localhost:5173']
}

export interface BridgeResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: string;
}

// --- Workflow Picker Launch ---

export type WorkflowMode =
  | 'tiktok'
  | 'ig_story'
  | 'piano_improvisation'
  | 'deep_composition'
  | 'finish_take'
  | 'upload_audio'
  | 'sync_nas';

export interface LaunchPickerRequest {
  mode: WorkflowMode;
  // Optional params per mode
  title?: string;              // For piano_improvisation / deep_composition (if pre-known)
  sound?: 'felt_piano' | 'piano'; // For piano_improvisation
  film?: boolean;              // For piano_improvisation
  projectName?: string;        // For deep_composition
  videoTitle?: string;         // For finish_take (optional title to append)
}

export interface LaunchPickerResponse {
  launched: boolean;
  mode: WorkflowMode;
  message: string;
  // If an entry was created in Composer Hub, include its ID and URL
  improvisationId?: string;
  improvisationUrl?: string;
}

// --- Meld Scene Control ---

export interface SetMeldSceneRequest {
  scene: string; // e.g. 'TikTok', 'Felt Piano', 'IG Story'
}

export interface SetMeldSceneResponse {
  success: boolean;
  scene: string;
  message: string;
}

// --- Logic Project Open ---

export interface OpenLogicRequest {
  projectPath: string; // Full path to .logicx file
}

export interface OpenLogicResponse {
  success: boolean;
  projectPath: string;
  message: string;
}

// --- Status / Health ---

export interface BridgeStatusResponse {
  bridge: 'ok';
  version: string;
  uptimeSeconds: number;
  meldConnected: boolean;
  logicRunning: boolean;
  nasMounted: boolean;
  tailscaleConnected?: boolean;
  nasPath?: string;
  config: Pick<BridgeConfig, 'port' | 'allowedOrigins'> & { bindHost?: string };
}

// --- Sync / Query (local script → Supabase) ---

export interface NasStatusResponse {
  mounted: boolean;
  nasPath: string | null;
  tailscaleConnected: boolean;
  nasReachable: boolean;
  nasIp: string | null;
  nasCandidates: string[];
}

export interface SyncStatusRequest {
  // Optional filters
  status?: 'uploaded' | 'analyzing' | 'completed' | 'failed' | 'ready_for_release';
  workflowMode?: WorkflowMode;
  limit?: number;
}

export interface SyncStatusItem {
  id: string;
  generatedName: string;
  status: string;
  workflowMode: string | null;
  hasAudio: boolean;
  hasVideo: boolean;
  isReadyForRelease: boolean;
  createdAt: string;
  nasFolderPath: string | null;
  logicProjectPath: string | null;
}

export interface SyncStatusResponse {
  items: SyncStatusItem[];
  counts: {
    total: number;
    readyForRelease: number;
    staleNoAudio: number; // uploaded > 7 days, no audio
  };
}

// ============================================================================
// Client Helper (for web app)
// ============================================================================

export interface BridgeClientOptions {
  baseUrl?: string; // e.g. 'http://127.0.0.1:34567'
  host?: string;
  port?: number;
  token?: string;   // If not provided, reads from localStorage
  fetchImpl?: typeof fetch;
}

export class BridgeClient {
  private baseUrl: string;
  private token: string;
  private fetchImpl: typeof fetch;
  private host: string;
  private port: number;

  constructor(options: BridgeClientOptions = {}) {
    this.host = options.host || this.getStoredHost();
    this.port = options.port || BRIDGE_DEFAULT_PORT;
    this.baseUrl = options.baseUrl || `http://${this.host}:${this.port}`;
    this.token = options.token || this.getStoredToken();
    // Bind fetch to window to avoid "Illegal invocation" error
    this.fetchImpl = options.fetchImpl || (typeof window !== 'undefined' ? window.fetch.bind(window) : fetch);
  }

  private getStoredHost(): string {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('composer-hub-bridge-host') || '127.0.0.1';
    }
    return '127.0.0.1';
  }

  private getStoredToken(): string {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('composer-hub-bridge-token') || '';
    }
    return '';
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<BridgeResponse<T>> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const res = await this.fetchImpl(`${this.baseUrl}${endpoint}`, {
        ...options,
        headers,
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        return { success: false, error: `HTTP ${res.status}: ${text}`, timestamp: new Date().toISOString() };
      }

      return res.json();
    } catch (e: any) {
      if (e.name === 'AbortError') {
        return { success: false, error: 'Request timed out', timestamp: new Date().toISOString() };
      }
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }

  setToken(token: string) {
    this.token = token;
    if (typeof window !== 'undefined') {
      localStorage.setItem('composer-hub-bridge-token', token);
    }
  }

  setHost(host: string) {
    this.host = host;
    this.baseUrl = `http://${host}:${this.port}`;
    if (typeof window !== 'undefined') {
      localStorage.setItem('composer-hub-bridge-host', host);
    }
  }

  getHost(): string {
    return this.host;
  }

  clearToken() {
    this.token = '';
    if (typeof window !== 'undefined') {
      localStorage.removeItem('composer-hub-bridge-token');
    }
  }

  hasToken(): boolean {
    return !!this.token;
  }

  // --- API Methods ---

  /** Launch a Workflow Picker mode */
  async launchPicker(req: LaunchPickerRequest): Promise<BridgeResponse<LaunchPickerResponse>> {
    return this.request<LaunchPickerResponse>('/workflow/launch', {
      method: 'POST',
      body: JSON.stringify(req),
    });
  }

  /** Switch Meld Studio scene */
  async setMeldScene(req: SetMeldSceneRequest): Promise<BridgeResponse<SetMeldSceneResponse>> {
    return this.request<SetMeldSceneResponse>('/meld/scene', {
      method: 'POST',
      body: JSON.stringify(req),
    });
  }

  /** Open a Logic project */
  async openLogic(req: OpenLogicRequest): Promise<BridgeResponse<OpenLogicResponse>> {
    return this.request<OpenLogicResponse>('/logic/open', {
      method: 'POST',
      body: JSON.stringify(req),
    });
  }

  /** Get bridge health + local system status */
  async getStatus(): Promise<BridgeResponse<BridgeStatusResponse>> {
    return this.request<BridgeStatusResponse>('/status');
  }

  /** Query local script's view of Supabase entries (sync status) */
  async getSyncStatus(req?: SyncStatusRequest): Promise<BridgeResponse<SyncStatusResponse>> {
    const params = new URLSearchParams();
    if (req?.status) params.set('status', req.status);
    if (req?.workflowMode) params.set('workflowMode', req.workflowMode);
    if (req?.limit) params.set('limit', String(req.limit));
    const qs = params.toString();
    return this.request<SyncStatusResponse>(`/sync/status${qs ? `?${qs}` : ''}`);
  }

  /** Test connectivity (no auth required) */
  async ping(): Promise<BridgeResponse<{ pong: boolean }>> {
    return this.request<{ pong: boolean }>('/ping');
  }

  /** Open macOS mount dialog for the NAS (Moon Prism) */
  async mountNas(): Promise<BridgeResponse<{ message: string; mounted: boolean; candidates: string[] }>> {
    return this.request<{ message: string; mounted: boolean; candidates: string[] }>('/nas/mount', { method: 'POST' });
  }

  async getNasStatus(): Promise<BridgeResponse<NasStatusResponse>> {
    return this.request<NasStatusResponse>('/nas/status');
  }
}

// Singleton instance for React hooks
export const bridgeClient = new BridgeClient();

// ============================================================================
// React Hook
// ============================================================================

import { useState, useCallback, useEffect } from 'react';
import { showSuccess, showError } from '@/utils/toast';

export function useLocalBridge() {
  const [client] = useState(() => bridgeClient);
  const [status, setStatus] = useState<BridgeStatusResponse | null>(null);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMode, setLoadingMode] = useState<string | null>(null);
  const [host, setHostState] = useState(() => bridgeClient.getHost());
  const [latency, setLatency] = useState<number | null>(null);

  const checkConnection = useCallback(async () => {
    try {
      const start = Date.now();
      const res = await client.ping();
      const elapsed = Date.now() - start;
      setLatency(elapsed);
      setConnected(res.success);
      if (res.success) {
        const statusRes = await client.getStatus();
        if (statusRes.success && statusRes.data) {
          setStatus(statusRes.data);
        }
      }
    } catch (e) {
      console.error('[LocalBridge] Connection check failed:', e);
      setConnected(false);
      setStatus(null);
      setLatency(null);
    }
  }, [client]);

  useEffect(() => {
    checkConnection();
    const interval = setInterval(checkConnection, 30000); // 30s
    return () => clearInterval(interval);
  }, [checkConnection]);

  const launchPicker = async (req: LaunchPickerRequest) => {
    setLoading(true);
    setLoadingMode(req.mode);
    try {
      const res = await client.launchPicker(req);
      if (res.success) {
        showSuccess(res.data?.message || 'Workflow launched');
        return res.data;
      } else {
        showError(res.error || 'Launch failed');
      }
    } catch (e) {
      showError(String(e));
    } finally {
      setLoading(false);
      setLoadingMode(null);
    }
  };

  const setMeldScene = async (scene: string) => {
    const res = await client.setMeldScene({ scene });
    if (!res.success) {
      showError(res.error || 'Meld scene failed');
    }
    return res;
  };

  const openLogic = async (projectPath: string) => {
    const res = await client.openLogic({ projectPath });
    if (!res.success) {
      showError(res.error || 'Open Logic failed');
    }
    return res;
  };

  const getSyncStatus = async (req?: SyncStatusRequest) => {
    const res = await client.getSyncStatus(req);
    return res.success ? res.data : null;
  };

  const configureToken = (token: string) => {
    client.setToken(token);
    checkConnection();
  };

  const setBridgeHost = (newHost: string) => {
    client.setHost(newHost);
    setHostState(newHost);
    checkConnection();
  };

  const mountNas = async () => {
    const res = await client.mountNas();
    if (res.success) {
      showSuccess(res.data?.message || 'Mount dialog opened');
      // Re-check connection after a delay to pick up new mount
      setTimeout(checkConnection, 3000);
    } else {
      showError(res.error || 'Mount failed');
    }
    return res;
  };

  return {
    client,
    connected,
    status,
    loading,
    loadingMode,
    checkConnection,
    launchPicker,
    setMeldScene,
    openLogic,
    getSyncStatus,
    configureToken,
    mountNas,
    setBridgeHost,
    host,
    latency,
    hasToken: client.hasToken(),
  };
}

// ============================================================================
// Token Setup Helper (run once in browser console or via UI)
// ============================================================================

/**
 * Generate a secure random token for the bridge.
 * Run this once in the browser console on composerhub.vercel.app:
 *   await setupBridgeToken()
 * Then copy the printed token to ~/.config/composer-hub/bridge-config.json on your Mac.
 */
export async function generateBridgeToken(): Promise<string> {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
}

export async function setupBridgeToken(): Promise<void> {
  const token = await generateBridgeToken();
  localStorage.setItem('composer-hub-bridge-token', token);
  console.log('🔐 Bridge token generated and stored in localStorage.');
  console.log('📋 Copy this token to your Mac (see bridge config file).');
  console.log('');
  console.log('To retrieve the token later, run in console: localStorage.getItem("composer-hub-bridge-token")');
}

// ============================================================================
// Real-time Sync Status Hook (Supabase Realtime)
// ============================================================================

import { supabase } from '@/integrations/supabase/client';

interface RealtimeSyncItem {
  id: string;
  generated_name: string;
  status: string;
  workflow_mode: string | null;
  file_name: string | null;
  storage_path: string | null;
  video_path: string | null;
  is_ready_for_release: boolean;
  created_at: string;
  nas_folder_path: string | null;
  logic_project_path: string | null;
}

export function useRealtimeSyncStatus() {
  const [items, setItems] = useState<RealtimeSyncItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Initial fetch
  const fetchInitial = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('improvisations')
        .select('id,generated_name,status,workflow_mode,file_name,storage_path,video_path,is_ready_for_release,created_at,nas_folder_path,logic_project_path')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setItems(data || []);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInitial();

    // Subscribe to realtime changes
    const channel = supabase
      .channel('improvisations-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'improvisations',
        },
        (payload) => {
          if (payload.eventType === 'INSERT' && payload.new) {
            setItems(prev => [payload.new as RealtimeSyncItem, ...prev.slice(0, 49)]);
          } else if (payload.eventType === 'UPDATE' && payload.new) {
            setItems(prev => prev.map(item => item.id === payload.new.id ? payload.new : item));
          } else if (payload.eventType === 'DELETE' && payload.old) {
            setItems(prev => prev.filter(item => item.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const counts = {
    total: items.length,
    readyForRelease: items.filter(i => i.is_ready_for_release).length,
    staleNoAudio: items.filter(i =>
      i.status === 'uploaded' &&
      !i.storage_path &&
      new Date(i.created_at) < new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    ).length,
  };

  return {
    items,
    counts,
    loading,
    error,
    refetch: fetchInitial,
  };
}