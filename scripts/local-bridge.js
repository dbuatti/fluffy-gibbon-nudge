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

async function handleMountNas(req, res) {
  const smbCandidates = [
    { host: '100.124.90.53', url: 'smb://100.124.90.53/Moon%20Prism' },
    { host: 'Crystal-Tokyo.local', url: 'smb://Crystal-Tokyo.local/Moon%20Prism' },
    { host: '192.168.1.102', url: 'smb://192.168.1.102/Moon%20Prism' },
  ];

  try {
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
    sendJson(res, 200, {
      success: true,
      data: {
        mounted,
        nasPath: mounted ? '/Volumes/Moon Prism' : null,
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

    let folderPath = rawPath.endsWith('.logicx') ? path.dirname(rawPath) : rawPath;
    folderPath = folderPath.replace(/\/+$/, '');
    if (!folderPath) throw new Error('Could not resolve folder from path');

    // SMB mounts can be stale for a moment right after connecting (Finder
    // already shows the volume, but stat() on deep paths fails) — wait
    // briefly and retry once before concluding anything.
    const existsWithRetry = async (p) => {
      if (fs.existsSync(p)) return true;
      await new Promise((resolve) => setTimeout(resolve, 750));
      return fs.existsSync(p);
    };

    if (!(await existsWithRetry(folderPath))) {
      const volume = folderPath.startsWith('/Volumes/') ? folderPath.split('/')[2] : null;
      if (volume) {
        if (fs.existsSync(`/Volumes/${volume}`)) {
          throw new Error(`Volume is mounted, but the folder isn't there anymore: ${folderPath} — was it moved or renamed?`);
        }
        throw new Error(`Folder not reachable — volume "${volume}" is not mounted. Use "Mount NAS" and try again.`);
      }
      throw new Error(`Folder not found on this Mac: ${folderPath}`);
    }

    const stat = await fs.promises.stat(folderPath);
    if (!stat.isDirectory()) throw new Error(`Not a folder: ${folderPath}`);

    await new Promise((resolve, reject) => {
      execFile('open', [folderPath], { timeout: 10000 }, (err) => (err ? reject(err) : resolve()));
    });

    sendJson(res, 200, {
      success: true,
      data: { success: true, path: folderPath, message: `Opened in Finder: ${folderPath}` },
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
// maxSec = the longest clip that platform accepts; 0 means "no limit, use the
// whole song". Improvisations can run 20+ minutes, so the vertical/square
// cuts are trimmed to a shareable excerpt (see pickExcerpt).
const SOCIAL_RATIOS = [
  { key: 'reels',   label: 'Reels / TikTok / Shorts (9:16)', w: 1080, h: 1920, fileSuffix: '9x16', maxSec: 90 },
  { key: 'feed',    label: 'Square feed (1:1)',              w: 1080, h: 1080, fileSuffix: '1x1',  maxSec: 90 },
  { key: 'youtube', label: 'YouTube (16:9)',                 w: 1920, h: 1080, fileSuffix: '16x9', maxSec: 0 },
];

/** 95 → "1:35" */
function formatTime(sec) {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Which slice of a long piece to use for a short-form clip. Improvisations
 * usually settle after the opening minutes, so skip the first 15% and land
 * inside the platform's limit. Returns { startSec, clipSec }.
 */
function pickExcerpt(durationSec, maxSec) {
  if (!maxSec || durationSec <= maxSec) return { startSec: 0, clipSec: durationSec };
  const startSec = Math.min(Math.round(durationSec * 0.15), Math.max(0, durationSec - maxSec));
  return { startSec, clipSec: Math.min(maxSec, durationSec - startSec) };
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
    if (clips.length) return { file: clips[0].full, source: 'nas' };
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
  args.push('-shortest', '-movflags', '+faststart', outFile);

  await runProcess('ffmpeg', args, { timeoutMs: 20 * 60 * 1000 });
}

/** Caption template — title + a short line + hashtags, editable in the app. */
function buildSocialCaption(title) {
  const words = title.toLowerCase().split(/\s+/).filter((w) => w.length > 3 && !['with', 'that', 'this'].includes(w));
  const derived = [...new Set(words.map((w) => `#${w.replace(/[^a-z0-9]/g, '')}`))].slice(0, 3);
  const tags = ['#piano', '#improvisation', '#originalmusic', '#calmmusic', '#instrumental', ...derived].join(' ');
  return `${title}\n\nA quiet piano improvisation.\n\n${tags}`;
}

async function handleSocialBuildKit(req, res, body) {
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
    const startedAt = Date.now();
    const step = (s) => console.log(`[social] ${displayTitle}: ${s}`);

    step('finding audio…');
    const audio = await findSocialAudio(session, record);
    const durationSec = await mediaDurationSec(audio.file);
    if (!durationSec) throw new Error('Could not read audio duration — is the file a valid MP3?');

    step('preparing artwork…');
    const art = await ensureSocialArtwork(session, record, displayTitle);

    const folder = path.join(SOCIAL_OUTPUT_DIR, safeFolderName(displayTitle));
    fs.mkdirSync(folder, { recursive: true });

    const artCopy = path.join(folder, `${displayTitle} - artwork.png`);
    fs.copyFileSync(art.file, artCopy);

    const files = [];
    const framesDir = path.join(os.tmpdir(), `social-frames-${Date.now()}`);
    fs.mkdirSync(framesDir, { recursive: true });
    for (const ratio of SOCIAL_RATIOS) {
      const { startSec, clipSec } = pickExcerpt(durationSec, ratio.maxSec);
      const where = startSec > 0
        ? ` (excerpt ${formatTime(startSec)}–${formatTime(startSec + clipSec)})`
        : '';
      step(`rendering ${ratio.label}${where}…`);
      const frameFile = path.join(framesDir, `${ratio.key}.png`);
      await composeSocialFrame(art.file, frameFile, ratio.w, ratio.h);
      const outFile = path.join(folder, `${displayTitle} - ${ratio.fileSuffix}.mp4`);
      await renderSocialVideo(audio.file, frameFile, outFile, { startSec, clipSec });
      files.push({
        name: path.basename(outFile),
        path: outFile,
        kind: 'video',
        ratio: ratio.key,
        ratioLabel: ratio.label,
        clipStartSec: startSec,
        clipSec: Math.round(clipSec),
        fullSec: durationSec,
        sizeMB: Math.round((fs.statSync(outFile).size / (1024 * 1024)) * 10) / 10,
      });
    }
    try { fs.rmSync(framesDir, { recursive: true, force: true }); } catch { /* temp dir */ }

    const caption = buildSocialCaption(displayTitle);
    const captionPath = path.join(folder, `${displayTitle} - caption.txt`);
    fs.writeFileSync(captionPath, `${caption}\n`);
    files.push({ name: path.basename(captionPath), path: captionPath, kind: 'text' });
    files.push({ name: path.basename(artCopy), path: artCopy, kind: 'image' });

    // Kit manifest so the app can restore state without rebuilding.
    fs.writeFileSync(path.join(folder, 'kit.json'), JSON.stringify({
      improvisationId, title: displayTitle, durationSec, caption,
      artworkSource: art.source, builtAt: new Date().toISOString(),
      files: files.map((f) => ({
        name: f.name,
        ratio: f.ratio || null,
        ratioLabel: f.ratioLabel || null,
        clipStartSec: f.clipStartSec ?? null,
        clipSec: f.clipSec ?? null,
        sizeMB: f.sizeMB ?? null,
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
        caption,
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
  }
}

async function handleSocialKitStatus(req, res, query) {
  try {
    const improvisationId = query.get('id') || '';
    if (!/^[0-9a-f-]{36}$/i.test(improvisationId)) throw new Error('Missing or invalid id');

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
    const folder = path.join(SOCIAL_OUTPUT_DIR, safeFolderName(displayTitle));
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
        return {
          name: f.name,
          path: full,
          kind: f.name.endsWith('.mp4') ? 'video' : f.name.endsWith('.png') ? 'image' : 'text',
          ratio: f.ratio || undefined,
          ratioLabel: f.ratioLabel || undefined,
          clipStartSec: f.clipStartSec ?? undefined,
          clipSec: f.clipSec ?? undefined,
          sizeMB: f.sizeMB ?? Math.round((fs.statSync(full).size / (1024 * 1024)) * 10) / 10,
        };
      })
      .filter(Boolean);

    sendJson(res, 200, {
      success: true,
      data: { built: files.length > 0, folder, title: displayTitle, durationSec: kit.durationSec, caption: kit.caption, files },
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