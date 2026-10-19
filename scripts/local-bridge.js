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
    config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
  }
  return config;
}

// ============================================================================
// Helpers
// ============================================================================

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': config.allowedOrigins.join(', '),
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  });
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
    child.stdout.on('data', d => stdout += d);
    child.stderr.on('data', d => stderr += d);
    child.on('close', code => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(stderr || `Exit code ${code}`));
    });
    child.on('error', reject);
  });
}

function runAppleScript(script) {
  return new Promise((resolve, reject) => {
    const child = spawn('osascript', ['-e', script], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', d => stdout += d);
    child.stderr.on('data', d => stderr += d);
    child.on('close', code => code === 0 ? resolve(stdout.trim()) : reject(new Error(stderr)));
    child.on('error', reject);
  });
}

async function checkMeldConnected() {
  try {
    const { default: WebSocket } = await import('ws');
    const ws = new WebSocket('ws://127.0.0.1:13376');
    await new Promise((resolve, reject) => {
      ws.on('open', () => { ws.close(); resolve(true); });
      ws.on('error', reject);
      setTimeout(() => reject(new Error('timeout')), 1500);
    });
    return true;
  } catch {
    return false;
  }
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
    await fs.promises.access(nasPath);
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// Route Handlers
// ============================================================================

async function handlePing(req, res) {
  sendJson(res, 200, { success: true, data: { pong: true }, timestamp: new Date().toISOString() });
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
      version: '1.0.0',
      uptimeSeconds: Math.floor((Date.now() - START_TIME) / 1000),
      meldConnected,
      logicRunning,
      nasMounted,
      nasPath: nasMounted ? '/Volumes/Moon Prism' : undefined,
      config: { port: config.port, allowedOrigins: config.allowedOrigins },
    },
    timestamp: new Date().toISOString(),
  });
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

      default:
        sendJson(res, 400, { success: false, error: `Unknown mode: ${mode}`, timestamp: new Date().toISOString() });
        return;
    }

    sendJson(res, 200, {
      success: true,
      data: { launched: true, mode, message: result.message, ...result },
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    sendJson(res, 500, { success: false, error: e.message, timestamp: new Date().toISOString() });
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
    });
  } catch (e) {
    sendJson(res, 500, { success: false, error: e.message, timestamp: new Date().toISOString() });
  }
}

async function handleOpenLogic(req, res, body) {
  try {
    const { projectPath } = body;
    if (!projectPath) throw new Error('Missing projectPath');
    await runAppleScript(`tell application "Finder" to open POSIX file "${projectPath}"`);
    sendJson(res, 200, {
      success: true,
      data: { success: true, projectPath, message: `Opened Logic project: ${projectPath}` },
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    sendJson(res, 500, { success: false, error: e.message, timestamp: new Date().toISOString() });
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
      sendJson(res, 500, { success: false, error: result.error, timestamp: new Date().toISOString() });
      return;
    }
    sendJson(res, 200, {
      success: true,
      data: result.data,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    sendJson(res, 500, { success: false, error: e.message, timestamp: new Date().toISOString() });
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
      res.writeHead(204, {
        'Access-Control-Allow-Origin': config.allowedOrigins.join(', '),
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400',
      });
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
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
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
        } else {
          sendJson(res, 404, { success: false, error: 'Not found', timestamp: new Date().toISOString() });
        }
      } catch (e) {
        sendJson(res, 500, { success: false, error: e.message, timestamp: new Date().toISOString() });
      }
    });
  });

  server.listen(config.port, '127.0.0.1', () => {
    console.log(`🌉 Local Bridge running at http://127.0.0.1:${config.port}`);
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

startServer();