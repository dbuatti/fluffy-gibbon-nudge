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
import { spawn, execFile } from 'child_process';
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
  const origin = req.headers.origin;
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
    sendJson(res, 401, { success: false, error: 'Missing or invalid Authorization header', timestamp: new Date().toISOString() });
    return false;
  }
  const token = auth.slice(7);
  if (token !== config.token) {
    sendJson(res, 403, { success: false, error: 'Invalid token', timestamp: new Date().toISOString() });
    return false;
  }
  return true;
}

function runScript(scriptName, args = []) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(SCRIPTS_DIR, scriptName);
    const child = spawn('node', [scriptPath, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('Script timed out after 120s')); }, 120000);
    child.stdout.on('data', d => stdout += d);
    child.stderr.on('data', d => stderr += d);
    child.on('close', code => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(stderr || `Exit code ${code}`));
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
  try {
    const { stdout } = await new Promise((resolve, reject) => {
      execFile('tailscale', ['status', '--json'], (err, stdout) => {
        if (err) reject(err);
        else resolve({ stdout });
      });
    });
    const status = JSON.parse(stdout);
    return status.BackendState === 'Running';
  } catch {
    return false;
  }
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
  const candidates = ['smb://Crystal-Tokyo.local', 'smb://100.124.90.53', 'smb://192.168.1.102'];
  try {
    execFile('open', [candidates[0]], (err) => {
      if (err) execFile('open', [candidates[1]], () => {});
    });
    // Wait briefly to see if mount succeeded
    await new Promise(r => setTimeout(r, 2000));
    const mounted = await checkNasMounted();
    sendJson(res, 200, {
      success: true,
      data: {
        message: mounted
          ? 'NAS mounted successfully.'
          : 'Mount dialog opened in Finder. Complete authentication if prompted, then retry.',
        mounted,
        candidates,
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

async function handlePing(req, res) {
  sendJson(res, 200, { success: true, data: { pong: true }, timestamp: new Date().toISOString() }, req);
}

async function handleStatus(req, res) {
  const [meldConnected, logicRunning, nasMounted] = await Promise.all([
    checkMeldConnected(),
    checkLogicRunning(),
    checkNasMounted(),
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
        const output = await runScript('sync-to-nas.js', ['--apply']);
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
      const parsedBody = body ? JSON.parse(body) : {};
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
        } else if (pathname === '/sync/status' && req.method === 'GET') {
          await handleSyncStatus(req, res, query);
        } else if (pathname === '/nas/mount' && req.method === 'POST') {
          await handleMountNas(req, res);
        } else if (pathname === '/nas/status' && req.method === 'GET') {
          await handleNasStatus(req, res);
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
    console.log('  GET  /sync/status             - Query Supabase sync status');
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