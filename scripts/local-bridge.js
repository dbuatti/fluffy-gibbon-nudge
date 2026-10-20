#!/usr/bin/env node
'use strict';

/**
 * local-bridge.js — HTTP bridge server for Composer Hub ↔ Local Scripts
 *
 * Runs on the user's Mac (127.0.0.1:34567) and exposes endpoints that the
 * web app (https://composerhub.vercel.app) can call to launch workflows,
 * control Meld/Logic, and query sync status.
 *
 * Config: ~/.config/composer-hub/bridge-config.json
 *   {
 *     "token": "shared-secret-hex",
 *     "port": 34567,
 *     "allowedOrigins": ["https://composerhub.vercel.app", "http://localhost:5173"]
 *   }
 *
 * First run: generates config if missing, prints token for web app setup.
 *
 * Depends on: Node 18+ (built-in fetch), composer-hub.js, meld-scene.js, finish-take.js
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { spawn, execFile, spawnSync } from 'child_process';
import os from 'os';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import net from 'net';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG_DIR = path.join(os.homedir(), '.config', 'composer-hub');
const CONFIG_FILE = path.join(CONFIG_DIR, 'bridge-config.json');
const SCRIPTS_DIR = __dirname; // ~/Music/Logic/_Scripts
const START_TIME = Date.now();

// Top-level Logic projects (not _Captures — those are handled by sync-to-nas)
// can be archived to the NAS: copied into DBP/Creation/<name>/, verified
// file-by-file, and optionally trashed locally so they can leave this Mac.
const LOGIC_PROJECTS_DIR = '/Users/danielebuatti/Music/Logic';
const NAS_CREATION_DIR = '/Volumes/Moon Prism/DBP/Creation';

let config = null;

// ============================================================================
// Config Management
// ============================================================================

function loadConfig() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }

  if (!fs.existsSync(CONFIG_FILE)) {
    // Generate new token and config
    const token = Array.from(crypto.randomBytes(32))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    config = {
      token,
      port: 34567,
      bindHost: '127.0.0.1',
      allowedOrigins: ['https://composerhub.vercel.app', 'https://music.danielebuatti.com', 'http://localhost:5173', 'http://localhost:8080'],
    };
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
    fs.chmodSync(CONFIG_FILE, 0o600);
    console.log('🔐 Generated new bridge config:');
    console.log(JSON.stringify(config, null, 2));
    console.log('');
    console.log('📋 In the web app (composerhub.vercel.app), run in console:');
    console.log(`localStorage.setItem('composer-hub-bridge-token', '${token}')`);
    console.log('');
    console.log('Or use the "Set Up Bridge Connection" button in the sidebar.');
  } else {
    try {
      config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
      if (!config.bindHost) config.bindHost = '127.0.0.1';
    } catch (e) {
      console.error('Failed to parse config, regenerating:', e.message);
      // Regenerate
      const token = Array.from(crypto.randomBytes(32)).map(b => b.toString(16).padStart(2, '0')).join('');
      config = { token, port: 34567, bindHost: '127.0.0.1', allowedOrigins: ['https://composerhub.vercel.app', 'http://localhost:5173'] };
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
      fs.chmodSync(CONFIG_FILE, 0o600);
    }
  }
  return config;
}

// ============================================================================
// Helpers
// ============================================================================

function getAllowedOrigin(req) {
  const origin = req && req.headers ? req.headers.origin : null;
  if (origin && config.allowedOrigins.includes(origin)) return origin;
  return null;
}

function sendJson(res, statusCode, data, req) {
  const allowOrigin = getAllowedOrigin(req);
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Vary': 'Origin',
  };
  if (allowOrigin) headers['Access-Control-Allow-Origin'] = allowOrigin;
  res.writeHead(statusCode, headers);
  res.end(JSON.stringify(data));
}

function requireAuth(req, res) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    sendJson(res, 401, { success: false, error: 'Missing or invalid Authorization header', timestamp: new Date().toISOString() }, req);
    return false;
  }
  const token = auth.slice(7);
  // Constant-time compare — cheap hardening against timing side channels.
  const expected = Buffer.from(config.token);
  const provided = Buffer.from(token);
  if (expected.length !== provided.length || !crypto.timingSafeEqual(expected, provided)) {
    sendJson(res, 403, { success: false, error: 'Invalid token', timestamp: new Date().toISOString() }, req);
    return false;
  }
  return true;
}

function runScript(scriptName, args = [], timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(SCRIPTS_DIR, scriptName);
    const child = spawn('node', ['--no-warnings', scriptPath, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error(`Script timed out after ${Math.round(timeoutMs / 1000)}s`)); }, timeoutMs);
    child.stdout.on('data', d => stdout += d);
    child.stderr.on('data', d => stderr += d);
    child.on('close', code => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout.trim());
      else reject(new Error((stderr || stdout || `Exit code ${code}`).trim()));
    });
    child.on('error', err => { clearTimeout(timer); reject(err); });
  });
}

function runAppleScript(script) {
  return new Promise((resolve, reject) => {
    const child = spawn('osascript', ['-e', script], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('AppleScript timed out after 30s')); }, 30000);
    child.stdout.on('data', d => stdout += d);
    child.stderr.on('data', d => stderr += d);
    child.on('close', code => {
      clearTimeout(timer);
      code === 0 ? resolve(stdout.trim()) : reject(new Error(stderr));
    });
    child.on('error', err => { clearTimeout(timer); reject(err); });
  });
}

async function checkMeldConnected() {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(1500);
    socket.on('connect', () => { socket.destroy(); resolve(true); });
    socket.on('timeout', () => { socket.destroy(); resolve(false); });
    socket.on('error', () => { socket.destroy(); resolve(false); });
    socket.connect(13376, '127.0.0.1');
  });
}

async function checkLogicRunning() {
  try {
    const { stdout } = await new Promise((resolve, reject) => {
      execFile('osascript', ['-e', 'tell application "System Events" to count (processes whose name is "Logic Pro")'], (err, stdout) => err ? reject(err) : resolve({ stdout }));
    });
    return parseInt(stdout.trim(), 10) > 0;
  } catch {
    return false;
  }
}

async function checkNasMounted() {
  const nasPath = '/Volumes/Moon Prism';
  try {
    await fs.promises.access(nasPath, fs.constants.R_OK | fs.constants.W_OK);
    const stat = await fs.promises.stat(nasPath);
    if (!stat.isDirectory()) return false;
    const testFile = path.join(nasPath, '.composer-hub-write-test');
    await fs.promises.writeFile(testFile, 'test');
    await fs.promises.unlink(testFile);
    return true;
  } catch {
    return false;
  }
}

async function checkTailscaleConnected() {
  const tailscalePaths = [
    '/Applications/Tailscale.app/Contents/MacOS/Tailscale',
    '/usr/local/bin/tailscale',
    'tailscale',
  ];
  for (const tsPath of tailscalePaths) {
    try {
      const { stdout } = await new Promise((resolve, reject) => {
        execFile(tsPath, ['status', '--json'], (err, stdout) => {
          if (err) reject(err);
          else resolve({ stdout });
        });
      });
      const status = JSON.parse(stdout);
      return status.BackendState === 'Running';
    } catch {
      // Try next path
    }
  }
  return false;
}

async function checkNasReachable() {
  // Check if NAS IP is reachable via Tailscale or local network
  const ips = ['100.124.90.53', '192.168.1.102'];
  for (const ip of ips) {
    try {
      await new Promise((resolve, reject) => {
        const socket = new net.Socket();
        socket.setTimeout(2000);
        socket.on('connect', () => { socket.destroy(); resolve(true); });
        socket.on('timeout', () => { socket.destroy(); reject(new Error('timeout')); });
        socket.on('error', (e) => { socket.destroy(); reject(e); });
        socket.connect(445, ip); // SMB port
      });
      return { reachable: true, ip };
    } catch {
      // Try next IP
    }
  }
  return { reachable: false, ip: null };
}

// --- NAS resilience ---------------------------------------------------------
// Switching networks (Wi-Fi → hotspot) leaves the SMB mount listed but its
// handles stale: files still stat fine from cache while reads fail with
// ENOENT. Verify with a real read, repair the mount, and stage audio locally
// so a blip mid-render can't break a build.

const NAS_MOUNT_PATH = '/Volumes/Moon Prism';
const NAS_SMB_HOSTS = ['100.124.90.53', 'Crystal-Tokyo.local', '192.168.1.102'];

/** True only if the bytes can actually be read — not just a cached stat. */
function isFileReadable(file, bytes = 16) {
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    const buf = Buffer.alloc(bytes);
    return fs.readSync(fd, buf, 0, bytes, 0) > 0;
  } catch {
    return false;
  } finally {
    if (fd !== undefined) { try { fs.closeSync(fd); } catch { /* ignore */ } }
  }
}

/**
 * Recover from a stale SMB mount. Unmounts the dead handle and remounts via
 * Finder so the login keychain supplies credentials. Returns true when the
 * mount is readable again (probeFile, when given, must read).
 */
async function repairNasMount(probeFile) {
  console.warn('[nas] mount looks stale — attempting a clean remount…');
  try {
    await runProcess('diskutil', ['unmount', 'force', NAS_MOUNT_PATH], { timeoutMs: 30000 });
  } catch (e) {
    console.warn(`[nas] unmount: ${e.message.split('\n')[0]}`);
  }

  for (const host of NAS_SMB_HOSTS) {
    try {
      await runProcess('osascript', ['-e', `mount volume "smb://${host}/Moon Prism"`], { timeoutMs: 25000 });
      await new Promise((r) => setTimeout(r, 1500));
      if (!probeFile || isFileReadable(probeFile)) {
        console.log(`[nas] remounted via ${host}`);
        return true;
      }
    } catch (e) {
      console.warn(`[nas] remount via ${host}: ${e.message.split('\n')[0]}`);
    }
  }

  console.error('[nas] remount did not restore access');
  return false;
}

/**
 * Copy a NAS file to local temp storage before rendering. Builds can stream
 * audio for minutes; over SMB one network blip kills the whole render. A
 * local copy removes that failure mode and reads much faster.
 */
async function stageAudioLocally(sourceFile) {
  if (!isFileReadable(sourceFile)) {
    const reachable = await checkNasReachable();
    if (!reachable.reachable) {
      throw new Error(
        `NAS unreachable (${path.dirname(sourceFile)}). You may have switched networks — ` +
        `reconnect so 100.124.90.53 (Tailscale) or the NAS's LAN is reachable, then rebuild.`,
      );
    }
    await repairNasMount(sourceFile);
  }

  const tmp = path.join(
    os.tmpdir(),
    `social-audio-${Date.now()}${path.extname(sourceFile).toLowerCase() || '.mp3'}`,
  );
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      fs.copyFileSync(sourceFile, tmp);
      if (!fs.statSync(tmp).size) throw new Error('copy produced 0 bytes');
      return tmp;
    } catch (e) {
      console.warn(`[social] audio copy attempt ${attempt} failed: ${e.message}`);
      if (attempt < 3) await repairNasMount(sourceFile);
    }
  }

  throw new Error(
    `Could not read the audio at ${sourceFile}. The NAS mount looks stale — ` +
    `usually after switching networks (e.g. Wi-Fi → hotspot). Repair the mount and rebuild.`,
  );
}

async function handleMountNas(req, res) {
  const smbCandidates = [
    { host: '100.124.90.53', url: 'smb://100.124.90.53/Moon%20Prism' },
    { host: 'Crystal-Tokyo.local', url: 'smb://Crystal-Tokyo.local/Moon%20Prism' },
    { host: '192.168.1.102', url: 'smb://192.168.1.102/Moon%20Prism' },
  ];

  try {
    // A stale mount left behind by a network switch blocks remounting. Detect
    // it (mountpoint exists but fails the write test) and clear it first.
    if (fs.existsSync(NAS_MOUNT_PATH) && !(await checkNasMounted())) {
      console.warn('[nas] stale mount detected — clearing before remount');
      await repairNasMount();
    }

    // Method 1: Silent mount via mount_smbfs (fastest, no Finder needed)
    // Tries Tailscale IP first, then Bonjour, then local IP
    for (const c of smbCandidates) {
      try {
        await new Promise((resolve, reject) => {
          execFile('mount_smbfs', [`//guest@${c.host}/Moon%20Prism`, '/Volumes/Moon Prism'], { timeout: 8000 }, (err) => {
            if (err) reject(err);
            else resolve(true);
          });
        });
        // Give the mount a moment to settle
        await new Promise(r => setTimeout(r, 1000));
        if (await checkNasMounted()) {
          sendJson(res, 200, {
            success: true,
            data: { message: `NAS mounted via Tailscale (${c.host}) — no Finder needed.`, mounted: true, method: 'mount_smbfs', host: c.host },
            timestamp: new Date().toISOString(),
          }, req);
          return;
        }
      } catch {
        // mount_smbfs failed (probably needs auth) — try next
      }
    }

    // Method 2: Fallback to Finder mount dialog (handles Keychain auth)
    execFile('open', [smbCandidates[0].url], (err) => {
      if (err) execFile('open', [smbCandidates[2].url], () => {});
    });
    await new Promise(r => setTimeout(r, 2500));
    const mounted = await checkNasMounted();
    sendJson(res, 200, {
      success: true,
      data: {
        message: mounted
          ? 'NAS mounted successfully.'
          : 'Mount dialog opened in Finder. Complete authentication if prompted, then the NAS will appear.',
        mounted,
        method: 'finder',
        candidates: smbCandidates.map(c => c.url),
      },
      timestamp: new Date().toISOString(),
    }, req);
  } catch (e) {
    sendJson(res, 500, { success: false, error: e.message, timestamp: new Date().toISOString() }, req);
  }
}

async function handleNasStatus(req, res) {
  try {
    const [mounted, tailscale, reachability] = await Promise.all([
      checkNasMounted(),
      checkTailscaleConnected(),
      checkNasReachable(),
    ]);
    // A mount can exist while its handles are stale (network switch): the
    // directory may be listed from cache but reads fail. Report that
    // explicitly so the UI can offer a repair instead of looking healthy.
    let readable = false;
    if (fs.existsSync(NAS_MOUNT_PATH)) {
      try { readable = fs.readdirSync(NAS_MOUNT_PATH).length > 0; } catch { readable = false; }
    }
    sendJson(res, 200, {
      success: true,
      data: {
        mounted,
        readable,
        // "mounted but stale" is the dangerous state — surface it plainly.
        stale: !mounted && fs.existsSync(NAS_MOUNT_PATH),
        nasPath: mounted ? NAS_MOUNT_PATH : null,
        tailscaleConnected: tailscale,
        nasReachable: reachability.reachable,
        nasIp: reachability.ip,
        nasCandidates: ['100.124.90.53', '192.168.1.102', 'Crystal-Tokyo.local'],
      },
      timestamp: new Date().toISOString(),
    }, req);
  } catch (e) {
    sendJson(res, 500, { success: false, error: e.message, timestamp: new Date().toISOString() }, req);
  }
}

async function handleCreateCaptureEntry(req, res, body) {
  const { name, logicProjectPath, title } = body;
  if (!name) {
    sendJson(res, 400, { success: false, error: 'Missing capture name', timestamp: new Date().toISOString() }, req);
    return;
  }
  try {
    // Same creation path as the Workflow Picker CLI (composer-hub.js) —
    // one source of truth for title formatting, original_name, and metadata.
    const hub = await import('./composer-hub.js');
    const fullPath = logicProjectPath || path.join('/Users/danielebuatti/Music/Logic/_Captures', name);
    // Custom title wins; otherwise derive from the folder name (strip date prefix + .logicx)
    const derivedTitle = name.replace(/\.logicx$/, '').replace(/^\d{6,8}[-\s]*/, '').trim() || name;
    const result = await hub.captureIdea(title || derivedTitle, {
      logicProjectPath: fullPath,
      workflowMode: 'piano_improvisation',
    });
    if (result.success) {
      sendJson(res, 200, {
        success: true,
        data: {
          id: result.id,
          title: title || derivedTitle,
          originalName: result.originalName,
          logicProjectPath: fullPath,
          message: 'Entry created with folder link',
        },
        timestamp: new Date().toISOString(),
      }, req);
    } else {
      sendJson(res, 500, { success: false, error: result.error, timestamp: new Date().toISOString() }, req);
    }
  } catch (e) {
    sendJson(res, 500, { success: false, error: e.message, timestamp: new Date().toISOString() }, req);
  }
}

/**
 * Auto-configure endpoint: receives a new token from the web app,
 * writes it to the bridge config file, and restarts the bridge via pm2.
 * Called by the "Auto-configure" button — zero manual steps.
 */
async function handleBridgeConfigure(req, res, body) {
  const token = typeof body?.token === 'string' && body.token.length >= 32 ? body.token.trim() : null;
  if (!token) {
    sendJson(res, 400, { success: false, error: 'Missing or invalid token (must be 32+ hex chars)' }, req);
    return;
  }
  try {
    // Update in-memory config
    config.token = token;
    // Persist to disk
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
    fs.chmodSync(CONFIG_FILE, 0o600);
    console.log(`🔐 Bridge token updated via auto-configure`);
    // Respond first, then restart
    sendJson(res, 200, { success: true, message: 'Token saved — restarting bridge…' }, req);
    // Give the response time to flush, then restart via pm2
    setTimeout(() => {
      spawn('pm2', ['restart', 'composer-hub-bridge'], { detached: true, stdio: 'ignore' }).unref();
    }, 500);
  } catch (e) {
    console.error(`[bridge/configure] Failed: ${e.message}`);
    sendJson(res, 500, { success: false, error: `Failed to save token: ${e.message}` }, req);
  }
}

async function handleCreateLogicEntry(req, res, body) {
  const folderPath = typeof body?.path === 'string' ? body.path.trim() : '';
  if (!folderPath) {
    sendJson(res, 400, { success: false, error: 'Missing folder path', timestamp: new Date().toISOString() }, req);
    return;
  }
  try {
    const hub = await import('./composer-hub.js');
    const derivedTitle = path.basename(folderPath).replace(/\.logicx$/, '').replace(/^\d{6,8}[-\s]*/, '').trim() || path.basename(folderPath);
    const result = await hub.captureIdea(body?.title || derivedTitle, {
      logicProjectPath: folderPath,
      workflowMode: 'piano_improvisation',
    });
    if (result.success) {
      sendJson(res, 200, {
        success: true,
        data: {
          id: result.id,
          title: body?.title || derivedTitle,
          originalName: result.originalName,
          logicProjectPath: folderPath,
          message: 'Entry created with folder link',
        },
        timestamp: new Date().toISOString(),
      }, req);
    } else {
      sendJson(res, 500, { success: false, error: result.error, timestamp: new Date().toISOString() }, req);
    }
  } catch (e) {
    sendJson(res, 500, { success: false, error: e.message, timestamp: new Date().toISOString() }, req);
  }
}

async function handleListCaptures(req, res) {
  const CAPTURES_DIR = '/Users/danielebuatti/Music/Logic/_Captures';
  try {
    if (!fs.existsSync(CAPTURES_DIR)) {
      sendJson(res, 200, { success: true, data: { captures: [], count: 0 }, timestamp: new Date().toISOString() }, req);
      return;
    }
    const entries = fs.readdirSync(CAPTURES_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory() && d.name.endsWith('.logicx'))
      .map(d => {
        const fullPath = path.join(CAPTURES_DIR, d.name);
        const stat = fs.statSync(fullPath);
        return {
          name: d.name,
          stem: d.name.replace(/\.logicx$/, ''),
          fullPath,
          mtime: stat.mtimeMs,
          createdAt: stat.birthtime.toISOString(),
          inApp: false, // filled in below when we can match against Supabase
          improvisationId: null,
        };
      })
      .sort((a, b) => b.mtime - a.mtime);

    // Best-effort: mark which captures already have an app entry, by matching
    // original_name (new records) or logic_project_path (older ones). Fails
    // silently to offline mode if not logged in — the capture list still works.
    try {
      const hub = await import('./composer-hub.js');
      const session = await hub.getSession();
      if (session) {
        const r = await fetch(`${hub.SUPABASE_URL}/rest/v1/improvisations?user_id=eq.${encodeURIComponent(session.user_id)}&select=id,original_name,logic_project_path`, {
          headers: { 'apikey': hub.ANON_KEY, 'Authorization': `Bearer ${session.access_token}` },
        });
        if (r.ok) {
          const rows = await r.json();
          for (const e of entries) {
            const match = rows.find(row =>
              (row.original_name && row.original_name === e.stem) ||
              (row.logic_project_path && row.logic_project_path.includes(e.name))
            );
            if (match) {
              e.inApp = true;
              e.improvisationId = match.id;
            }
          }
        }
      }
    } catch { /* offline / not logged in — list still returns */ }

    sendJson(res, 200, {
      success: true,
      data: { captures: entries, count: entries.length },
      timestamp: new Date().toISOString(),
    }, req);
  } catch (e) {
    sendJson(res, 500, { success: false, error: e.message, timestamp: new Date().toISOString() }, req);
  }
}

async function handlePing(req, res) {
  sendJson(res, 200, { success: true, data: { pong: true }, timestamp: new Date().toISOString() }, req);
}

async function handleStatus(req, res) {
  const [meldConnected, logicRunning, nasMounted, tailscaleConnected, nasDetail] = await Promise.all([
    checkMeldConnected(),
    checkLogicRunning(),
    checkNasMounted(),
    checkTailscaleConnected(),
    (async () => {
      try {
        const reachable = await checkNasReachable();
        let readable = false;
        if (fs.existsSync(NAS_MOUNT_PATH)) {
          try { readable = fs.readdirSync(NAS_MOUNT_PATH).length > 0; } catch { readable = false; }
        }
        const stale = fs.existsSync(NAS_MOUNT_PATH) && !nasMounted;
        return { readable, stale, nasReachable: reachable.reachable, nasIp: reachable.ip };
      } catch {
        return { readable: false, stale: false, nasReachable: false, nasIp: null };
      }
    })(),
  ]);
  sendJson(res, 200, {
    success: true,
    data: {
      bridge: 'ok',
      version: '1.1.0',
      uptimeSeconds: Math.floor((Date.now() - START_TIME) / 1000),
      meldConnected,
      logicRunning,
      nasMounted,
      nasReadable: nasDetail.readable,
      nasStale: nasDetail.stale,
      nasReachable: nasDetail.nasReachable,
      nasIp: nasDetail.nasIp,
      tailscaleConnected,
      nasPath: nasMounted ? '/Volumes/Moon Prism' : undefined,
      config: { port: config.port, bindHost: config.bindHost || '127.0.0.1', allowedOrigins: config.allowedOrigins },
    paths: { logicProjectsDir: LOGIC_PROJECTS_DIR, nasCreationDir: NAS_CREATION_DIR },
    },
    timestamp: new Date().toISOString(),
  }, req);
}

async function handleLaunchPicker(req, res, body) {
  const { mode, title, sound, film, projectName, videoTitle } = body;

  try {
    let result;

    switch (mode) {
      case 'tiktok':
      case 'ig_story': {
        const script = `
          tell application "Workflow Picker.app"
            activate
          end tell
          delay 0.5
          tell application "System Events"
            tell process "Workflow Picker"
              keystroke "${mode === 'tiktok' ? '1' : '2'}"
            end tell
          end tell
        `;
        await runAppleScript(script);
        result = { launched: true, message: `${mode} workflow triggered via Workflow Picker` };
        break;
      }

      case 'piano_improvisation': {
        const script = `
          tell application "Workflow Picker.app"
            activate
          end tell
          delay 0.5
          tell application "System Events"
            tell process "Workflow Picker"
              keystroke "3"
            end tell
          end tell
        `;
        await runAppleScript(script);
        result = { launched: true, message: 'Piano Improvisation workflow triggered' };
        break;
      }

      case 'deep_composition': {
        const script = `
          tell application "Workflow Picker.app"
            activate
          end tell
          delay 0.5
          tell application "System Events"
            tell process "Workflow Picker"
              keystroke "4"
            end tell
          end tell
        `;
        await runAppleScript(script);
        result = { launched: true, message: 'Deep Composition workflow triggered' };
        break;
      }

      case 'finish_take': {
        const args = videoTitle ? [videoTitle] : [];
        const output = await runScript('finish-take.js', args);
        const videoPathMatch = output.match(/VIDEO_PATH: (.+)/);
        result = {
          launched: true,
          message: output.split('\n')[0],
          videoPath: videoPathMatch ? videoPathMatch[1] : null,
        };
        break;
      }

      case 'upload_audio': {
        const output = await runScript('finish-take.js', ['--upload-audio-only']);
        result = {
          launched: true,
          message: 'Audio upload initiated',
          output: output.split('\n')[0],
        };
        break;
      }

      case 'sync_nas': {
        // NAS copies of Logic bundles can take many minutes — give this mode a
        // long leash (the client matches with an even larger timeout).
        const output = await runScript('sync-to-nas.js', ['--apply'], 600000);
        result = {
          launched: true,
          message: 'NAS sync initiated',
          output: output.split('\n')[0],
        };
        break;
      }

      case 'create_local_project': {
        const projectTitle = typeof body.title === 'string' ? body.title.trim() : '';
        if (!projectTitle) {
          sendJson(res, 400, { success: false, error: 'Missing project title', timestamp: new Date().toISOString() }, req);
          return;
        }
        
        // Create the local Logic project folder
        const sanitized = projectTitle.replace(/[:\/]/g, '-').replace(/\s+/g, ' ').trim();
        const datePrefix = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const folderName = `${datePrefix} ${sanitized}`;
        const projectDir = path.join(LOGIC_PROJECTS_DIR, `${folderName}.logicx`);
        
        if (fs.existsSync(projectDir)) {
          sendJson(res, 409, { success: false, error: `Project already exists: ${projectDir}`, timestamp: new Date().toISOString() }, req);
          return;
        }
        
        // Create the .logicx package structure
        fs.mkdirSync(projectDir, { recursive: true });
        fs.mkdirSync(path.join(projectDir, 'Alternatives'), { recursive: true });
        fs.mkdirSync(path.join(projectDir, 'Media'), { recursive: true });
        fs.mkdirSync(path.join(projectDir, 'Resources'), { recursive: true });
        
        // Create a basic ProjectInformation.plist
        const plistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>BundleVersion</key>
    <integer>2</integer>
    <key>HasProjectFolder</key>
    <false/>
    <key>LastSavedFrom</key>
    <string>Logic Pro</string>
    <key>projectAssetFlags</key>
    <integer>8265</integer>
    <key>VariantNames</key>
    <dict>
        <key>0</key>
        <string>${sanitized}</string>
    </dict>
    <key>VariantNamesV2</key>
    <dict>
        <key>0</key>
        <string>{PROJECT_NAME}</string>
    </dict>
    <key>WasOnceSavedFromLPX</key>
    <true/>
</dict>
</plist>`;
        
        fs.writeFileSync(path.join(projectDir, 'Resources', 'ProjectInformation.plist'), plistContent);
        
        // Create a basic Alternatives/000 folder with empty files
        const altDir = path.join(projectDir, 'Alternatives', '000');
        fs.mkdirSync(altDir, { recursive: true });
        fs.writeFileSync(path.join(altDir, 'ProjectData'), '');
        fs.writeFileSync(path.join(altDir, 'DisplayState.plist'), '');
        fs.writeFileSync(path.join(altDir, 'MetaData.plist'), '');
        
        console.log(`[logic/create-local-project] Created project: ${projectDir}`);
        
        result = {
          success: true,
          data: {
            name: sanitized,
            folderName: folderName,
            path: projectDir,
            message: `Created local Logic project: ${projectDir}`,
          },
          timestamp: new Date().toISOString(),
        };
        break;
      }

      default:
        sendJson(res, 400, { success: false, error: `Unknown mode: ${mode}`, timestamp: new Date().toISOString() }, req);
        return;
    }

    sendJson(res, 200, {
      success: true,
      data: { launched: true, mode, message: result.message, ...result },
      timestamp: new Date().toISOString(),
    }, req);
  } catch (e) {
    sendJson(res, 500, { success: false, error: e.message, timestamp: new Date().toISOString() }, req);
  }
}

async function handleMeldScene(req, res, body) {
  try {
    const { scene } = body;
    if (!scene) throw new Error('Missing scene name');
    await runScript('meld-scene.js', [scene]);
    sendJson(res, 200, {
      success: true,
      data: { success: true, scene, message: `Meld scene switched to ${scene}` },
      timestamp: new Date().toISOString(),
    }, req);
  } catch (e) {
    sendJson(res, 500, { success: false, error: e.message, timestamp: new Date().toISOString() }, req);
  }
}

async function handleOpenLogic(req, res, body) {
  try {
    const { projectPath } = body;
    if (!projectPath) throw new Error('Missing projectPath');
    const safePath = String(projectPath).replace(/"/g, '\\"');
    await runAppleScript(`tell application "Finder" to open POSIX file "${safePath}"`);
    sendJson(res, 200, {
      success: true,
      data: { success: true, projectPath, message: `Opened Logic project: ${projectPath}` },
      timestamp: new Date().toISOString(),
    }, req);
  } catch (e) {
    sendJson(res, 500, { success: false, error: e.message, timestamp: new Date().toISOString() }, req);
  }
}

/**
 * Open a single absolute path in Finder. Throws with a human-readable reason.
 * Shared by /finder/open and /finder/open-pair.
 */
async function openPathInFinder(rawPath, wantsReveal) {
  if (!rawPath) throw new Error('Missing path');
  if (!rawPath.startsWith('/') || rawPath.includes('\u0000')) {
    throw new Error('Path must be an absolute POSIX path');
  }

  // A .logicx bundle always opens as its containing folder. Anything else is
  // opened as a folder, or — with reveal: true — selected in its folder, so
  // a single staged file can be dragged straight into an upload page.
  let targetPath = rawPath.endsWith('.logicx') ? path.dirname(rawPath) : rawPath;
  targetPath = targetPath.replace(/\/+$/, '');
  if (!targetPath) throw new Error('Could not resolve folder from path');

  // SMB mounts can be stale for a moment right after connecting (Finder
  // already shows the volume, but stat() on deep paths fails) — wait
  // briefly and retry once before concluding anything.
  const existsWithRetry = async (p) => {
    if (fs.existsSync(p)) return true;
    await new Promise((resolve) => setTimeout(resolve, 750));
    return fs.existsSync(p);
  };

  if (!(await existsWithRetry(targetPath))) {
    const volume = targetPath.startsWith('/Volumes/') ? targetPath.split('/')[2] : null;
    if (volume) {
      if (fs.existsSync(`/Volumes/${volume}`)) {
        throw new Error(`Volume is mounted, but the folder isn't there anymore: ${targetPath} — was it moved or renamed?`);
      }
      throw new Error(`Folder not reachable — volume "${volume}" is not mounted. Use "Mount NAS" and try again.`);
    }
    throw new Error(`Folder not found on this Mac: ${targetPath}`);
  }

  const stat = await fs.promises.stat(targetPath);
  const isFolder = stat.isDirectory();
  if (!isFolder && !wantsReveal) throw new Error(`Not a folder: ${targetPath}`);

  await new Promise((resolve, reject) => {
    execFile('open', isFolder ? [targetPath] : ['-R', targetPath], { timeout: 10000 },
      (err) => (err ? reject(err) : resolve()));
  });

  const message = isFolder
    ? `Opened in Finder: ${targetPath}`
    : `Revealed in Finder: ${path.basename(targetPath)}`;
  return { targetPath, message };
}

/**
 * POST /finder/open — open the song's folder in Finder.
 * Accepts either a folder path or a .logicx bundle path (the bundle's parent
 * directory is opened, since .logicx is a package, not a browsable folder).
 */
async function handleFinderOpen(req, res, body) {
  try {
    const { targetPath, message } = await openPathInFinder(
      typeof body.path === 'string' ? body.path.trim() : '',
      body.reveal === true,
    );
    sendJson(res, 200, {
      success: true,
      data: { success: true, path: targetPath, message },
      timestamp: new Date().toISOString(),
    }, req);
  } catch (e) {
    console.error(`[finder/open] failed for "${typeof body.path === 'string' ? body.path : '(no path)'}": ${e.message}`);
    sendJson(res, 500, { success: false, error: e.message, timestamp: new Date().toISOString() }, req);
  }
}

/**
 * POST /finder/open-pair — open several folders at once (used by the
 * "Open Logic + Creation" shortcut). Each path is opened independently, so one
 * unmounted volume never stops the others; the response reports what worked.
 *
 * Body: { paths: string[], reveal?: boolean }
 */
async function handleFinderOpenPair(req, res, body) {
  const paths = Array.isArray(body.paths) ? body.paths.filter((p) => typeof p === 'string' && p.trim()) : [];
  if (paths.length === 0) {
    sendJson(res, 400, { success: false, error: 'Missing paths', timestamp: new Date().toISOString() }, req);
    return;
  }

  const opened = [];
  const failed = [];
  for (const raw of paths) {
    try {
      const { targetPath, message } = await openPathInFinder(raw.trim(), body.reveal === true);
      opened.push({ path: targetPath, message });
    } catch (e) {
      failed.push({ path: raw.trim(), error: e.message });
    }
  }

  // Success if at least one window opened; the caller shows which failed.
  sendJson(res, opened.length ? 200 : 500, {
    success: opened.length > 0,
    data: { opened, failed, message: `${opened.length} of ${paths.length} folders opened in Finder` },
    ...(opened.length ? {} : { error: failed[0]?.error || 'No folders could be opened' }),
    timestamp: new Date().toISOString(),
  }, req);
}


async function handleSyncStatus(req, res, query) {
  try {
    // Use composer-hub.js getSyncSummary
    const { getSyncSummary } = await import('./composer-hub.js');
    const options = {
      limit: query.limit ? parseInt(query.limit, 10) : 50,
      status: query.status,
      workflowMode: query.workflowMode,
    };
    const result = await getSyncSummary(options);
    if (!result.success) {
      sendJson(res, 500, { success: false, error: result.error, timestamp: new Date().toISOString() }, req);
      return;
    }
    sendJson(res, 200, {
      success: true,
      data: result.data,
      timestamp: new Date().toISOString(),
    }, req);
  } catch (e) {
    sendJson(res, 500, { success: false, error: e.message, timestamp: new Date().toISOString() }, req);
  }
}

// ============================================================================
// Archive to NAS (top-level Logic projects)
// ============================================================================

/**
 * Best-effort creation date for a Logic project, as YYYYMMDD.
 *
 * Logic's own bundle metadata does *not* carry a usable date (the date fields
 * in ProjectData/MetaData.plist are zeroed), so the filesystem's birth time —
 * the moment the .logicx was first created — is the most truthful source.
 * Falls back to mtime, then to today. Never throws: a date prefix is a nicety.
 */
function resolveProjectDate(sourcePath) {
  try {
    const stat = fs.statSync(sourcePath);
    const ms = stat.birthtimeMs && stat.birthtimeMs > 0 ? stat.birthtimeMs : stat.mtimeMs;
    if (ms && ms > 0) return new Date(ms).toISOString().slice(0, 10).replace(/-/g, '');
  } catch { /* unreadable — fall through to today */ }
  return new Date().toISOString().slice(0, 10).replace(/-/g, '');
}

/**
 * Find the NAS folder holding a project's archived copy. A folder counts when
 * it is named exactly `<name>` (un-dated archives) or ends with ` <name>` after
 * a leading date (the dated form, e.g. "20261007 COSMIC DRONE" — matching the
 * existing convention in DBP/Creation). Returns the absolute path, or null.
 */
function findNasArchiveFolder(name) {
  if (!fs.existsSync(NAS_CREATION_DIR)) return null;
  const datedSuffix = ` ${name}`;
  let match = null;
  try {
    for (const d of fs.readdirSync(NAS_CREATION_DIR, { withFileTypes: true })) {
      if (!d.isDirectory()) continue;
      if (d.name === name) {
        // Exact, un-dated folder wins immediately — it is unambiguous.
        return path.join(NAS_CREATION_DIR, d.name);
      }
      if (d.name.endsWith(datedSuffix)) {
        // Keep the newest if several dates somehow exist for one project.
        const full = path.join(NAS_CREATION_DIR, d.name);
        if (!match || fs.statSync(full).mtimeMs > fs.statSync(match).mtimeMs) match = full;
      }
    }
  } catch { return match; }
  return match;
}

/** Recursive { files, bytes } for a folder tree — the basis of archive verification. */
function measureTree(rootPath) {
  let files = 0;
  let bytes = 0;
  const stack = [rootPath];
  while (stack.length) {
    const dir = stack.pop();
    let list;
    try {
      list = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of list) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) stack.push(p);
      else if (entry.isFile()) {
        files += 1;
        try { bytes += fs.statSync(p).size; } catch { /* raced away */ }
      } else if (entry.isSymbolicLink()) {
        files += 1; // rsync -a preserves symlinks — count them on both sides
      }
    }
  }
  return { files, bytes };
}

/**
 * Validates a request path: a real .logicx bundle directly inside Music/Logic.
 * Deliberately strict — captures are excluded (they belong to sync-to-nas),
 * and nothing outside this one folder can ever be copied or trashed.
 */
function resolveArchivePath(rawPath) {
  if (!rawPath || !rawPath.startsWith('/') || rawPath.includes('\u0000')) {
    throw new Error('Missing or invalid project path');
  }
  if (!rawPath.endsWith('.logicx')) throw new Error('Not a Logic project (.logicx)');
  if (path.dirname(rawPath) !== LOGIC_PROJECTS_DIR) {
    throw new Error(`Only projects directly in ${LOGIC_PROJECTS_DIR} can be archived — captures are handled by "Sync to NAS"`);
  }
  if (!fs.existsSync(rawPath) || !fs.statSync(rawPath).isDirectory()) {
    throw new Error(`Project not found on this Mac: ${rawPath}`);
  }
  return rawPath;
}

async function handleLogicProjects(req, res) {
  try {
    const projects = fs.readdirSync(LOGIC_PROJECTS_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory() && d.name.endsWith('.logicx'))
      .map((d) => {
        const fullPath = path.join(LOGIC_PROJECTS_DIR, d.name);
        const stat = fs.statSync(fullPath);
        const m = measureTree(fullPath);
        return {
          name: d.name.replace(/\.logicx$/, ''),
          path: fullPath,
          mtime: stat.mtimeMs,
          files: m.files,
          sizeMB: Math.round((m.bytes / (1024 * 1024)) * 10) / 10,
        };
      })
      .sort((a, b) => b.mtime - a.mtime);

    // "Archived" = a matching folder exists in the NAS Creation dir. Folders
    // may be date-prefixed ("2026-10-07 - COSMIC DRONE"), so a plain name
    // comparison is not enough — discover the real folder and report it, so
    // the UI can open it and the trash action can find it later.
    let nasListed = false;
    try {
      nasListed = fs.existsSync(NAS_CREATION_DIR);
    } catch { /* NAS not mounted — archive status stays unknown */ }

    // Fetch session_date + id from database for all projects in one query
    let sessionDates = new Map();
    let linkedIds = new Map();
    try {
      const hub = await import('./composer-hub.js');
      const session = await hub.getSession();
      if (session) {
        const headers = { apikey: hub.ANON_KEY, Authorization: `Bearer ${session.access_token}` };
        const paths = projects.map(p => p.path);
        // Build OR query for all paths
        const orQuery = paths.map(p => `logic_project_path.eq.${encodeURIComponent(p)}`).join(',');
        const findRes = await fetch(`${hub.SUPABASE_URL}/rest/v1/improvisations?or=(${orQuery})&select=id,logic_project_path,session_date`, {
          headers,
          signal: AbortSignal.timeout(10000),
        });
        if (findRes.ok) {
          const matches = await findRes.json();
          for (const m of matches) {
            if (m.logic_project_path) {
              linkedIds.set(m.logic_project_path, m.id);
              if (m.session_date) sessionDates.set(m.logic_project_path, m.session_date);
            }
          }
        }
      }
    } catch { /* non-fatal */ }

    for (const p of projects) {
      const nasFolder = nasListed ? findNasArchiveFolder(p.name) : null;
      p.archived = !!nasFolder;
      p.nasFolder = nasFolder;
      p.linked = linkedIds.has(p.path);
      p.linkedId = linkedIds.get(p.path) || null;
      // The date the folder carries: prefer database session_date, then folder name, then null
      if (sessionDates.has(p.path)) {
        p.archivedDate = sessionDates.get(p.path); // Already in YYYY-MM-DD format
      } else if (nasFolder) {
        const base = path.basename(nasFolder);
        const m = /^(\d{4})(\d{2})(\d{2}) /.exec(base);
        p.archivedDate = m ? `${m[1]}-${m[2]}-${m[3]}` : null;
      }
    }

    sendJson(res, 200, {
      success: true,
      data: { projects, nasListed, count: projects.length },
      timestamp: new Date().toISOString(),
    }, req);
  } catch (e) {
    sendJson(res, 500, { success: false, error: e.message, timestamp: new Date().toISOString() }, req);
  }
}

function copyProjectToNas(source, { datePrefix = true, sessionDate = null } = {}) {
  const name = path.basename(source, '.logicx');
  if (!fs.existsSync(NAS_CREATION_DIR)) {
    throw new Error('NAS not mounted (Moon Prism). Use "Mount NAS" first, then retry.');
  }

  // Date-prefixed by default so the Creation folder reads chronologically.
  // Format matches the existing convention there: "20261007 COSMIC DRONE".
  let date = null;
  if (datePrefix) {
    if (sessionDate) {
      // Use the database's session_date (YYYY-MM-DD -> YYYYMMDD)
      date = sessionDate.replace(/-/g, '');
    } else {
      // Fallback to filesystem birth time
      try {
        const stat = fs.statSync(source);
        const ms = stat.birthtimeMs && stat.birthtimeMs > 0 ? stat.birthtimeMs : stat.mtimeMs;
        if (ms && ms > 0) date = new Date(ms).toISOString().slice(0, 10).replace(/-/g, '');
      } catch { /* fall through to today */ }
      if (!date) date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    }
  }
  const folderName = datePrefix ? `${date} ${name}` : name;

  const existing = findNasArchiveFolder(name);
  if (existing) {
    throw new Error(`"${name}" already has a folder on the NAS: ${existing}`);
  }

  const targetFolder = path.join(NAS_CREATION_DIR, folderName);
  console.log(`[logic/archive] ${name}: copying bundle to ${targetFolder} …`);
  fs.mkdirSync(targetFolder, { recursive: true });
  const startedAt = Date.now();

  // No trailing slash on the source: copy the .logicx bundle itself into the
  // new folder, so the result is <folder>/<name>.logicx/… and reopens in Logic.
  const copy = spawnSync('rsync', ['-a', source, `${targetFolder}/`], {
    encoding: 'utf-8',
    timeout: 30 * 60 * 1000,
  });
  if (copy.error || copy.status !== 0) {
    fs.rmSync(targetFolder, { recursive: true, force: true });
    throw new Error(`Copy failed: ${(copy.stderr || (copy.error && copy.error.message) || 'unknown rsync error').trim()}`);
  }

  const local = measureTree(source);
  const remote = measureTree(targetFolder);
  if (local.files !== remote.files || local.bytes !== remote.bytes) {
    fs.rmSync(targetFolder, { recursive: true, force: true });
    throw new Error(`Verification failed (expected ${local.files} files / ${local.bytes} bytes, NAS has ${remote.files} / ${remote.bytes}) — partial copy removed, local project untouched`);
  }

  return {
    name,
    folderName,
    targetFolder,
    files: local.files,
    bytes: local.bytes,
    date,
    seconds: Math.round((Date.now() - startedAt) / 100) / 10,
  };
}

/** Link an app record to its new NAS folder. Best-effort; never fails a copy. */
async function linkRecordToNas(source, targetFolder) {
  try {
    const hub = await import('./composer-hub.js');
    const session = await hub.getSession();
    if (!session) return null;
    const headers = { apikey: hub.ANON_KEY, Authorization: `Bearer ${session.access_token}` };
    const findRes = await fetch(`${hub.SUPABASE_URL}/rest/v1/improvisations?logic_project_path=eq.${encodeURIComponent(source)}&select=id`, {
      headers,
      signal: AbortSignal.timeout(15000),
    });
    if (!findRes.ok) return null;
    const [match] = await findRes.json();
    if (!match) return null;
    const patchRes = await fetch(`${hub.SUPABASE_URL}/rest/v1/improvisations?id=eq.${match.id}`, {
      method: 'PATCH',
      headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ nas_folder_path: targetFolder }),
      signal: AbortSignal.timeout(15000),
    });
    return patchRes.ok ? match.id : null;
  } catch {
    return null; // linking is a nicety, not the archive
  }
}

async function handleLogicArchive(req, res, body) {
  try {
    const source = resolveArchivePath(typeof body.path === 'string' ? body.path.trim() : '');
    // Date prefix is on by default; the UI can switch it off per archive.
    const datePrefix = body.datePrefix !== false;

    // Fetch session_date from the database for this project
    let sessionDate = null;
    try {
      const hub = await import('./composer-hub.js');
      const session = await hub.getSession();
      if (session) {
        const headers = { apikey: hub.ANON_KEY, Authorization: `Bearer ${session.access_token}` };
        const findRes = await fetch(`${hub.SUPABASE_URL}/rest/v1/improvisations?logic_project_path=eq.${encodeURIComponent(source)}&select=session_date`, {
          headers,
          signal: AbortSignal.timeout(10000),
        });
        if (findRes.ok) {
          const [match] = await findRes.json();
          if (match?.session_date) sessionDate = match.session_date;
        }
      }
    } catch { /* non-fatal */ }

    const result = copyProjectToNas(source, { datePrefix, sessionDate });

    const sizeMB = Math.round((result.bytes / (1024 * 1024)) * 10) / 10;
    console.log(`[logic/archive] ${result.name}: verified — ${result.files} files, ${sizeMB} MB in ${result.seconds}s → ${result.folderName}`);

    const linkedRecord = await linkRecordToNas(source, result.targetFolder);
    const dateNote = result.date ? ` dated ${result.date}` : '';

    sendJson(res, 200, {
      success: true,
      data: {
        name: result.name,
        folderName: result.folderName,
        archivedTo: result.targetFolder,
        date: result.date,
        files: result.files,
        sizeMB,
        seconds: result.seconds,
        linkedRecord,
        message: `Archived + verified${dateNote}: ${result.folderName} → Moon Prism (${sizeMB} MB in ${result.seconds}s)`,
      },
      timestamp: new Date().toISOString(),
    }, req);
  } catch (e) {
    console.error(`[logic/archive] ${e.message}`);
    sendJson(res, 500, { success: false, error: e.message, timestamp: new Date().toISOString() }, req);
  }
}

async function handleTrashLocal(req, res, body) {
  try {
    const source = resolveArchivePath(typeof body.path === 'string' ? body.path.trim() : '');
    const name = path.basename(source, '.logicx');
    // Folders may be date-prefixed, so discover the real one rather than
    // assuming a name. An explicit nasFolder from the client wins if given.
    const requested = typeof body.nasFolder === 'string' ? body.nasFolder.trim() : '';
    const nasFolder = requested && requested.startsWith(NAS_CREATION_DIR)
      ? requested
      : findNasArchiveFolder(name);
    if (!nasFolder) {
      throw new Error(`No archived copy found for "${name}" in ${NAS_CREATION_DIR} — archive it first`);
    }
    if (!fs.existsSync(nasFolder)) {
      throw new Error(`The archived folder is missing: ${nasFolder} — archive it again before removing the local copy`);
    }

    // Re-verify right before deleting anything: same file count + bytes.
    const local = measureTree(source);
    const remote = measureTree(nasFolder);
    if (local.files !== remote.files || local.bytes !== remote.bytes) {
      throw new Error(`NAS copy does not match the local project (${remote.files} files / ${remote.bytes} bytes vs ${local.files} / ${local.bytes}) — not removing anything`);
    }

    // Move to the Trash via Finder instead of rm — recoverable until the
    // Trash is emptied, so a mis-click is never fatal.
    const escaped = source.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    await runAppleScript(`tell application "Finder" to delete (POSIX file "${escaped}" as alias)`);

    const sizeMB = Math.round((local.bytes / (1024 * 1024)) * 10) / 10;
    console.log(`[logic/trash-local] ${name}: moved to Trash (${sizeMB} MB freed — verified copy on NAS)`);
    sendJson(res, 200, {
      success: true,
      data: {
        name,
        freedMB: sizeMB,
        message: `Moved "${name}" to the Trash — ${sizeMB} MB freed. Recoverable from Finder until you empty the Trash.`,
      },
      timestamp: new Date().toISOString(),
    }, req);
  } catch (e) {
    console.error(`[logic/trash-local] ${e.message}`);
    sendJson(res, 500, { success: false, error: e.message, timestamp: new Date().toISOString() }, req);
  }
}

/**
 * POST /logic/delete-folder — delete a local folder (move to Trash) directly.
 * Body: { folderPath: string }
 * Used for deleting a Logic project folder by its direct path.
 */
async function handleDeleteFolder(req, res, body) {
  try {
    const folderPath = typeof body.folderPath === 'string' ? body.folderPath.trim() : '';
    if (!folderPath || !folderPath.startsWith('/')) {
      throw new Error('Missing or invalid folderPath (must be absolute)');
    }
    if (!fs.existsSync(folderPath)) {
      throw new Error(`Folder not found: ${folderPath}`);
    }
    const stat = fs.statSync(folderPath);
    if (!stat.isDirectory()) {
      throw new Error(`Not a folder: ${folderPath}`);
    }

    // Move to Trash via Finder
    const escaped = folderPath.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    await runAppleScript(`tell application "Finder" to delete (POSIX file "${escaped}" as alias)`);

    const sizeMB = Math.round((stat.size / (1024 * 1024)) * 10) / 10;
    const name = path.basename(folderPath);
    console.log(`[logic/delete-folder] ${name}: moved to Trash (${sizeMB} MB)`);
    sendJson(res, 200, {
      success: true,
      data: {
        name,
        freedMB: sizeMB,
        message: `Moved "${name}" to the Trash — ${sizeMB} MB freed. Recoverable from Finder until you empty the Trash.`,
      },
      timestamp: new Date().toISOString(),
    }, req);
  } catch (e) {
    console.error(`[logic/delete-folder] ${e.message}`);
    sendJson(res, 500, { success: false, error: e.message, timestamp: new Date().toISOString() }, req);
  }
}

// ============================================================================
// Social Kit — song → artwork + ratio-ready videos, staged for posting
// ============================================================================

// Where finished kits land. Desktop so drag-and-drop into an upload tab is
// one motion — the whole point is "post with minimal thought".
const SOCIAL_OUTPUT_DIR = '/Users/danielebuatti/Desktop/Social';
// Durable second copy on the NAS. Rendering deliberately does *not* write here
// directly: this is an SMB mount that can drop mid-encode, and a 20-minute
// render failing at minute 18 because the share vanished is not worth the
// saving. Desktop is the working copy; this is the archive that outlives it.
const SOCIAL_NAS_DIR = '/Volumes/Moon Prism/DBP/Social';
// maxSec = the longest clip that platform accepts (0 = no limit, keep the
// whole song); defaultSec = the excerpt length used when a recording is too
// long. Both orientations now carry the FULL recording — the kit is a delivery
// format (portrait for short-form, landscape for YouTube), not a trimming tool,
// so excerpting is opt-in per build via clipSec/clipStartSec.
const SOCIAL_RATIOS = [
  { key: 'reels',   label: 'Portrait (9:16)',  w: 1080, h: 1920, fileSuffix: '9x16', maxSec: 0, defaultSec: 0, multipleClips: false },
  { key: 'youtube', label: 'Landscape (16:9)', w: 1920, h: 1080, fileSuffix: '16x9', maxSec: 0, defaultSec: 0, multipleClips: false },
];

/** Ratios that the app should offer multiple cuts for. */
const SOCIAL_CLIP_RATIOS = SOCIAL_RATIOS.filter((r) => r.multipleClips).map((r) => r.key);

// Bump when the composed frame or encode changes — old renders then re-render
// instead of being reused by the fingerprint check.
const SOCIAL_RENDER_VERSION = 4;

// Live build state, keyed by improvisation id. The build request can run for
// several minutes, so the app polls this to show the actual step (and to
// recover the progress after a page reload). Entries expire so a long-lived
// bridge doesn't accumulate one per song.
const socialBuildJobs = new Map();
const SOCIAL_JOB_TTL_MS = 30 * 60 * 1000;

function pruneSocialBuildJobs() {
  const cutoff = Date.now() - SOCIAL_JOB_TTL_MS;
  for (const [id, job] of socialBuildJobs) {
    if ((job.updatedAt || 0) < cutoff) socialBuildJobs.delete(id);
  }
}

function updateSocialBuildJob(id, patch) {
  const previous = socialBuildJobs.get(id) || {};
  const job = {
    ...previous,
    ...patch,
    id,
    updatedAt: Date.now(),
  };
  socialBuildJobs.set(id, job);
  if (socialBuildJobs.size > 50) pruneSocialBuildJobs();
  return job;
}

/** 95 → "1:35" */
function formatTime(sec) {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Per-second loudness profile (RMS dB) for excerpt picking. Decoding audio
 * only is fast even for a 24-minute file — a few seconds — and it lets the
 * kit cut the passage that actually goes somewhere instead of an arbitrary
 * percentage. Returns null when analysis fails (caller falls back).
 */
async function audioLoudnessProfile(audioFile) {
  try {
    const { stdout } = await runProcess('ffmpeg', [
      '-hide_banner', '-nostdin', '-loglevel', 'error',
      '-i', audioFile,
      '-af', 'aresample=8000,asetnsamples=8000,astats=metadata=1:reset=1,' +
        'ametadata=print:key=lavfi.astats.Overall.RMS_level:file=-',
      '-f', 'null', '-',
    ], { timeoutMs: 180000 });

    const levels = [];
    for (const line of stdout.split('\n')) {
      const m = line.match(/RMS_level=\s*(-?[\d.]+|-?inf)/i);
      if (!m) continue;
      const v = /inf/i.test(m[1]) ? -100 : Number(m[1]);
      if (Number.isFinite(v)) levels.push(v);
    }
    return levels.length >= 10 ? levels : null;
  } catch (e) {
    console.warn(`[social] loudness profile unavailable: ${e.message.split('\n')[0]}`);
    return null;
  }
}

/**
 * Score every possible window once, then take the strongest non-overlapping
 * starts. Overlapping cuts of the same passage are useless for posting, so
 * each selection blocks its neighbours (plus a small gap).
 */
function pickBestExcerptStarts(profile, clipSec, durationSec, count) {
  if (count <= 0) return [];
  const latestStart = Math.max(0, durationSec - clipSec);

  // No analysis: spread the cuts across the piece instead of repeating 15%.
  if (!profile) {
    const base = Math.min(Math.round(durationSec * 0.15), latestStart);
    return Array.from({ length: count }, (_, i) =>
      Math.min(latestStart, Math.round(base + i * durationSec * 0.3)),
    );
  }

  const maxStart = Math.min(latestStart, profile.length - clipSec);
  if (maxStart <= 0) return [0];

  const margin = Math.min(5, Math.floor(durationSec * 0.01));
  // Window barely longer than the requested clip: no room to dodge the edges.
  if (maxStart <= margin) return [maxStart];

  // Keep the cut clear of the recording's final fade-out. A 90s clip that
  // ends in near-silence feels unfinished, even if the middle is strong.
  const tailMargin = Math.min(10, Math.max(2, Math.round(durationSec * 0.01)));
  const lastSafeStart = durationSec - clipSec - tailMargin;
  const maxScored = lastSafeStart > margin ? Math.min(maxStart, lastSafeStart) : maxStart;
  // First/last few seconds decide whether a cut "enters" cleanly. Penalise
  // silence at the edges, but only gently: plenty of piano passages begin
  // quietly without being a bad excerpt.
  const edge = Math.max(1, Math.min(5, Math.floor(clipSec * 0.08)));

  const scores = new Float64Array(maxStart + 1);
  for (let start = margin; start <= maxScored; start++) {
    let power = 0;
    let quiet = 0;
    let headQuiet = 0;
    let tailQuiet = 0;
    const headEnd = start + edge;
    const tailStart = start + clipSec - edge;
    for (let i = start; i < start + clipSec; i++) {
      // dB → linear power, so one loud spike can't mask a mostly-quiet window.
      power += Math.pow(10, profile[i] / 10);
      if (profile[i] < -50) {
        quiet++;
        if (i < headEnd) headQuiet++;
        if (i >= tailStart) tailQuiet++;
      }
    }
    const edgeQuality = Math.max(0.05, 1 - 0.45 * (headQuiet / edge) - 0.2 * (tailQuiet / edge));
    scores[start] = (power / clipSec) * (1 - 0.5 * (quiet / clipSec)) * edgeQuality;
  }

  const blocked = new Uint8Array(maxStart + 1);
  const chosen = [];
  const gap = Math.max(5, Math.round(clipSec * 0.1));
  for (let n = 0; n < count; n++) {
    let best = -1;
    let bestScore = -Infinity;
    for (let start = margin; start <= maxScored; start++) {
      if (!blocked[start] && scores[start] > bestScore) {
        bestScore = scores[start];
        best = start;
      }
    }
    if (best < 0) break;
    chosen.push(best);
    const from = Math.max(0, best - clipSec - gap);
    const to = Math.min(maxStart, best + clipSec + gap);
    for (let start = from; start <= to; start++) blocked[start] = 1;
  }
  return chosen;
}

/**
 * The cuts for one ratio: [{ startSec, clipSec, auto, idea }]. Long songs get
 * `count` non-overlapping excerpts (strongest first); a manual start pins the
 * first cut and the rest are picked around it. Short songs and the 16:9
 * YouTube cut always return a single full-length take.
 */
function pickExcerptCuts(durationSec, ratio, requestedSec, requestedStartSec, profile, count = 1) {
  if (!ratio.maxSec) return [{ startSec: 0, clipSec: durationSec, auto: false, idea: false }];

  const clipSec = Math.min(
    requestedSec || Math.min(ratio.defaultSec, ratio.maxSec),
    ratio.maxSec,
    durationSec,
  );
  if (durationSec <= clipSec) return [{ startSec: 0, clipSec: durationSec, auto: false, idea: false }];

  const latestStart = Math.max(0, durationSec - clipSec);
  const auto = requestedStartSec == null;
  const picked = pickBestExcerptStarts(profile, Math.round(clipSec), durationSec, count + 1);

  let starts;
  if (requestedStartSec != null) {
    const manual = Math.min(Math.max(0, Math.round(requestedStartSec)), latestStart);
    starts = [manual, ...picked.filter((s) => Math.abs(s - manual) >= clipSec * 1.05)].slice(0, count);
  } else {
    starts = picked.slice(0, count);
  }

  // The spacing fallback can clamp several picks to the same last start.
  starts = [...new Set(starts)].slice(0, count);
  const ideaRatio = ratio.key === 'reels';
  return starts.map((startSec) => ({ startSec, clipSec, auto, idea: ideaRatio }));
}

/** Promisified execFile with a generous timeout — ffmpeg on a full song. */
function runProcess(cmd, args, { timeoutMs = 10 * 60 * 1000 } = {}) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        const detail = (stderr || err.message || '').split('\n').filter(Boolean).slice(-6).join(' | ');
        reject(new Error(`${cmd} failed: ${detail}`));
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}

/** Media duration in seconds (0 if unreadable). */
async function mediaDurationSec(file) {
  try {
    const { stdout } = await runProcess('ffprobe', [
      '-v', 'error', '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1', file,
    ], { timeoutMs: 30000 });
    return Math.round(parseFloat(stdout.trim())) || 0;
  } catch {
    return 0;
  }
}

/** SHA-1 of a file's bytes — used to notice artwork replaced at the same URL. */
function fileHash(file) {
  try {
    return crypto.createHash('sha1').update(fs.readFileSync(file)).digest('hex');
  } catch {
    return null;
  }
}

/** A reusable render must exist, be non-trivial, and have the right length. */
async function isVideoUsable(file, expectedSec) {
  try {
    if (!fs.existsSync(file)) return false;
    if (fs.statSync(file).size < 100 * 1024) return false;
    const actual = await mediaDurationSec(file);
    if (!actual) return false;
    // ffprobe is rounded to whole seconds and the encoder can land a frame
    // early, so allow a small tolerance rather than re-rendering over ±1s.
    return Math.abs(actual - Math.round(expectedSec)) <= 3;
  } catch {
    return false;
  }
}

/** Free bytes on the volume holding `dir` (null when unavailable). */
function availableBytes(dir) {
  try {
    const stats = fs.statfsSync(dir);
    return stats.bavail * stats.bsize;
  } catch {
    return null;
  }
}

/** "20261017 Surviving The Storm" → "Surviving The Storm" for display/folders. */
function stripDatePrefix(name) {
  return (name || '').replace(/^\d{8}\s+/, '').trim() || (name || 'Untitled');
}

/** Filesystem-safe folder name. */
function safeFolderName(name) {
  return (name || 'Untitled').replace(/[/\\:\0]/g, '-').replace(/\s+/g, ' ').trim();
}

/**
 * Locate the MP3 for a song. Preference order:
 *  1. The NAS Creation folder (nas_folder_path) — "(1.0)" wins, then newest.
 *  2. The Supabase storage copy (storage_path), downloaded to a temp file.
 */
async function findSocialAudio(session, record) {
  if (record.nas_folder_path && fs.existsSync(record.nas_folder_path)) {
    const AUDIO_EXT = ['.mp3', '.m4a', '.wav', '.aac', '.aif', '.aiff'];
    const clips = fs.readdirSync(record.nas_folder_path)
      .filter((f) => AUDIO_EXT.includes(path.extname(f).toLowerCase()))
      .map((f) => {
        const full = path.join(record.nas_folder_path, f);
        const ext = path.extname(f).toLowerCase();
        return {
          full,
          mtime: fs.statSync(full).mtimeMs,
          // A finished "(1.0)" take always beats raw DAW bounces and takes.
          preferred: /\(1\.\d+\)/.test(f) ? 2 : ext === '.mp3' ? 1 : 0,
        };
      })
      .sort((a, b) => (b.preferred - a.preferred) || (b.mtime - a.mtime));
    if (clips.length) {
      const picked = clips[0].full;
      return { file: await stageAudioLocally(picked), source: 'nas', original: picked };
    }
  }

  if (record.storage_path) {
    const hub = await import('./composer-hub.js');
    const url = `${hub.SUPABASE_URL}/storage/v1/object/public/piano_improvisations/${record.storage_path}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(60000) });
    if (res.ok) {
      const tmp = path.join(os.tmpdir(), `social-audio-${Date.now()}.mp3`);
      fs.writeFileSync(tmp, Buffer.from(await res.arrayBuffer()));
      return { file: tmp, source: 'storage' };
    }
  }

  throw new Error(
    record.nas_folder_path
      ? `No MP3 found in ${record.nas_folder_path} — is the NAS mounted?`
      : 'No audio found for this song (no NAS folder, no uploaded file).',
  );
}

// Last-resort prompt. Deliberately bland: if the tailored prompt trips
// Cloudflare's content filter, this one still produces a usable cover.
const ART_PROMPT_SAFE =
  'Abstract calming album artwork, soft organic flowing shapes, gentle diffused light, ' +
  'muted dreamy palette, smooth gradients, painterly, no text, no logos, no geometric patterns, no people';

/**
 * Build a cover prompt from the song title — WITHOUT embedding the title.
 * Cloudflare's filter is unpredictable on words like "storm", and a rejected
 * prompt must never block a build. The title only seeds the choices, so the
 * same song always gets the same art while different songs vary.
 */
function buildArtPrompt(title) {
  const hash = [...(title || '')].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  const shapes = [
    'soft organic flowing shapes',
    'slow rippling waves of colour',
    'drifting mist and gentle light',
    'tender overlapping brushstrokes',
  ];
  const palettes = [
    'muted dusk palette of dusty rose and deep indigo',
    'pale morning palette of soft cream and sage green',
    'twilight palette of lavender, slate blue and warm amber',
    'quiet palette of misty teal, blush and warm grey',
  ];
  return `Abstract calming album artwork for a piano improvisation, ` +
    `${shapes[hash % shapes.length]}, ${palettes[hash % palettes.length]}, ` +
    `painterly, soft focus, serene, no text, no logos, no geometric patterns, no people`;
}

/**
 * Ensure there's artwork to render with:
 *  - reuse improvisations.artwork_url when set (download it), else
 *  - generate via the existing FLUX edge function, upload to Storage, and
 *    write artwork_url back so the song page shows it too.
 */
async function ensureSocialArtwork(session, record, title) {
  const hub = await import('./composer-hub.js');
  const headers = {
    apikey: hub.ANON_KEY,
    Authorization: `Bearer ${session.access_token}`,
  };

  const downloadToFile = async (url, ext) => {
    const res = await fetch(url, { signal: AbortSignal.timeout(60000) });
    if (!res.ok) throw new Error(`Could not download existing artwork (HTTP ${res.status})`);
    const tmp = path.join(os.tmpdir(), `social-art-${Date.now()}.${ext}`);
    fs.writeFileSync(tmp, Buffer.from(await res.arrayBuffer()));
    return tmp;
  };

  if (record.artwork_url) {
    try {
      const ext = record.artwork_url.toLowerCase().includes('.jpg') ? 'jpg' : 'png';
      return { file: await downloadToFile(record.artwork_url, ext), source: 'existing' };
    } catch (e) {
      console.warn(`[social] existing artwork unusable (${e.message}) — generating fresh`);
    }
  }

  const prompt = record.artwork_prompt || buildArtPrompt(title);

  // Try the tailored prompt, then fall back to the bland one — a content
  // filter rejection should degrade to "slightly generic cover", never to
  // "build failed".
  const attempts = [prompt, ART_PROMPT_SAFE].filter((p, i, a) => p && a.indexOf(p) === i);
  let generated = null;
  let lastError = null;
  for (const attempt of attempts) {
    console.log(`[social] generating artwork via FLUX: ${attempt.substring(0, 70)}…`);
    const genRes = await fetch(`${hub.SUPABASE_URL}/functions/v1/generate-ai-artwork`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: attempt }),
      signal: AbortSignal.timeout(120000),
    });
    const gen = await genRes.json().catch(() => ({}));
    if (genRes.ok && gen.image) {
      generated = { image: gen.image, prompt: attempt };
      break;
    }
    lastError = gen.error || `Artwork generation failed (HTTP ${genRes.status})`;
    console.warn(`[social] artwork attempt rejected: ${lastError}`);
  }
  if (!generated) throw new Error(lastError || 'Artwork generation failed');
  const usedPrompt = generated.prompt;

  const png = Buffer.from(generated.image, 'base64');
  const tmp = path.join(os.tmpdir(), `social-art-${Date.now()}.png`);
  fs.writeFileSync(tmp, png);

  // Publish it (per-user storage folder, same bucket as the art repository)
  // and link it to the improvisation. All best-effort — the local file is
  // already safe, so a publish hiccup shouldn't fail the build.
  let artworkUrl = null;
  try {
    const storagePath = `${session.user_id}/social/${Date.now()}-kit.png`;
    const upRes = await fetch(`${hub.SUPABASE_URL}/storage/v1/object/piano_improvisations/${storagePath}`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'image/png' },
      body: png,
      signal: AbortSignal.timeout(60000),
    });
    if (upRes.ok) {
      artworkUrl = `${hub.SUPABASE_URL}/storage/v1/object/public/piano_improvisations/${storagePath}`;
      await fetch(`${hub.SUPABASE_URL}/rest/v1/improvisations?id=eq.${record.id}`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ artwork_url: artworkUrl, artwork_prompt: usedPrompt }),
        signal: AbortSignal.timeout(15000),
      });
      // Mirror into the art repository so nothing is ever wasted (best-effort).
      await fetch(`${hub.SUPABASE_URL}/rest/v1/art_repository`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({
          user_id: session.user_id,
          storage_path: storagePath,
          public_url: artworkUrl,
          prompt: usedPrompt,
          mode: 'cloudflare',
          improvisation_id: record.id,
        }),
        signal: AbortSignal.timeout(15000),
      });
    }
  } catch (e) {
    console.warn(`[social] could not publish generated artwork: ${e.message}`);
  }

  return { file: tmp, source: 'generated', prompt: usedPrompt, artworkUrl };
}

/**
 * Compose the still frame for one ratio: the artwork keeps its full shape in
 * the centre, letterboxed with a blurred, zoomed copy of itself — the standard
 * music-video look that works for any source aspect (square art → vertical).
 *
 * Done once per ratio as a single PNG. Encoding then reads a truly static
 * image, so a 24-minute song costs seconds of CPU instead of minutes.
 */
async function composeSocialFrame(artFile, outFile, w, h) {
  const filter =
    `[0:v]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},boxblur=luma_radius=30:luma_power=2[bg];` +
    `[0:v]scale=${w}:${h}:force_original_aspect_ratio=decrease[fg];` +
    `[bg][fg]overlay=(W-w)/2:(H-h)/2,format=yuv420p,setsar=1[v]`;

  await runProcess('ffmpeg', [
    '-y', '-hide_banner', '-loglevel', 'error', '-nostdin',
    '-i', artFile, '-filter_complex', filter, '-map', '[v]', '-frames:v', '1',
    outFile,
  ], { timeoutMs: 120000 });
}

/**
 * Append the ffmpeg flags for one finished video to an existing command. The
 * frame + audio inputs are already on the command line (see the caller), so a
 * ratio with several cuts can be encoded in ONE pass instead of one ffmpeg run
 * per clip — decoding the same still and the same 24-minute MP3 once instead
 * of N times.
 *
 * Every cut gets a short audio + picture fade so it never starts or stops
 * mid-note or snaps on mid-frame. The picture fade needs real frames, so the
 * still always enters at output frame rate — a 1 fps input can't fade, it just
 * cuts (ffmpeg's fade interpolates between frames).
 *
 * Optional enhancements:
  *  - Visualizer overlay: multiple types synced to the audio
  *    - 'waveform' (showwaves): moving bars, centered lines or peak-to-peak
  *    - 'spectrum' (showfreqs): frequency spectrum bars
  *    - 'spectrogram' (showspectrumpic): scrolling frequency waterfall
  *    - 'vectorscope' (avectorscope): stereo Lissajous
  *    - 'volume' (ebur128): loudness meter bar
  *  - Title text overlay (drawtext) at bottom center
*/
function appendSocialVideoArgs(args, audioFile, startSec, clipSec, outFile, opts = {}) {
  const start = Math.max(0, startSec || 0);
  const length = clipSec || 0;
  const fadeOutSec = length > 4 ? 1.2 : 0;
  const fadeInSec = Math.min(0.8, length > 0 ? length / 4 : 0.8);

  const audioFades = [];
  if (fadeInSec > 0) audioFades.push(`afade=t=in:st=0:d=${fadeInSec.toFixed(2)}`);
  if (fadeOutSec > 0) {
    audioFades.push(`afade=t=out:st=${(length - fadeOutSec).toFixed(2)}:d=${fadeOutSec}`);
  }

  const videoFades = [];
  if (fadeInSec > 0) videoFades.push(`fade=t=in:st=0:d=${fadeInSec.toFixed(2)}`);
  if (fadeOutSec > 0) {
    videoFades.push(`fade=t=out:st=${(length - fadeOutSec).toFixed(2)}:d=${fadeOutSec}`);
  }

  // Seek on the audio input only (fast, sample-accurate enough for music) and
  // trim there; the video stops when its output finishes.
  if (start > 0) args.push('-ss', String(start), '-t', length.toFixed(2));
  else args.push('-t', length.toFixed(2));
  args.push('-i', audioFile);
  args.push('-map', '0:v', '-map', `1:a`);
  args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-tune', 'stillimage', '-r', '30');

  // Build the video filter chain: fades + optional visualizer + optional title
  const vfParts = [...videoFades];

  // Visualizer overlay - supports multiple types synced to the audio
  const viz = opts.visualizer || opts.waveform; // backward compat: waveform -> visualizer
  if (viz?.enabled) {
    const v = viz;
    const type = v.type || 'waveform'; // waveform, spectrum, spectrogram, vectorscope, volume
    const width = v.width || 1080;
    const height = v.height || 200;
    const colors = v.color || '0xFFFFFF';
    const bg = v.background ? `@${v.background}` : '';
    const marginBottom = v.marginBottom || 40;

    let filter = '';
    let overlayPos = `(W-w)/2:H-h-${marginBottom}`;

    switch (type) {
      case 'waveform': {
        // showwaves: moving bars, centered lines or peak-to-peak
        const mode = v.mode || 'cline'; // cline, p2p
        filter = `[1:a]showwaves=s=${width}x${height}:mode=${mode}:colors=${colors}${bg}:rate=30[wf]`;
        break;
      }
      case 'spectrum': {
        // showfreqs: frequency spectrum bars
        const mode = v.mode || 'bar'; // bar, line, dot
        const fscale = v.fscale || 'lin'; // lin, log
        filter = `[1:a]showfreqs=s=${width}x${height}:mode=${mode}:fscale=${fscale}:colors=${colors}${bg}:rate=30[wf]`;
        break;
      }
      case 'spectrogram': {
        // showspectrumpic: scrolling frequency waterfall (vertical)
        // Use a tall thin strip that scrolls
        const mode = v.mode || 'combined'; // combined, separate
        const fscale = v.fscale || 'lin'; // lin, log, bark, mel
        const winSize = v.winSize || 'w1024';
        filter = `[1:a]showspectrumpic=s=${width}x${height}:mode=${mode}:fscale=${fscale}:win_size=${winSize}:colors=${colors}${bg}:rate=30[wf]`;
        overlayPos = `(W-w)/2:H-h-${marginBottom}`; // bottom
        break;
      }
      case 'vectorscope': {
        // avectorscope: stereo Lissajous figure
        const mode = v.mode || 'lissajous'; // lissajous, lissajous_xy, polar
        const zoom = v.zoom || 1.0;
        filter = `[1:a]avectorscope=s=${width}x${height}:mode=${mode}:zoom=${zoom}:rate=30[wf]`;
        break;
      }
      case 'volume': {
        // ebur128 + drawgraph: loudness meter bar
        // This is more complex - we'll draw a simple volume meter using showvolume
        filter = `[1:a]showvolume=s=${width}x${height}:rate=30[wf]`;
        break;
      }
      default: {
        // fallback to waveform
        filter = `[1:a]showwaves=s=${width}x${height}:mode=cline:colors=${colors}${bg}:rate=30[wf]`;
      }
    }

    const split = filter;
    const overlay = `[0:v][wf]overlay=${overlayPos}[v]`;
    args.push('-filter_complex', split + ';' + overlay);
    args.push('-map', '[v]', '-map', '1:a');
  } else if (videoFades.length) {
    // No visualizer, just fades
    args.push('-vf', `${videoFades.join(',')},format=yuv420p`);
    args.push('-map', '0:v', '-map', '1:a');
  } else {
    // No fades, no visualizer
    args.push('-map', '0:v', '-map', '1:a');
  }

  // Title overlay (drawtext) - rendered on top of everything
  if (opts.titleOverlay?.enabled) {
    const t = opts.titleOverlay;
    const text = (t.text || '').replace(/:/g, '\\:').replace(/'/g, "\\'").replace(/%/g, '\\%');
    const font = t.font || 'Arial';
    const fontSize = t.fontSize || 48;
    const color = t.color || 'white';
    const boxColor = t.boxColor || '0x000000AA';
    const boxBorderW = t.boxBorderW || 12;
    const y = t.y || 'h-th-60'; // 60px from bottom
    const drawtext = `drawtext=text='${text}':fontfile=${font}:fontsize=${fontSize}:fontcolor=${color}:box=1:boxcolor=${boxColor}:boxborderw=${boxBorderW}:x=(w-text_w)/2:y=${y}`;
    if (args.find((a) => a === '-filter_complex')) {
      // Append to existing filter chain
      const idx = args.indexOf('-filter_complex');
      args[idx + 1] = args[idx + 1] + ',' + drawtext;
    } else {
      args.push('-vf', drawtext + (videoFades.length ? `,${videoFades.join(',')}` : ''));
    }
  }

  if (audioFades.length) args.push('-af', audioFades.join(','));
  args.push('-c:a', 'aac', '-b:a', '192k');
  if (opts.title) {
    args.push('-metadata', `title=${opts.title}`);
    args.push('-metadata', 'artist=Composer Hub');
    args.push('-metadata', `comment=Original piano improvisation${opts.subtitle ? ` — ${opts.subtitle}` : ''}`);
  }
  // Write to a temp name and rename only on success, so an interrupted render
  // never leaves a playable-looking-but-truncated MP4 in the kit folder.
  args.push(outFile.replace(/\.mp4$/i, '.part.mp4'));
}

/** Run a full encode, then promote every *.part.mp4 it wrote to its real name. */
async function runSocialVideo(args) {
  const parts = args.filter((a) => typeof a === 'string' && a.endsWith('.part.mp4'));
  try {
    await runProcess('ffmpeg', [...args, '-shortest', '-movflags', '+faststart'], { timeoutMs: 20 * 60 * 1000 });
  } catch (e) {
    for (const part of parts) { try { fs.unlinkSync(part); } catch { /* nothing to clean */ } }
    throw e;
  }
  for (const part of parts) fs.renameSync(part, part.replace(/\.part\.mp4$/i, '.mp4'));
}

/** Single-clip convenience wrapper (thumbnail-style one-offs, tests). */
async function renderSocialVideo(audioFile, frameFile, outFile, opts = {}) {
  const args = ['-y', '-hide_banner', '-loglevel', 'error', '-nostdin', '-loop', '1', '-framerate', '30', '-i', frameFile];
  appendSocialVideoArgs(args, audioFile, opts.startSec, opts.clipSec, outFile, opts);
  await runSocialVideo(args);
}

/** Caption template — title + a short line + hashtags, editable in the app. */
/** Words too generic to turn into a useful hashtag. */
const CAPTION_STOPWORDS = new Set([
  'with', 'that', 'this', 'from', 'into', 'your', 'about', 'after', 'before',
  'the', 'and', 'for', 'over', 'under', 'part', 'take', 'song', 'piece',
]);

/**
 * Captions per platform. Each destination has different conventions: Reels
 * rewards a short hook + line breaks, TikTok wants one line and fewer tags,
 * YouTube needs a real title and a description. Nothing here is precious —
 * the app lets you edit and save each one.
 */
function buildSocialCaptions(title, opts = {}) {
  const words = title.toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 3 && !CAPTION_STOPWORDS.has(w));
  const derived = [...new Set(words.map((w) => `#${w.replace(/[^a-z0-9]/g, '')}`))]
    .filter((t) => t.length > 2)
    .slice(0, 2);

  const core = ['#piano', '#improvisation', '#originalmusic', '#instrumental', '#calmpiano'];
  const mood = [
    '#pianomusic', '#livemusic', '#improvised', '#contemporaryclassical',
    '#relaxingmusic', '#deepmusic', '#neoclassical', '#pianoforte',
  ];

  const excerpt = opts.excerptLabel && opts.excerptCount !== 0
    ? opts.excerptCount > 1
      ? `Excerpts from a ${opts.durationLabel} performance.`
      : `Excerpt (${opts.excerptLabel}) from a ${opts.durationLabel} performance.`
    : null;

  const instagram = [
    title,
    '',
    'An original piano improvisation. Played in one take — no edits, no overdubs.',
    ...(excerpt ? ['', excerpt] : []),
    '',
    [...core, ...derived, ...mood].slice(0, 14).join(' '),
  ].join('\n');

  const tiktok = [
    `${title} 🎹`,
    '',
    'One take. No edits.',
    '',
    ['#pianotok', '#piano', '#improvisation', '#originalmusic', '#fyp', ...derived].join(' '),
  ].join('\n');

  // The YouTube upload is the full performance, so it never describes an
  // excerpt — even when the short cuts were trimmed.
  const youtube = [
    `${title} — Piano Improvisation`,
    '',
    'An original piano improvisation, played live in one take — no edits, no overdubs.',
    '',
    `Recorded in one take, ${opts.durationLabel} long.`,
    '',
    [...core, ...mood, ...derived].join(' '),
  ].join('\n');

  return { instagram, tiktok, youtube };
}

/** The file each caption platform is saved to inside the kit folder. */
const CAPTION_FILES = {
  instagram: 'caption.txt',
  tiktok: 'tiktok.txt',
  youtube: 'youtube.txt',
};

/**
 * Copy a finished kit to the NAS and verify it file-by-file.
 *
 * Deliberately best-effort: a missing or flaky NAS must never fail a render
 * that already succeeded locally, so every error path returns a status object
 * instead of throwing. The caller records that status in kit.json so the
 * mirror can be retried later without rebuilding the videos.
 *
 * Mirrors the "copy, verify, then decide" shape of the Logic archive flow.
 */
async function mirrorKitToNas(folder) {
  const result = {
    status: 'skipped',      // 'mirrored' | 'unavailable' | 'failed' | 'skipped'
    path: null,
    error: null,
    files: 0,
    bytes: 0,
    at: new Date().toISOString(),
  };

  if (!fs.existsSync(SOCIAL_NAS_DIR)) {
    // The usual case when the share isn't mounted — not an error worth shouting
    // about, just something to retry when it's back.
    result.status = 'unavailable';
    result.error = 'Moon Prism is not mounted';
    return result;
  }
  if (!fs.existsSync(folder)) {
    result.status = 'failed';
    result.error = 'Kit folder missing';
    return result;
  }

  const dest = path.join(SOCIAL_NAS_DIR, path.basename(folder));
  try {
    fs.mkdirSync(dest, { recursive: true });

    // --delete keeps the mirror honest when a rebuild drops an old clip, but it
    // must stay inside this song's own folder — never the Social root.
    const copy = spawnSync('rsync', ['-a', '--delete', `${folder}/`, `${dest}/`], {
      encoding: 'utf-8',
      timeout: 20 * 60 * 1000,
    });
    if (copy.error || copy.status !== 0) {
      result.status = 'failed';
      result.error = (copy.stderr || copy.error?.message || 'rsync failed').trim().slice(0, 300);
      return result;
    }

    const local = measureTree(folder);
    const remote = measureTree(dest);
    if (local.files !== remote.files || local.bytes !== remote.bytes) {
      result.status = 'failed';
      result.error = `Verification failed (local ${local.files} files / ${local.bytes} B, NAS ${remote.files} / ${remote.bytes} B)`;
      return result;
    }

    result.status = 'mirrored';
    result.path = dest;
    result.files = remote.files;
    result.bytes = remote.bytes;
    return result;
  } catch (e) {
    result.status = 'failed';
    result.error = e.message.slice(0, 300);
    return result;
  }
}

async function handleSocialBuildKit(req, res, body) {
  // Temp audio staged locally for the build — always removed afterwards.
  let stagedAudio = null;
  let framesDir = null;
  let jobId = null;
  try {
    const improvisationId = typeof body.improvisationId === 'string' ? body.improvisationId.trim() : '';
    if (!/^[0-9a-f-]{36}$/i.test(improvisationId)) throw new Error('Missing or invalid improvisationId');
    jobId = improvisationId;
    updateSocialBuildJob(jobId, {
      status: 'building',
      step: 'Starting…',
      startedAt: Date.now(),
      finishedAt: null,
      error: null,
      seconds: null,
    });

    const hub = await import('./composer-hub.js');
    const session = await hub.getSession();
    if (!session) throw new Error('Not signed in on this Mac (run composer-hub-login)');

    const headers = {
      apikey: hub.ANON_KEY,
      Authorization: `Bearer ${session.access_token}`,
    };
    const recRes = await fetch(
      `${hub.SUPABASE_URL}/rest/v1/improvisations?id=eq.${improvisationId}&select=id,generated_name,original_name,artwork_url,artwork_prompt,nas_folder_path,storage_path`,
      { headers, signal: AbortSignal.timeout(15000) },
    );
    const [record] = recRes.ok ? await recRes.json() : [];
    if (!record) throw new Error('Song not found');

    const displayTitle = stripDatePrefix(record.original_name || record.generated_name || 'Untitled');
    // Optional excerpt overrides for long recordings (the app sends these when
    // the user picks a different moment/length/count).
    const requestedSec = Number.isFinite(body.clipSec) ? Math.max(5, Math.round(body.clipSec)) : null;
    const requestedStartSec = Number.isFinite(body.clipStartSec) ? Math.max(0, Math.round(body.clipStartSec)) : null;
    const clipCount = Number.isFinite(body.clipCount)
      ? Math.min(3, Math.max(1, Math.round(body.clipCount)))
      : 1;
    // Which ratios get several cuts — the app sends the user's choice, and
    // older bridges/clients default to the vertical cut only.
    const clipRatios = new Set(
      Array.isArray(body.clipRatios) && body.clipRatios.length
        ? body.clipRatios.filter((k) => SOCIAL_CLIP_RATIOS.includes(k))
        : ['reels'],
    );
    const startedAt = Date.now();
    const step = (s) => {
      updateSocialBuildJob(jobId, { step: s });
      console.log(`[social] ${displayTitle}: ${s}`);
    };

    step('finding audio…');
    const audio = await findSocialAudio(session, record);
    stagedAudio = audio.file;
    const durationSec = await mediaDurationSec(audio.file);
    if (!durationSec) throw new Error('Could not read audio duration — is the file a valid MP3?');

    step('preparing artwork…');
    const art = await ensureSocialArtwork(session, record, displayTitle);

    const folder = path.join(SOCIAL_OUTPUT_DIR, safeFolderName(displayTitle));
    fs.mkdirSync(folder, { recursive: true });

    // Fail before a long render rather than halfway through it. The kit folder
    // also holds a copy of the artwork and manifest; 512 MB is a safe floor.
    const freeBytes = availableBytes(folder);
    if (freeBytes != null && freeBytes < 512 * 1024 * 1024) {
      throw new Error(
        `Only ${Math.round(freeBytes / (1024 * 1024))} MB free on the Social drive — ` +
        'free some space before building videos',
      );
    }

    // A bridge killed mid-render can leave *.part.mp4 behind (renders write to
    // a temp name and rename on success). Clear them so the folder stays clean.
    for (const name of fs.readdirSync(folder)) {
      if (name.endsWith('.part.mp4')) {
        try { fs.unlinkSync(path.join(folder, name)); } catch { /* in use */ }
      }
    }

    const artCopy = path.join(folder, `${displayTitle} - artwork.png`);
    fs.copyFileSync(art.file, artCopy);

    // Read the previous manifest before anything is replaced: it tells us what
    // can be reused and preserves the posted record across rebuilds.
    const kitJsonPath = path.join(folder, 'kit.json');
    const previous = fs.existsSync(kitJsonPath)
      ? (() => { try { return JSON.parse(fs.readFileSync(kitJsonPath, 'utf-8')); } catch { return {}; } })()
      : {};

    const artUrl = art.artworkUrl || record.artwork_url || null;
    // Hash the bytes, not the URL: artwork regenerated at the same storage
    // path would otherwise keep silently reusing videos with the old cover.
    const artworkHash = fileHash(art.file);
    const audioBytes = fs.statSync(audio.file).size;
    // The renders depend only on audio + artwork + this code version — not on
    // excerpt settings — so unchanged assets reuse the existing files and
    // changing clips doesn't cost another multi-minute encode.
    const assetsUnchanged = !!(
      previous.renderVersion === SOCIAL_RENDER_VERSION
      && previous.audioBytes === audioBytes
      && previous.durationSec === durationSec
      && ((previous.artworkHash && artworkHash && previous.artworkHash === artworkHash)
        || (!previous.artworkHash && previous.artworkUrl === artUrl))
    );

    const files = [];
    framesDir = path.join(os.tmpdir(), `social-frames-${Date.now()}`);
    fs.mkdirSync(framesDir, { recursive: true });

    // Only analyse when an automatic cut is actually needed — an explicit start
    // (or a short song) doesn't benefit from it.
    const needsAutoCut = requestedStartSec == null && SOCIAL_RATIOS.some((r) => {
      const cap = Math.min(requestedSec || r.defaultSec, r.maxSec || Infinity);
      return r.maxSec && durationSec > cap;
    });
    let profile = null;
    if (needsAutoCut) {
      step(clipCount > 1
        ? `listening for the ${clipCount} strongest passages…`
        : 'listening for the strongest passage…');
      profile = await audioLoudnessProfile(audio.file);
      if (!profile) step('loudness analysis unavailable — spacing the cuts automatically');
    }

    let shortCutCount = 0;
    for (const ratio of SOCIAL_RATIOS) {
      const cuts = pickExcerptCuts(
        durationSec, ratio, requestedSec, requestedStartSec, profile,
        clipRatios.has(ratio.key) ? clipCount : 1,
      );
      if (ratio.maxSec) shortCutCount = cuts.length;

      const frameFile = path.join(framesDir, `${ratio.key}.png`);
      await composeSocialFrame(art.file, frameFile, ratio.w, ratio.h);

      // Several cuts share one composed frame, so build the entire ffmpeg
      // command and encode them in a single pass. Separate runs would decode
      // the same still (and the same audio) once per clip.
      const args = ['-y', '-hide_banner', '-loglevel', 'error', '-nostdin', '-loop', '1', '-framerate', '30', '-i', frameFile];
      const planned = [];

      for (let i = 0; i < cuts.length; i++) {
        const { startSec, clipSec, auto, idea: isIdea } = cuts[i];
        const suffix = cuts.length > 1
          ? `${isIdea ? 'idea' : 'clip'} ${i + 1} ${ratio.fileSuffix}`
          : ratio.fileSuffix;
        const where = startSec > 0
          ? ` (excerpt ${formatTime(startSec)}–${formatTime(startSec + clipSec)}${auto && profile ? ', strongest passage' : ''})`
          : '';
        const outFile = path.join(folder, `${displayTitle} - ${suffix}.mp4`);
        const outName = path.basename(outFile);
        const prev = assetsUnchanged
          ? (previous.files || []).find((f) => f.name === outName)
          : null;

        const canReuse = !!(
          prev
          && prev.clipStartSec === startSec
          && prev.clipSec === Math.round(clipSec)
          && fs.existsSync(outFile)
          && await isVideoUsable(outFile, clipSec)
        );
        if (canReuse) {
          step(`reusing ${outName} (unchanged)…`);
          files.push({
            name: outName,
            path: outFile,
            kind: 'video',
            ratio: ratio.key,
            ratioLabel: ratio.label,
            clipIndex: prev.clipIndex ?? undefined,
            clipCount: prev.clipCount ?? undefined,
            clipStartSec: startSec,
            clipSec: Math.round(clipSec),
            autoExcerpt: prev.autoExcerpt ?? undefined,
            idea: isIdea || undefined,
            fullSec: durationSec,
            sizeMB: prev.sizeMB ?? Math.round((fs.statSync(outFile).size / (1024 * 1024)) * 10) / 10,
          });
          continue;
        }

        step(`rendering ${ratio.label}${cuts.length > 1 ? `, ${isIdea ? 'idea' : 'clip'} ${i + 1}/${cuts.length}` : ''}${where}…`);
        planned.push({ startSec, clipSec, auto, isIdea, outFile, outName, i });
        appendSocialVideoArgs(args, audio.file, startSec, clipSec, outFile, {
          title: `${displayTitle}${cuts.length > 1 ? ` — ${isIdea ? 'Idea' : 'Clip'} ${i + 1}` : ''}`,
          subtitle: `${ratio.label} · ${formatTime(startSec)}–${formatTime(startSec + clipSec)}`,
        });
      }

      if (planned.length) {
        // Stop at the end of the last cut; ffmpeg writes each output in one
        // pass instead of one run per clip.
        const lastCut = planned[planned.length - 1];
        args.push('-t', (lastCut.startSec + lastCut.clipSec).toFixed(2));
        await runSocialVideo(args);

        for (const p of planned) {
          files.push({
            name: p.outName,
            path: p.outFile,
            kind: 'video',
            ratio: ratio.key,
            ratioLabel: ratio.label,
            clipIndex: cuts.length > 1 ? p.i + 1 : undefined,
            clipCount: cuts.length > 1 ? cuts.length : undefined,
            clipStartSec: p.startSec,
            clipSec: Math.round(p.clipSec),
            autoExcerpt: (p.auto && !!profile) || undefined,
            idea: p.isIdea || undefined,
            fullSec: durationSec,
            sizeMB: Math.round((fs.statSync(p.outFile).size / (1024 * 1024)) * 10) / 10,
          });
        }
      }
    }

    // YouTube thumbnail (1280×720) from the 16:9 frame — the artwork is square,
    // so this is the one asset every destination still wants in landscape.
    const wideFrame = path.join(framesDir, 'youtube.png');
    let thumbFile = null;
    if (fs.existsSync(wideFrame)) {
      step('making the YouTube thumbnail…');
      thumbFile = path.join(folder, `${displayTitle} - thumbnail.jpg`);
      await runProcess('ffmpeg', [
        '-y', '-hide_banner', '-loglevel', 'error', '-nostdin',
        '-i', wideFrame, '-vf', 'scale=1280:720', '-frames:v', '1', '-q:v', '2',
        thumbFile,
      ], { timeoutMs: 60000 });
      files.push({
        name: path.basename(thumbFile),
        path: thumbFile,
        kind: 'image',
        sizeMB: Math.round((fs.statSync(thumbFile).size / (1024 * 1024)) * 100) / 100,
      });
    }

    // Captions: one per destination, written as plain text so they can be
    // dragged or opened without the app.
    const shortCut = files.find((f) => f.kind === 'video' && f.clipStartSec > 0);
    const captions = buildSocialCaptions(displayTitle, {
      durationLabel: formatTime(durationSec),
      excerptCount: shortCutCount,
      excerptLabel: shortCut
        ? `${formatTime(shortCut.clipStartSec)}–${formatTime(shortCut.clipStartSec + shortCut.clipSec)}`
        : null,
    });
    for (const [platform, suffix] of Object.entries(CAPTION_FILES)) {
      const captionPath = path.join(folder, `${displayTitle} - ${suffix}`);
      fs.writeFileSync(captionPath, `${captions[platform]}\n`);
      files.push({ name: path.basename(captionPath), path: captionPath, kind: 'text', platform });
    }
    files.push({ name: path.basename(artCopy), path: artCopy, kind: 'image' });

    // Previous kit may have had more clips or different ratios. Once the new
    // renders all exist, drop generated videos that are no longer referenced
    // (never touches anything the user put in the folder).
    const keep = new Set(files.map((f) => f.name));
    for (const name of fs.readdirSync(folder)) {
      if (!name.startsWith(`${displayTitle} - `) || !name.endsWith('.mp4')) continue;
      if (keep.has(name)) continue;
      try { fs.unlinkSync(path.join(folder, name)); } catch { /* in use */ }
    }

    // Kit manifest so the app can restore state without rebuilding. `posted`
    // survives rebuilds — it's a record of what went out, not of the files.
    // Written before the NAS mirror so a failed mirror still leaves a usable
    // local kit behind; `nas` is filled in immediately afterwards.
    const writeKit = (nas) => fs.writeFileSync(kitJsonPath, JSON.stringify({
      improvisationId, title: displayTitle, durationSec, clipCount, clipRatios: [...clipRatios], audioBytes,
      renderVersion: SOCIAL_RENDER_VERSION,
      artworkHash,
      caption: captions.instagram, captions,
      posted: previous.posted || {},
      artworkSource: art.source, artworkUrl: artUrl, builtAt: new Date().toISOString(),
      nas,
      files: files.map((f) => ({
        name: f.name,
        ratio: f.ratio || null,
        ratioLabel: f.ratioLabel || null,
        clipIndex: f.clipIndex ?? null,
        clipCount: f.clipCount ?? null,
        clipStartSec: f.clipStartSec ?? null,
        clipSec: f.clipSec ?? null,
        autoExcerpt: f.autoExcerpt ?? null,
        idea: f.idea ?? null,
        sizeMB: f.sizeMB ?? null,
        platform: f.platform || null,
      })),
    }, null, 2));

    writeKit(previous.nas || null);

    // Second copy on the NAS. Never fatal: the local kit is already complete
    // and usable, so an unmounted share downgrades to a retryable status.
    step('copying to Moon Prism…');
    const nas = await mirrorKitToNas(folder);
    writeKit(nas);
    if (nas.status === 'mirrored') {
      console.log(`[social] ${displayTitle}: mirrored to ${nas.path} (${nas.files} files)`);
    } else {
      console.warn(`[social] ${displayTitle}: NAS mirror ${nas.status} — ${nas.error}`);
    }

    const seconds = Math.round((Date.now() - startedAt) / 100) / 10;
    const videoCount = files.filter((f) => f.kind === 'video').length;
    const nasNote = nas.status === 'mirrored'
      ? ' · mirrored to Moon Prism'
      : nas.status === 'unavailable'
        ? ' · NAS not mounted, copy later'
        : nas.status === 'failed'
          ? ' · NAS copy failed, see kit.json'
          : '';
    step(`done in ${seconds}s${nasNote}`);
    updateSocialBuildJob(jobId, {
      status: 'done',
      seconds,
      finishedAt: Date.now(),
      folder,
      videoCount,
      nas,
    });

    sendJson(res, 200, {
      success: true,
      data: {
        title: displayTitle,
        folder,
        nas,
        durationSec,
        clipCount,
        clipRatios: [...clipRatios],
        caption: captions.instagram,
        captions,
        posted: previous.posted || {},
        artworkSource: art.source,
        artworkUrl: art.artworkUrl || record.artwork_url || null,
        files,
        seconds,
        message: `Social kit ready: ${displayTitle} (${formatTime(durationSec)} song, ${videoCount} videos in ${seconds}s)${nasNote}`,
      },
      timestamp: new Date().toISOString(),
    }, req);
  } catch (e) {
    console.error(`[social/build-kit] ${e.message}`);
    if (jobId) {
      updateSocialBuildJob(jobId, {
        status: 'error',
        step: 'Failed',
        error: e.message,
        finishedAt: Date.now(),
      });
    }
    sendJson(res, 500, { success: false, error: e.message, timestamp: new Date().toISOString() }, req);
  } finally {
    // Temp files are per-build; never leave audio/frames behind.
    if (stagedAudio) { try { fs.unlinkSync(stagedAudio); } catch { /* already gone */ } }
    if (framesDir) { try { fs.rmSync(framesDir, { recursive: true, force: true }); } catch { /* temp dir */ } }
  }
}

/**
 * Live progress for a build in flight. Deliberately lightweight: the app polls
 * this every couple of seconds while the long build POST is still open, so a
 * page reload can pick the progress back up instead of showing a dead button.
 */
async function handleSocialBuildStatus(req, res, query) {
  try {
    const id = query.get('id') || '';
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error('Missing or invalid id');
    pruneSocialBuildJobs();
    const job = socialBuildJobs.get(id) || null;
    const now = Date.now();
    sendJson(res, 200, {
      success: true,
      data: job
        ? {
            status: job.status,
            building: job.status === 'building',
            step: job.step || null,
            startedAt: job.startedAt || null,
            finishedAt: job.finishedAt || null,
            elapsedSec: Math.round(((job.finishedAt || now) - (job.startedAt || now)) / 1000),
            seconds: job.seconds ?? null,
            folder: job.folder || null,
            videoCount: job.videoCount ?? null,
            nas: job.nas || null,
            error: job.error || null,
          }
        : { status: 'idle', building: false, step: null },
      timestamp: new Date().toISOString(),
    }, req);
  } catch (e) {
    sendJson(res, 500, { success: false, error: e.message, timestamp: new Date().toISOString() }, req);
  }
}

/** Resolve a song's display title + kit folder (shared by kit status/save). */
async function resolveSocialSong(improvisationId) {
  if (!/^[0-9a-f-]{36}$/i.test(improvisationId || '')) throw new Error('Missing or invalid id');

  const hub = await import('./composer-hub.js');
  const session = await hub.getSession();
  if (!session) throw new Error('Not signed in on this Mac (run composer-hub-login)');

  const recRes = await fetch(
    `${hub.SUPABASE_URL}/rest/v1/improvisations?id=eq.${improvisationId}&select=id,generated_name,original_name`,
    { headers: { apikey: hub.ANON_KEY, Authorization: `Bearer ${session.access_token}` }, signal: AbortSignal.timeout(15000) },
  );
  const [record] = recRes.ok ? await recRes.json() : [];
  if (!record) throw new Error('Song not found');

  const displayTitle = stripDatePrefix(record.original_name || record.generated_name || 'Untitled');
  return {
    record,
    session,
    displayTitle,
    folder: path.join(SOCIAL_OUTPUT_DIR, safeFolderName(displayTitle)),
  };
}

async function handleSocialKitStatus(req, res, query) {
  try {
    const { displayTitle, folder } = await resolveSocialSong(query.get('id') || '');
    const kitJson = path.join(folder, 'kit.json');

    if (!fs.existsSync(kitJson)) {
      sendJson(res, 200, { success: true, data: { built: false, folder: null, title: displayTitle, files: [] }, timestamp: new Date().toISOString() }, req);
      return;
    }

    const kit = JSON.parse(fs.readFileSync(kitJson, 'utf-8'));
    const files = (kit.files || [])
      .map((f) => {
        const full = path.join(folder, f.name);
        if (!fs.existsSync(full)) return null;
        const ext = path.extname(f.name).toLowerCase();
        return {
          name: f.name,
          path: full,
          kind: ext === '.mp4' ? 'video' : ['.png', '.jpg', '.jpeg'].includes(ext) ? 'image' : 'text',
          ratio: f.ratio || undefined,
          ratioLabel: f.ratioLabel || undefined,
          clipIndex: f.clipIndex ?? undefined,
          clipCount: f.clipCount ?? undefined,
          clipStartSec: f.clipStartSec ?? undefined,
          clipSec: f.clipSec ?? undefined,
          autoExcerpt: f.autoExcerpt ?? undefined,
          idea: f.idea ?? undefined,
          platform: f.platform || undefined,
          sizeMB: f.sizeMB ?? Math.round((fs.statSync(full).size / (1024 * 1024)) * 10) / 10,
        };
      })
      .filter(Boolean);

    sendJson(res, 200, {
      success: true,
      data: {
        built: files.length > 0,
        folder,
        title: displayTitle,
        durationSec: kit.durationSec,
        clipCount: kit.clipCount || 1,
        clipRatios: kit.clipRatios || undefined,
        caption: kit.caption,
        // Older kits only have `caption`; treat it as the Instagram one.
        captions: kit.captions || { instagram: kit.caption || '' },
        posted: kit.posted || {},
        nas: kit.nas || null,
        files,
      },
      timestamp: new Date().toISOString(),
    }, req);
  } catch (e) {
    sendJson(res, 500, { success: false, error: e.message, timestamp: new Date().toISOString() }, req);
  }
}

/**
 * Persist an edited caption back to the kit folder. Captions are the one piece
 * worth tweaking after a build (voice, hashtags), so edits shouldn't evaporate
 * on reload.
 */
async function handleSocialSaveCaption(req, res, body) {
  try {
    const platform = typeof body.platform === 'string' ? body.platform : '';
    const text = typeof body.text === 'string' ? body.text.replace(/\r\n/g, '\n') : '';
    if (!Object.prototype.hasOwnProperty.call(CAPTION_FILES, platform)) {
      throw new Error('Unknown caption platform');
    }
    if (!text.trim()) throw new Error('Caption is empty');

    const { displayTitle, folder } = await resolveSocialSong(
      typeof body.improvisationId === 'string' ? body.improvisationId : '',
    );
    const kitJson = path.join(folder, 'kit.json');
    if (!fs.existsSync(kitJson)) throw new Error('Build the social kit first');

    const kit = JSON.parse(fs.readFileSync(kitJson, 'utf-8'));
    const captionPath = path.join(folder, `${displayTitle} - ${CAPTION_FILES[platform]}`);
    fs.writeFileSync(captionPath, text.endsWith('\n') ? text : `${text}\n`);

    kit.captions = { ...(kit.captions || {}), [platform]: text };
    if (platform === 'instagram') kit.caption = text;
    kit.captionSavedAt = new Date().toISOString();
    fs.writeFileSync(kitJson, JSON.stringify(kit, null, 2));

    sendJson(res, 200, {
      success: true,
      data: { path: captionPath, platform, message: 'Caption saved' },
      timestamp: new Date().toISOString(),
    }, req);
  } catch (e) {
    sendJson(res, 500, { success: false, error: e.message, timestamp: new Date().toISOString() }, req);
  }
}

/** Platforms a kit can be marked as posted to (kept in kit.json). */
const POST_PLATFORMS = new Set(['instagram', 'tiktok', 'youtube']);

/**
 * Record that a song went out on a platform. Local only — the point is not
 * analytics, it's not posting the same clip twice or wondering what's live.
 */
async function handleSocialMarkPosted(req, res, body) {
  try {
    const platform = typeof body.platform === 'string' ? body.platform : '';
    if (!POST_PLATFORMS.has(platform)) throw new Error('Unknown platform');

    const { displayTitle, folder } = await resolveSocialSong(
      typeof body.improvisationId === 'string' ? body.improvisationId : '',
    );
    const kitJson = path.join(folder, 'kit.json');
    if (!fs.existsSync(kitJson)) throw new Error('Build the social kit first');

    const kit = JSON.parse(fs.readFileSync(kitJson, 'utf-8'));
    const posted = { ...(kit.posted || {}) };
    if (body.posted === false) {
      delete posted[platform];
    } else {
      posted[platform] = new Date().toISOString();
    }
    kit.posted = posted;
    fs.writeFileSync(kitJson, JSON.stringify(kit, null, 2));

    sendJson(res, 200, {
      success: true,
      data: {
        posted,
        message: body.posted === false
          ? `Marked ${displayTitle} as not posted to ${platform}`
          : `Marked ${displayTitle} as posted to ${platform}`,
      },
      timestamp: new Date().toISOString(),
    }, req);
  } catch (e) {
    sendJson(res, 500, { success: false, error: e.message, timestamp: new Date().toISOString() }, req);
  }
}

/**
 * Serve a staged kit file for in-app preview. The path must live inside the
 * Social output dir — nothing else on this Mac is reachable.
 */
async function handleSocialPreview(req, res, query) {
  try {
    const raw = query.get('p') || '';
    const resolved = path.resolve(raw);
    if (!resolved.startsWith(`${SOCIAL_OUTPUT_DIR}/`) || resolved.includes('\u0000')) {
      throw new Error('Invalid path');
    }
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
      throw new Error('File not found');
    }
    const ext = path.extname(resolved).toLowerCase();
    const contentType = ext === '.mp4' ? 'video/mp4' : ext === '.png' ? 'image/png' : ext === '.jpg' ? 'image/jpeg' : 'text/plain';
    res.writeHead(200, { 'Content-Type': contentType, 'Content-Length': fs.statSync(resolved).size });
    fs.createReadStream(resolved).pipe(res);
  } catch (e) {
    sendJson(res, 404, { success: false, error: e.message, timestamp: new Date().toISOString() }, req);
  }
}

// ============================================================================
// HTTP Server
// ============================================================================

async function startServer() {
  loadConfig();

  const server = http.createServer(async (req, res) => {
    // CORS preflight
    if (req.method === 'OPTIONS') {
      const allowOrigin = getAllowedOrigin(req);
      const headers = {
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400',
        'Vary': 'Origin',
      };
      if (allowOrigin) headers['Access-Control-Allow-Origin'] = allowOrigin;
      res.writeHead(204, headers);
      res.end();
      return;
    }

    const url = new URL(req.url, `http://localhost:${config.port}`);
    const pathname = url.pathname;

    // Public endpoints (no auth)
    if (pathname === '/ping' && req.method === 'GET') {
      return handlePing(req, res);
    }

    // Protected endpoints
    if (!requireAuth(req, res)) return;

    let body = '';
    let bodySize = 0;
    const MAX_BODY = 1024 * 1024; // 1MB
    req.on('data', chunk => {
      bodySize += chunk.length;
      if (bodySize > MAX_BODY) { req.destroy(); return; }
      body += chunk;
    });
    req.on('end', async () => {
      if (bodySize > MAX_BODY) {
        sendJson(res, 413, { success: false, error: 'Request body too large', timestamp: new Date().toISOString() }, req);
        return;
      }
      let parsedBody = {};
      try {
        parsedBody = body ? JSON.parse(body) : {};
      } catch {
        sendJson(res, 400, { success: false, error: 'Invalid JSON in request body', timestamp: new Date().toISOString() }, req);
        return;
      }
      const query = Object.fromEntries(url.searchParams);

      try {
        if (pathname === '/status' && req.method === 'GET') {
          await handleStatus(req, res);
        } else if (pathname === '/workflow/launch' && req.method === 'POST') {
          await handleLaunchPicker(req, res, parsedBody);
        } else if (pathname === '/meld/scene' && req.method === 'POST') {
          await handleMeldScene(req, res, parsedBody);
        } else if (pathname === '/logic/open' && req.method === 'POST') {
          await handleOpenLogic(req, res, parsedBody);
        } else if (pathname === '/finder/open' && req.method === 'POST') {
          await handleFinderOpen(req, res, parsedBody);
        } else if (pathname === '/finder/open-pair' && req.method === 'POST') {
          await handleFinderOpenPair(req, res, parsedBody);
        } else if (pathname === '/sync/status' && req.method === 'GET') {
          await handleSyncStatus(req, res, query);
        } else if (pathname === '/nas/mount' && req.method === 'POST') {
          await handleMountNas(req, res);
        } else if (pathname === '/nas/status' && req.method === 'GET') {
          await handleNasStatus(req, res);
        } else if (pathname === '/logic/projects' && req.method === 'GET') {
          await handleLogicProjects(req, res);
        } else if (pathname === '/logic/archive' && req.method === 'POST') {
          await handleLogicArchive(req, res, parsedBody);
        } else if (pathname === '/logic/trash-local' && req.method === 'POST') {
          await handleTrashLocal(req, res, parsedBody);
        } else if (pathname === '/logic/delete-folder' && req.method === 'POST') {
          await handleDeleteFolder(req, res, parsedBody);
        } else if (pathname === '/social/build-kit' && req.method === 'POST') {
          await handleSocialBuildKit(req, res, parsedBody);
        } else if (pathname === '/social/build-status' && req.method === 'GET') {
          await handleSocialBuildStatus(req, res, url.searchParams);
        } else if (pathname === '/social/kit' && req.method === 'GET') {
          await handleSocialKitStatus(req, res, url.searchParams);
        } else if (pathname === '/social/caption' && req.method === 'POST') {
          await handleSocialSaveCaption(req, res, parsedBody);
        } else if (pathname === '/social/posted' && req.method === 'POST') {
          await handleSocialMarkPosted(req, res, parsedBody);
        } else if (pathname === '/social/preview' && req.method === 'GET') {
          await handleSocialPreview(req, res, url.searchParams);
        } else if (pathname === '/captures' && req.method === 'GET') {
          await handleListCaptures(req, res);
        } else if (pathname === '/captures/create-entry' && req.method === 'POST') {
          await handleCreateCaptureEntry(req, res, parsedBody);
        } else if (pathname === '/logic/create-entry' && req.method === 'POST') {
          await handleCreateLogicEntry(req, res, parsedBody);
        } else if (pathname === '/bridge/configure' && req.method === 'POST') {
          await handleBridgeConfigure(req, res, parsedBody);
        } else {
          sendJson(res, 404, { success: false, error: 'Not found', timestamp: new Date().toISOString() }, req);
        }
      } catch (e) {
        sendJson(res, 500, { success: false, error: e.message, timestamp: new Date().toISOString() }, req);
      }
    });
  });

  server.listen(config.port, config.bindHost || '127.0.0.1', () => {
    console.log(`🌉 Local Bridge running at http://${config.bindHost || '127.0.0.1'}:${config.port}`);
    console.log(`📋 Config: ${CONFIG_FILE}`);
    console.log(`🔑 Token: ${config.token}`);
    console.log(`🌐 Allowed origins: ${config.allowedOrigins.join(', ')}`);
    console.log('');
    console.log('Endpoints:');
    console.log('  GET  /ping                    - Health check (no auth)');
    console.log('  GET  /status                  - System status (Meld, Logic, NAS)');
    console.log('  POST /workflow/launch         - Launch Workflow Picker mode');
    console.log('  POST /meld/scene              - Switch Meld scene');
    console.log('  POST /logic/open              - Open Logic project');
    console.log('  POST /finder/open             - Open song folder in Finder');
    console.log('  POST /finder/open-pair        - Open several folders in Finder at once');
    console.log('  GET  /sync/status             - Query Supabase sync status');
    console.log('  POST /nas/mount               - Open macOS mount dialog for the NAS');
    console.log('  GET  /nas/status              - NAS mount + reachability status');
    console.log('  GET  /captures                - List local Logic captures');
    console.log('  POST /captures/create-entry   - Create app entry for a capture');
    console.log('  GET  /logic/projects          - List top-level Logic projects + archive status');
    console.log('  POST /logic/archive           - Archive a project to the NAS (copy + verify)');
    console.log('  POST /logic/trash-local       - Trash local copy after re-verifying the NAS copy');
    console.log('  POST /social/build-kit        - Song → artwork + ratio-ready videos (staged on Desktop)');
    console.log('  GET  /social/build-status     - Live progress for a kit build');
    console.log('  GET  /social/kit              - Existing kit status for a song');
    console.log('  POST /social/caption          - Save an edited caption into the kit');
    console.log('  POST /social/posted           - Mark a platform as posted (or undo)');
    console.log('  GET  /social/preview          - Stream a staged kit file for in-app preview');
    console.log('');
    console.log('Press Ctrl+C to stop');
  });

  server.on('error', e => {
    if (e.code === 'EADDRINUSE') {
      console.error(`Port ${config.port} in use. Change port in ${CONFIG_FILE}`);
    } else {
      console.error('Server error:', e);
    }
    process.exit(1);
  });
}

function gracefulShutdown(signal) {
  console.log(`\nReceived ${signal}, shutting down bridge...`);
  process.exit(0);
}
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

startServer();