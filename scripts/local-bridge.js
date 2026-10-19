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
      allowedOrigins: ['https://composerhub.vercel.app', 'http://localhost:5173'],
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
  const [meldConnected, logicRunning, nasMounted, tailscaleConnected] = await Promise.all([
    checkMeldConnected(),
    checkLogicRunning(),
    checkNasMounted(),
    checkTailscaleConnected(),
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
      tailscaleConnected,
      nasPath: nasMounted ? '/Volumes/Moon Prism' : undefined,
      config: { port: config.port, bindHost: config.bindHost || '127.0.0.1', allowedOrigins: config.allowedOrigins },
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
 * POST /finder/open — open the song's folder in Finder.
 * Accepts either a folder path or a .logicx bundle path (the bundle's parent
 * directory is opened, since .logicx is a package, not a browsable folder).
 */
async function handleFinderOpen(req, res, body) {
  try {
    const rawPath = typeof body.path === 'string' ? body.path.trim() : '';
    if (!rawPath) throw new Error('Missing path');
    if (!rawPath.startsWith('/') || rawPath.includes('\u0000')) {
      throw new Error('Path must be an absolute POSIX path');
    }

    // A .logicx bundle always opens as its containing folder. Anything else is
    // opened as a folder, or — with reveal: true — selected in its folder, so
    // a single staged file can be dragged straight into an upload page.
    const wantsReveal = body.reveal === true;
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

    // "Archived" = a same-named folder exists in the NAS Creation dir.
    let nasListed = false;
    const archivedNames = new Set();
    try {
      for (const d of fs.readdirSync(NAS_CREATION_DIR, { withFileTypes: true })) {
        if (d.isDirectory()) archivedNames.add(d.name);
      }
      nasListed = true;
    } catch { /* NAS not mounted — archive status stays unknown */ }
    for (const p of projects) p.archived = nasListed && archivedNames.has(p.name);

    sendJson(res, 200, {
      success: true,
      data: { projects, nasListed, count: projects.length },
      timestamp: new Date().toISOString(),
    }, req);
  } catch (e) {
    sendJson(res, 500, { success: false, error: e.message, timestamp: new Date().toISOString() }, req);
  }
}

async function handleLogicArchive(req, res, body) {
  try {
    const source = resolveArchivePath(typeof body.path === 'string' ? body.path.trim() : '');
    const name = path.basename(source, '.logicx');

    if (!fs.existsSync(NAS_CREATION_DIR)) {
      throw new Error('NAS not mounted (Moon Prism). Use "Mount NAS" first, then retry.');
    }
    const targetFolder = path.join(NAS_CREATION_DIR, name);
    if (fs.existsSync(targetFolder)) {
      throw new Error(`"${name}" already has a folder on the NAS: ${targetFolder}`);
    }

    console.log(`[logic/archive] ${name}: copying to ${targetFolder} …`);
    fs.mkdirSync(targetFolder, { recursive: true });
    const startedAt = Date.now();

    // Trailing slash copies the bundle's *contents* into the folder we just
    // created. The local project is never touched; a failed or partial copy
    // removes only the incomplete NAS folder.
    const copy = spawnSync('rsync', ['-a', `${source}/`, `${targetFolder}/`], {
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

    const seconds = Math.round((Date.now() - startedAt) / 100) / 10;
    const sizeMB = Math.round((local.bytes / (1024 * 1024)) * 10) / 10;
    console.log(`[logic/archive] ${name}: verified — ${local.files} files, ${sizeMB} MB in ${seconds}s`);

    // Best-effort: if an app record points at this project, link it to the
    // new NAS folder. A failure here never fails the archive itself.
    let linkedRecord = null;
    try {
      const hub = await import('./composer-hub.js');
      const session = await hub.getSession();
      if (session) {
        const headers = { apikey: hub.ANON_KEY, Authorization: `Bearer ${session.access_token}` };
        const findRes = await fetch(`${hub.SUPABASE_URL}/rest/v1/improvisations?logic_project_path=eq.${encodeURIComponent(source)}&select=id`, {
          headers,
          signal: AbortSignal.timeout(15000),
        });
        if (findRes.ok) {
          const [match] = await findRes.json();
          if (match) {
            const patchRes = await fetch(`${hub.SUPABASE_URL}/rest/v1/improvisations?id=eq.${match.id}`, {
              method: 'PATCH',
              headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
              body: JSON.stringify({ nas_folder_path: targetFolder }),
              signal: AbortSignal.timeout(15000),
            });
            if (patchRes.ok) linkedRecord = match.id;
          }
        }
      }
    } catch { /* linking is a nicety, not the archive */ }

    sendJson(res, 200, {
      success: true,
      data: {
        name,
        archivedTo: targetFolder,
        files: local.files,
        sizeMB,
        seconds,
        linkedRecord,
        message: `Archived + verified: ${name} → Moon Prism (${sizeMB} MB in ${seconds}s)`,
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
    const nasFolder = path.join(NAS_CREATION_DIR, name);
    if (!fs.existsSync(nasFolder)) {
      throw new Error(`No archived copy found at ${nasFolder} — archive it first`);
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

// ============================================================================
// Social Kit — song → artwork + ratio-ready videos, staged for posting
// ============================================================================

// Where finished kits land. Desktop so drag-and-drop into an upload tab is
// one motion — the whole point is "post with minimal thought".
const SOCIAL_OUTPUT_DIR = '/Users/danielebuatti/Desktop/Social';
// maxSec = the longest clip that platform accepts (0 = no limit, keep the
// whole song); defaultSec = the excerpt length used when a recording is too
// long. Improvisations can run 20+ minutes, so the vertical/square cuts are
// trimmed to a shareable excerpt (see pickExcerpt).
const SOCIAL_RATIOS = [
  { key: 'reels',   label: 'Reels / TikTok / Shorts (9:16)', w: 1080, h: 1920, fileSuffix: '9x16', maxSec: 180, defaultSec: 90 },
  { key: 'feed',    label: 'Square feed (1:1)',              w: 1080, h: 1080, fileSuffix: '1x1',  maxSec: 180, defaultSec: 90 },
  { key: 'youtube', label: 'YouTube (16:9)',                 w: 1920, h: 1080, fileSuffix: '16x9', maxSec: 0,   defaultSec: 0 },
];

// Bump when the composed frame or encode changes — old renders then re-render
// instead of being reused by the fingerprint check.
const SOCIAL_RENDER_VERSION = 2;

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
  const scores = new Float64Array(maxStart + 1);
  for (let start = margin; start <= maxStart; start++) {
    let power = 0;
    let quiet = 0;
    for (let i = start; i < start + clipSec; i++) {
      // dB → linear power, so one loud spike can't mask a mostly-quiet window.
      power += Math.pow(10, profile[i] / 10);
      if (profile[i] < -50) quiet++;
    }
    scores[start] = (power / clipSec) * (1 - 0.5 * (quiet / clipSec));
  }

  const blocked = new Uint8Array(maxStart + 1);
  const chosen = [];
  const gap = Math.max(5, Math.round(clipSec * 0.1));
  for (let n = 0; n < count; n++) {
    let best = -1;
    let bestScore = -Infinity;
    for (let start = margin; start <= maxStart; start++) {
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
 * The cuts for one ratio: [{ startSec, clipSec, auto }]. Long songs get
 * `count` non-overlapping excerpts (strongest first); a manual start pins
 * the first cut and the rest are picked around it. Short songs and 16:9
 * always return a single full-length cut.
 */
function pickExcerptCuts(durationSec, ratio, requestedSec, requestedStartSec, profile, count = 1) {
  if (!ratio.maxSec) return [{ startSec: 0, clipSec: durationSec, auto: false }];

  const clipSec = Math.min(
    requestedSec || Math.min(ratio.defaultSec, ratio.maxSec),
    ratio.maxSec,
    durationSec,
  );
  if (durationSec <= clipSec) return [{ startSec: 0, clipSec: durationSec, auto: false }];

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
  return starts.map((startSec) => ({ startSec, clipSec, auto }));
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
 * Mux a composed still frame with the song. opts.startSec / opts.clipSec trim
 * the audio (long improvisations → a shareable excerpt); trimmed clips get
 * short fades so they don't start or stop mid-note.
 */
async function renderSocialVideo(audioFile, frameFile, outFile, opts = {}) {
  const startSec = Math.max(0, opts.startSec || 0);
  const clipSec = opts.clipSec || 0;
  const trimmed = startSec > 0;

  const fades = [];
  if (trimmed) fades.push('afade=t=in:st=0:d=1.2');
  if (clipSec > 4) fades.push(`afade=t=out:st=${(clipSec - 1.2).toFixed(2)}:d=1.2`);

  const args = ['-y', '-hide_banner', '-loglevel', 'error', '-nostdin'];
  // 1 fps input + -r 30 output: ffmpeg duplicates the still instead of
  // re-decoding the PNG 30×/s, which is the difference between ~5 min and
  // ~30 s on a 24-minute recording. Output is still proper 30 fps.
  args.push('-loop', '1', '-framerate', '1', '-i', frameFile);
  // Input-seek the audio only (fast, sample-accurate enough for music).
  if (trimmed) args.push('-ss', String(startSec));
  args.push('-i', audioFile);
  args.push('-map', '0:v', '-map', '1:a');
  args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-tune', 'stillimage', '-r', '30');
  if (fades.length) args.push('-af', fades.join(','));
  args.push('-c:a', 'aac', '-b:a', '192k');
  if (clipSec > 0) args.push('-t', clipSec.toFixed(2));

  // Encode to a temp name and rename on success, so an interrupted render never
  // leaves a playable-looking-but-truncated MP4 in the kit folder.
  const partFile = outFile.replace(/\.mp4$/i, '.part.mp4');
  args.push('-shortest', '-movflags', '+faststart', partFile);

  try {
    await runProcess('ffmpeg', args, { timeoutMs: 20 * 60 * 1000 });
    fs.renameSync(partFile, outFile);
  } catch (e) {
    try { fs.unlinkSync(partFile); } catch { /* nothing to clean */ }
    throw e;
  }
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

async function handleSocialBuildKit(req, res, body) {
  // Temp audio staged locally for the build — always removed afterwards.
  let stagedAudio = null;
  let framesDir = null;
  try {
    const improvisationId = typeof body.improvisationId === 'string' ? body.improvisationId.trim() : '';
    if (!/^[0-9a-f-]{36}$/i.test(improvisationId)) throw new Error('Missing or invalid improvisationId');

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
    const startedAt = Date.now();
    const step = (s) => console.log(`[social] ${displayTitle}: ${s}`);

    step('finding audio…');
    const audio = await findSocialAudio(session, record);
    stagedAudio = audio.file;
    const durationSec = await mediaDurationSec(audio.file);
    if (!durationSec) throw new Error('Could not read audio duration — is the file a valid MP3?');

    step('preparing artwork…');
    const art = await ensureSocialArtwork(session, record, displayTitle);

    const folder = path.join(SOCIAL_OUTPUT_DIR, safeFolderName(displayTitle));
    fs.mkdirSync(folder, { recursive: true });
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
    const audioBytes = fs.statSync(audio.file).size;
    // The renders depend only on audio + artwork + this code version — not on
    // excerpt settings — so unchanged assets reuse the existing files and
    // changing clips doesn't cost another multi-minute encode.
    const assetsUnchanged = !!(
      previous.renderVersion === SOCIAL_RENDER_VERSION
      && previous.audioBytes === audioBytes
      && previous.durationSec === durationSec
      && previous.artworkUrl === artUrl
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
        durationSec, ratio, requestedSec, requestedStartSec, profile, clipCount,
      );
      if (ratio.maxSec) shortCutCount = cuts.length;

      const frameFile = path.join(framesDir, `${ratio.key}.png`);
      await composeSocialFrame(art.file, frameFile, ratio.w, ratio.h);

      for (let i = 0; i < cuts.length; i++) {
        const { startSec, clipSec, auto } = cuts[i];
        const suffix = cuts.length > 1
          ? `${ratio.fileSuffix} (clip ${i + 1})`
          : ratio.fileSuffix;
        const where = startSec > 0
          ? ` (excerpt ${formatTime(startSec)}–${formatTime(startSec + clipSec)}${auto && profile ? ', strongest passage' : ''})`
          : '';
        step(`rendering ${ratio.label}${cuts.length > 1 ? `, clip ${i + 1}/${cuts.length}` : ''}${where}…`);

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
            fullSec: durationSec,
            sizeMB: prev.sizeMB ?? Math.round((fs.statSync(outFile).size / (1024 * 1024)) * 10) / 10,
          });
          continue;
        }
        await renderSocialVideo(audio.file, frameFile, outFile, { startSec, clipSec });
        files.push({
          name: path.basename(outFile),
          path: outFile,
          kind: 'video',
          ratio: ratio.key,
          ratioLabel: ratio.label,
          clipIndex: cuts.length > 1 ? i + 1 : undefined,
          clipCount: cuts.length > 1 ? cuts.length : undefined,
          clipStartSec: startSec,
          clipSec: Math.round(clipSec),
          autoExcerpt: (auto && !!profile) || undefined,
          fullSec: durationSec,
          sizeMB: Math.round((fs.statSync(outFile).size / (1024 * 1024)) * 10) / 10,
        });
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
    fs.writeFileSync(kitJsonPath, JSON.stringify({
      improvisationId, title: displayTitle, durationSec, clipCount, audioBytes,
      renderVersion: SOCIAL_RENDER_VERSION,
      caption: captions.instagram, captions,
      posted: previous.posted || {},
      artworkSource: art.source, artworkUrl: artUrl, builtAt: new Date().toISOString(),
      files: files.map((f) => ({
        name: f.name,
        ratio: f.ratio || null,
        ratioLabel: f.ratioLabel || null,
        clipIndex: f.clipIndex ?? null,
        clipCount: f.clipCount ?? null,
        clipStartSec: f.clipStartSec ?? null,
        clipSec: f.clipSec ?? null,
        autoExcerpt: f.autoExcerpt ?? null,
        sizeMB: f.sizeMB ?? null,
        platform: f.platform || null,
      })),
    }, null, 2));

    const seconds = Math.round((Date.now() - startedAt) / 100) / 10;
    step(`done in ${seconds}s`);

    sendJson(res, 200, {
      success: true,
      data: {
        title: displayTitle,
        folder,
        durationSec,
        clipCount,
        caption: captions.instagram,
        captions,
        posted: previous.posted || {},
        artworkSource: art.source,
        artworkUrl: art.artworkUrl || record.artwork_url || null,
        files,
        seconds,
        message: `Social kit ready: ${displayTitle} (${formatTime(durationSec)} song, ${files.filter((f) => f.kind === 'video').length} videos in ${seconds}s)`,
      },
      timestamp: new Date().toISOString(),
    }, req);
  } catch (e) {
    console.error(`[social/build-kit] ${e.message}`);
    sendJson(res, 500, { success: false, error: e.message, timestamp: new Date().toISOString() }, req);
  } finally {
    // Temp files are per-build; never leave audio/frames behind.
    if (stagedAudio) { try { fs.unlinkSync(stagedAudio); } catch { /* already gone */ } }
    if (framesDir) { try { fs.rmSync(framesDir, { recursive: true, force: true }); } catch { /* temp dir */ } }
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
        caption: kit.caption,
        // Older kits only have `caption`; treat it as the Instagram one.
        captions: kit.captions || { instagram: kit.caption || '' },
        posted: kit.posted || {},
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
        } else if (pathname === '/social/build-kit' && req.method === 'POST') {
          await handleSocialBuildKit(req, res, parsedBody);
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
    console.log('  GET  /sync/status             - Query Supabase sync status');
    console.log('  POST /nas/mount               - Open macOS mount dialog for the NAS');
    console.log('  GET  /nas/status              - NAS mount + reachability status');
    console.log('  GET  /captures                - List local Logic captures');
    console.log('  POST /captures/create-entry   - Create app entry for a capture');
    console.log('  GET  /logic/projects          - List top-level Logic projects + archive status');
    console.log('  POST /logic/archive           - Archive a project to the NAS (copy + verify)');
    console.log('  POST /logic/trash-local       - Trash local copy after re-verifying the NAS copy');
    console.log('  POST /social/build-kit        - Song → artwork + ratio-ready videos (staged on Desktop)');
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