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

// --- Finder Folder Open ---

export interface OpenFinderRequest {
  /** Absolute POSIX path — either the song folder or its .logicx bundle (bridge resolves to the parent folder). */
  path: string;
  /** Select a file in its folder (Finder reveal) instead of opening the folder. */
  reveal?: boolean;
}

export interface OpenFinderResponse {
  success: boolean;
  path: string;
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
  /** Mount exists and its contents can actually be read (false = stale handle). */
  nasReadable?: boolean;
  /** Mountpoint exists but the share is unusable — usually after a network switch. */
  nasStale?: boolean;
  nasReachable?: boolean;
  nasIp?: string | null;
  tailscaleConnected?: boolean;
  nasPath?: string;
  config: Pick<BridgeConfig, 'port' | 'allowedOrigins'> & { bindHost?: string };
}

// --- Local Captures ---
export interface LocalCapture {
  name: string;
  stem: string;
  fullPath: string;
  mtime: number;
  createdAt: string;
  /** True when this capture already has an app entry (matched by original_name / logic_project_path). */
  inApp?: boolean;
  improvisationId?: string | null;
}

export interface NasStatusResponse {
  mounted: boolean;
  /** Mount exists and its contents can actually be read (false = stale handle). */
  readable?: boolean;
  /** Mountpoint exists but the share is unusable — usually after a network switch. */
  stale?: boolean;
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

// --- Social Kit ---

export type SocialCaptionPlatform = 'instagram' | 'tiktok' | 'youtube';

/** Written captions per destination; each is also saved as a .txt in the kit. */
export type SocialCaptions = Partial<Record<SocialCaptionPlatform, string>>;

export interface SocialKitFile {
  name: string;
  path: string;
  kind: 'video' | 'image' | 'text';
  /** Present on rendered videos: which platform cut this file is for. */
  ratio?: 'reels' | 'feed' | 'youtube' | string;
  ratioLabel?: string;
  /** Present on caption text files: which destination it belongs to. */
  platform?: SocialCaptionPlatform;
  /** Trim window for long songs (seconds into the original). */
  clipStartSec?: number;
  clipSec?: number;
  /** 1-based index + total when a build made several excerpts. */
  clipIndex?: number;
  clipCount?: number;
  /** True when the excerpt was chosen automatically (strongest passage). */
  autoExcerpt?: boolean;
  /** True when this file is one of several alternate cuts for its ratio. */
  idea?: boolean;
  sizeMB?: number;
}

export interface SocialKit {
  built: boolean;
  folder: string | null;
  title: string;
  /** Full length of the source recording. */
  durationSec?: number;
  /** Instagram/Reels caption (kept for older kits). */
  caption?: string;
  captions?: SocialCaptions;
  /** Number of excerpt cuts requested for the short-form videos. */
  clipCount?: number;
  /** Which ratios got several cuts (e.g. ['reels','youtube']). */
  clipRatios?: string[];
  /** ISO timestamps of the last post per platform (local record). */
  posted?: Partial<Record<SocialCaptionPlatform, string>>;
  artworkSource?: 'existing' | 'generated';
  artworkUrl?: string | null;
  /** State of the durable NAS copy of this kit. */
  nas?: SocialNasMirror | null;
  files: SocialKitFile[];
  /** How long the last build took (seconds). */
  seconds?: number;
  message?: string;
}

/**
 * The NAS copy of a kit. Rendering always lands in ~/Desktop/Social first; this
 * describes the second copy, which is best-effort and can be retried without
 * rebuilding the videos.
 */
export interface SocialNasMirror {
  status: 'mirrored' | 'unavailable' | 'failed' | 'skipped';
  path: string | null;
  error: string | null;
  files: number;
  bytes: number;
  at: string;
}

export interface SocialKitOptions {
  /** Excerpt length (seconds) for the trimmed Reels/Feed cuts. */
  clipSec?: number;
  /** Where that excerpt starts (seconds into the recording). */
  clipStartSec?: number;
  /** How many non-overlapping excerpts to render (1–3). */
  clipCount?: number;
  /** Ratios to give that many cuts: 'reels' | 'feed' | 'youtube'. */
  clipRatios?: string[];
  /** Visualizer overlay on the video (replaces waveform). */
  visualizer?: {
    /** Enable visualizer overlay. */
    enabled: boolean;
    /** Visualizer type: 'waveform' | 'spectrum' | 'spectrogram' | 'vectorscope' | 'volume'. */
    type?: 'waveform' | 'spectrum' | 'spectrogram' | 'vectorscope' | 'volume';
    /** Mode depends on type: waveform: 'cline'|'p2p', spectrum: 'bar'|'line'|'dot', spectrogram: 'combined'|'separate', vectorscope: 'lissajous'|'lissajous_xy'|'polar'. */
    mode?: string;
    /** Color (hex string like '0xFFFFFF'). */
    color?: string;
    /** Background color for visualizer area (hex, optional). */
    background?: string;
    /** Width of visualizer area (px). */
    width?: number;
    /** Height of visualizer area (px). */
    height?: number;
    /** Margin from bottom (px). */
    marginBottom?: number;
    /** Spectrum: frequency scale 'lin'|'log'. Spectrogram: 'lin'|'log'|'bark'|'mel'. */
    fscale?: string;
    /** Spectrogram window size: 'w16'..'w8192'. */
    winSize?: string;
    /** Vectorscope zoom factor. */
    zoom?: number;
  };
  /** Title text overlay at bottom center. */
  titleOverlay?: {
    /** Enable title overlay. */
    enabled: boolean;
    /** Text to display (defaults to song title). */
    text?: string;
    /** Font family (sans-serif recommended). */
    font?: string;
    /** Font size in pixels. */
    fontSize?: number;
    /** Text color (hex string like 'white' or '#FFFFFF'). */
    color?: string;
    /** Background box color (hex with alpha like '0x000000AA'). */
    boxColor?: string;
    /** Padding around text (px). */
    boxBorderW?: number;
    /** Y position (ffmpeg expression, default: 'h-th-60'). */
    y?: string;
  };
}

/** Live progress for a kit build (in-memory on the bridge). */
export interface SocialBuildStatus {
  status: 'idle' | 'building' | 'done' | 'error';
  building: boolean;
  step?: string | null;
  startedAt?: number | null;
  finishedAt?: number | null;
  elapsedSec?: number;
  seconds?: number | null;
  folder?: string | null;
  videoCount?: number | null;
  /** NAS mirror state once the build finishes. */
  nas?: SocialNasMirror | null;
  error?: string | null;
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

  private async request<T>(endpoint: string, options: RequestInit = {}, timeoutMs = 15000): Promise<BridgeResponse<T>> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await this.fetchImpl(`${this.baseUrl}${endpoint}`, {
        ...options,
        headers,
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        // Bridge errors come back as JSON { success: false, error } — surface
        // the human-readable error instead of the whole serialized body.
        try {
          const parsed = JSON.parse(text);
          if (parsed && typeof parsed.error === 'string') {
            return { success: false, error: parsed.error, timestamp: parsed.timestamp || new Date().toISOString() };
          }
        } catch {
          // not JSON — fall through to raw text
        }
        return { success: false, error: `HTTP ${res.status}: ${text}`, timestamp: new Date().toISOString() };
      }

      return res.json();
    } catch (e: unknown) {
      // Never throw — every caller just shows res.error, so resolve to a
      // friendly failure instead. (This also stops unhandled rejections from
      // fire-and-forget callers like setMeldScene/openLogic/mountNas.)
      const err = e as Error | null;
      if (err?.name === 'AbortError' || err?.name === 'TimeoutError') {
        return { success: false, error: `Bridge request timed out after ${Math.round(timeoutMs / 1000)}s`, timestamp: new Date().toISOString() };
      }
      return {
        success: false,
        error: 'Local Bridge unreachable — it runs on your Mac. Start it with: pm2 start composer-hub-bridge',
        timestamp: new Date().toISOString(),
      };
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
    // The bridge runs the local script inline: finish_take/upload_audio are
    // capped at 120s server-side, sync_nas at 10min (NAS copies of Logic
    // bundles take a while). Give each mode just enough headroom so the
    // bridge's own timeout — which carries a real error message — always wins.
    const timeoutMs = req.mode === 'sync_nas' ? 610000 : 130000;
    return this.request<LaunchPickerResponse>('/workflow/launch', {
      method: 'POST',
      body: JSON.stringify(req),
    }, timeoutMs);
  }

  /** Create a local Logic project folder */
  async createLocalProject(title: string): Promise<BridgeResponse<{ name: string; folderName: string; path: string; message: string }>> {
    return this.request<{ name: string; folderName: string; path: string; message: string }>('/workflow/launch', {
      method: 'POST',
      body: JSON.stringify({ mode: 'create_local_project', title }),
    }, 30000);
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

  /** Open the song's folder in Finder on the Mac running the bridge */
  async openFinder(req: OpenFinderRequest): Promise<BridgeResponse<OpenFinderResponse>> {
    return this.request<OpenFinderResponse>('/finder/open', {
      method: 'POST',
      body: JSON.stringify(req),
    });
  }

  /** Open several folders in Finder at once (one call, one toast). */
  async openFinderPair(paths: string[], reveal = false): Promise<BridgeResponse<{ opened: { path: string; message: string }[]; failed: { path: string; error: string }[]; message: string }>> {
    return this.request<{ opened: { path: string; message: string }[]; failed: { path: string; error: string }[]; message: string }>('/finder/open-pair', {
      method: 'POST',
      body: JSON.stringify({ paths, reveal }),
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
    // The bridge tries up to three SMB hosts with waits in between (~30s worst
    // case) — the default 15s would give up while it was still mounting.
    return this.request<{ message: string; mounted: boolean; candidates: string[] }>('/nas/mount', { method: 'POST' }, 45000);
  }

  async getNasStatus(): Promise<BridgeResponse<NasStatusResponse>> {
    return this.request<NasStatusResponse>('/nas/status');
  }

  async getCaptures(): Promise<BridgeResponse<{ captures: LocalCapture[]; count: number }>> {
    return this.request<{ captures: LocalCapture[]; count: number }>('/captures');
  }

  async createCaptureEntry(name: string, opts?: { logicProjectPath?: string; title?: string }): Promise<BridgeResponse<{ id: string; title: string; originalName?: string; logicProjectPath?: string; message: string }>> {
    return this.request<{ id: string; title: string; originalName?: string; logicProjectPath?: string; message: string }>('/captures/create-entry', {
      method: 'POST',
      body: JSON.stringify({ name, ...opts }),
    });
  }

  /** List top-level Logic projects (Music/Logic) with size + NAS archive status */
  async getLogicProjects(): Promise<BridgeResponse<{ projects: LogicProject[]; nasListed: boolean; count: number }>> {
    // Sizes come from walking each bundle locally — usually fast, but give
    // it room on a cold cache.
    return this.request<{ projects: LogicProject[]; nasListed: boolean; count: number }>('/logic/projects', {}, 60000);
  }

  /** Archive a Logic project to the NAS Creation folder (copy + verify; local untouched)
 *  The folder name uses the project's session_date (YYYYMMDD) from the database,
 *  falling back to filesystem birth time if not set. */
  async archiveLogicProject(projectPath: string, opts: { datePrefix?: boolean } = {}): Promise<BridgeResponse<{ name: string; folderName: string; archivedTo: string; date: string | null; files: number; sizeMB: number; seconds: number; linkedRecord: string | null; message: string }>> {
    // rsync of a possibly multi-hundred-MB bundle over SMB — long leash.
    return this.request<{ name: string; folderName: string; archivedTo: string; date: string | null; files: number; sizeMB: number; seconds: number; linkedRecord: string | null; message: string }>('/logic/archive', {
      method: 'POST',
      body: JSON.stringify({ path: projectPath, datePrefix: opts.datePrefix !== false }),
    }, 31 * 60 * 1000);
  }

  /** Move a local Logic project to the Trash after re-verifying the NAS copy */
  async trashLocalLogicProject(projectPath: string, nasFolder?: string): Promise<BridgeResponse<{ name: string; freedMB: number; message: string }>> {
    // Verification stats the NAS copy over SMB before anything is deleted.
    return this.request<{ name: string; freedMB: number; message: string }>('/logic/trash-local', {
      method: 'POST',
      body: JSON.stringify({ path: projectPath, nasFolder }),
    }, 120000);
  }

  /** Delete a local folder directly (move to Trash). No NAS verification. */
  async deleteLocalFolder(folderPath: string): Promise<BridgeResponse<{ name: string; freedMB: number; message: string }>> {
    return this.request<{ name: string; freedMB: number; message: string }>('/logic/delete-folder', {
      method: 'POST',
      body: JSON.stringify({ folderPath }),
    }, 60000);
  }

  /** Get an existing social kit for a song (no rebuild). */
  async getSocialKit(improvisationId: string): Promise<BridgeResponse<SocialKit>> {
    return this.request<SocialKit>(`/social/kit?id=${encodeURIComponent(improvisationId)}`, {}, 30000);
  }

  /**
   * Build a song's social kit: artwork + platform-ready videos, staged on the
   * Mac's Desktop. Long-lead (art generation + up to three ffmpeg renders),
   * so this call gets a very generous leash.
   */
  async buildSocialKit(improvisationId: string, opts: SocialKitOptions = {}): Promise<BridgeResponse<SocialKit>> {
    return this.request<SocialKit>('/social/build-kit', {
      method: 'POST',
      body: JSON.stringify({ improvisationId, ...opts }),
    }, 25 * 60 * 1000);
  }

  /**
   * Poll a build's real progress. Cheap and safe to call while the build POST
   * is still open; older bridges return 404 and the UI falls back to the
   * narrated phases.
   */
  async getSocialBuildStatus(improvisationId: string): Promise<BridgeResponse<SocialBuildStatus>> {
    return this.request<SocialBuildStatus>(
      `/social/build-status?id=${encodeURIComponent(improvisationId)}`,
      {},
      10000,
    );
  }

  /**
   * Fetch a staged kit file (video/image) as a Blob so it can be previewed
   * in the browser. The bridge only serves files inside the Social folder.
   */
  async fetchSocialPreview(filePath: string): Promise<Blob | null> {
    const headers: Record<string, string> = {};
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;
    try {
      const res = await this.fetchImpl(
        `${this.baseUrl}/social/preview?p=${encodeURIComponent(filePath)}`,
        { headers },
      );
      if (!res.ok) return null;
      return await res.blob();
    } catch {
      return null;
    }
  }

  /** Save an edited caption back into the kit (file + manifest). */
  async saveSocialCaption(
    improvisationId: string,
    platform: SocialCaptionPlatform,
    text: string,
  ): Promise<BridgeResponse<{ path: string; platform: string; message: string }>> {
    return this.request<{ path: string; platform: string; message: string }>('/social/caption', {
      method: 'POST',
      body: JSON.stringify({ improvisationId, platform, text }),
    }, 30000);
  }

  /** Mark (or unmark) a platform as posted, kept locally in the kit. */
  async markSocialPosted(
    improvisationId: string,
    platform: SocialCaptionPlatform,
    posted = true,
  ): Promise<BridgeResponse<{ posted: Partial<Record<SocialCaptionPlatform, string>>; message: string }>> {
    return this.request<{ posted: Partial<Record<SocialCaptionPlatform, string>>; message: string }>(
      '/social/posted',
      { method: 'POST', body: JSON.stringify({ improvisationId, platform, posted }) },
      30000,
    );
  }
}

export interface LogicProject {
  name: string;
  path: string;
  mtime: number;
  files: number;
  sizeMB: number;
  archived: boolean;
  /** Absolute path of the archived folder on the NAS, when one exists. */
  nasFolder?: string | null;
  /** The date the archived folder carries (YYYY-MM-DD), when date-prefixed. */
  archivedDate?: string | null;
}

// Singleton instance for React hooks
export const bridgeClient = new BridgeClient();

// ============================================================================
// React Hook
// ============================================================================

import { useState, useCallback, useEffect, useRef } from 'react';
import { showSuccess, showError } from '@/utils/toast';

export function useLocalBridge() {
  const [client] = useState(() => bridgeClient);
  const [status, setStatus] = useState<BridgeStatusResponse | null>(null);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMode, setLoadingMode] = useState<string | null>(null);
  const [host, setHostState] = useState(() => bridgeClient.getHost());
  const [latency, setLatency] = useState<number | null>(null);
  const warnedOfflineRef = useRef(false); // one-shot console.info per offline transition

  const checkConnection = useCallback(async () => {
    const markOffline = () => {
      // Bridge offline is a normal state (e.g. opened on another machine or
      // via composerhub.vercel.app) — degrade silently instead of spamming
      // the console every 30s. Only warn once per offline transition.
      setConnected(false);
      setStatus(null);
      setLatency(null);
      if (!warnedOfflineRef.current) {
        warnedOfflineRef.current = true;
        console.info('[LocalBridge] Bridge offline — running in web-only mode. Start it with: pm2 start composer-hub-bridge');
      }
    };
    try {
      const start = Date.now();
      const res = await client.ping();
      if (!res.success) {
        markOffline();
        return;
      }
      setLatency(Date.now() - start);
      setConnected(true);
      warnedOfflineRef.current = false; // any success resets the one-shot warning
      const statusRes = await client.getStatus();
      if (statusRes.success && statusRes.data) {
        setStatus(statusRes.data);
      }
    } catch {
      markOffline();
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

  const createLocalProject = async (title: string) => {
    try {
      const res = await client.createLocalProject(title);
      if (res.success) {
        showSuccess(res.data?.message || 'Local project created');
        return res.data;
      } else {
        showError(res.error || 'Failed to create local project');
      }
    } catch (e) {
      showError(String(e));
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

  const openFinder = async (folderPath: string) => {
    return openFolderInFinder(folderPath);
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
      setTimeout(checkConnection, 3000);
    } else {
      showError(res.error || 'Mount failed');
    }
    return res;
  };

  const getCaptures = async () => {
    return client.getCaptures();
  };

  const createCaptureEntry = async (name: string, opts?: { logicProjectPath?: string; title?: string }) => {
    return client.createCaptureEntry(name, opts);
  };

  const getLogicProjects = async () => {
    return client.getLogicProjects();
  };

  const archiveLogicProject = async (projectPath: string, opts?: { datePrefix?: boolean }) => {
    return client.archiveLogicProject(projectPath, opts);
  };

  const trashLocalLogicProject = async (projectPath: string, nasFolder?: string) => {
    return client.trashLocalLogicProject(projectPath, nasFolder);
  };

  const deleteLocalFolder = async (folderPath: string) => {
    return client.deleteLocalFolder(folderPath);
  };

  const getSocialKit = async (improvisationId: string) => {
    return client.getSocialKit(improvisationId);
  };

  const buildSocialKit = async (improvisationId: string, opts?: SocialKitOptions) => {
    return client.buildSocialKit(improvisationId, opts);
  };

  return {
    client,
    connected,
    status,
    loading,
    loadingMode,
    checkConnection,
    launchPicker,
    createLocalProject,
    setMeldScene,
    openLogic,
    openFinder,
    getSyncStatus,
    configureToken,
    mountNas,
    getCaptures,
    createCaptureEntry,
    getLogicProjects,
    archiveLogicProject,
    trashLocalLogicProject,
    deleteLocalFolder,
    getSocialKit,
    buildSocialKit,
    setBridgeHost,
    host,
    latency,
    hasToken: client.hasToken(),
  };
}

/**
 * Fire-and-forget: open a song's folder in Finder on the Mac running the
 * Local Bridge. Toasts the result — success path or a readable reason it
 * failed (bridge offline, NAS unmounted, folder missing).
 *
 * Uses the singleton bridgeClient directly rather than useLocalBridge so it
 * can be called from any component without adding another status poller.
 */
export async function openFolderInFinder(folderPath: string): Promise<boolean> {
  if (!folderPath) return false;
  try {
    const res = await bridgeClient.openFinder({ path: folderPath });
    if (res.success) {
      showSuccess(res.data?.message || `Opened in Finder: ${folderPath}`);
      return true;
    }
    showError(res.error || 'Could not open the folder in Finder');
    return false;
  } catch {
    showError('Local Bridge unreachable — it runs on your Mac. Start it with: pm2 start composer-hub-bridge');
    return false;
  }
}

/**
 * Open several folders in Finder with a single bridge call. Reports which
 * opened and which did not, so one unmounted volume (e.g. the NAS at home but
 * not on the road) never hides the folder that did open.
 */
export async function openFoldersInFinder(folderPaths: string[]): Promise<boolean> {
  const paths = folderPaths.filter(Boolean);
  if (paths.length === 0) return false;
  // A single path is just the plain helper, so the toast stays specific.
  if (paths.length === 1) return openFolderInFinder(paths[0]);
  try {
    const res = await bridgeClient.openFinderPair(paths);
    const opened = res.data?.opened || [];
    const failed = res.data?.failed || [];
    if (opened.length > 0) {
      const names = opened.map((o) => o.path.split('/').filter(Boolean).pop() || o.path);
      if (failed.length > 0) {
        showSuccess(`Opened ${names.join(' + ')} — ${failed[0].error}`);
      } else {
        showSuccess(`Opened ${names.join(' + ')} in Finder`);
      }
      return true;
    }
    showError(res.error || failed[0]?.error || 'Could not open those folders in Finder');
    return false;
  } catch {
    showError('Local Bridge unreachable — it runs on your Mac. Start it with: pm2 start composer-hub-bridge');
    return false;
  }
}

/** Local Logic projects directory (mirrors LOGIC_PROJECTS_DIR in the bridge). */
export const LOGIC_PROJECTS_DIR = '/Users/danielebuatti/Music/Logic';
/** NAS creation folder — deep-composition projects live here (mirrors NAS_CREATION_DIR). */
export const NAS_CREATION_DIR = '/Volumes/Moon Prism/DBP/Creation';


/**
 * Reveal a single staged file in Finder (selected inside its folder), so it
 * can be dragged straight into a platform's upload page. Same toast semantics
 * as openFolderInFinder.
 */
export async function revealInFinder(filePath: string): Promise<boolean> {
  if (!filePath) return false;
  try {
    const res = await bridgeClient.openFinder({ path: filePath, reveal: true });
    if (res.success) {
      showSuccess(res.data?.message || `Revealed in Finder: ${filePath}`);
      return true;
    }
    showError(res.error || 'Could not reveal that file in Finder');
    return false;
  } catch {
    showError('Local Bridge unreachable — it runs on your Mac. Start it with: pm2 start composer-hub-bridge');
    return false;
  }
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
            setItems(prev => prev.map(item => item.id === payload.new.id ? (payload.new as RealtimeSyncItem) : item));
          } else if (payload.eventType === 'DELETE' && payload.old) {
            setItems(prev => prev.filter(item => item.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchInitial]);

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