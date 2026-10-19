#!/usr/bin/env node
'use strict';

/**
 * meld-scene.js
 *
 * Switches Meld Studio to a named scene (and optionally starts recording),
 * using Meld's documented local WebChannel API:
 *   https://github.com/MeldStudio/streamdeck/blob/main/WebChannelAPI.md
 *
 * Meld listens on ws://127.0.0.1:13376 whenever the app is running. The API
 * itself uses Qt's QWebChannel protocol, which needs Qt's small JS client
 * library (qwebchannel.js) — this script fetches and caches that file next
 * to itself the first time it runs, then reuses the cached copy after that.
 *
 * Usage:
 *   node meld-scene.js "Scene Name"            -> just switch scenes
 *   node meld-scene.js "Scene Name" --record    -> switch scenes, then start recording
 *
 * NOTE: this was written against Meld's published API docs but could not be
 * tested live against a running Meld Studio instance in this environment —
 * treat the first run as a test, and check the console output if it doesn't
 * behave as expected (it's built to print a clear error rather than fail
 * silently, e.g. listing available scene names if the one you asked for
 * isn't found).
 */

import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const QWEBCHANNEL_URL = 'https://packages.streamwithmeld.com/qt6.8/qwebchannel.js';
const CACHE_PATH = path.join(__dirname, 'qwebchannel.cache.js');
const MELD_WS_URL = 'ws://127.0.0.1:13376';

async function loadQWebChannel() {
  let source;
  if (fs.existsSync(CACHE_PATH)) {
    source = fs.readFileSync(CACHE_PATH, 'utf8');
  } else {
    const res = await fetch(QWEBCHANNEL_URL);
    if (!res.ok) {
      throw new Error(`Failed to fetch qwebchannel.js (HTTP ${res.status}). Check your internet connection.`);
    }
    source = await res.text();
    fs.writeFileSync(CACHE_PATH, source);
  }

  // qwebchannel.js is written to run in a browser and attach itself to
  // `window`/global scope. Run it in a small sandboxed context and pull
  // the QWebChannel constructor out however it ends up exposed.
  const sandbox = {};
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.module = { exports: {} };
  sandbox.exports = sandbox.module.exports;
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'qwebchannel.js' });

  const QWebChannel =
    sandbox.QWebChannel ||
    (sandbox.module.exports && sandbox.module.exports.QWebChannel) ||
    sandbox.module.exports;

  if (!QWebChannel) {
    throw new Error('Could not locate the QWebChannel constructor after loading qwebchannel.js — the library format may have changed.');
  }
  return QWebChannel;
}

const CONNECT_RETRY_ATTEMPTS = 8;
const CONNECT_RETRY_DELAY_MS = 1000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Meld's WebChannel server may not be up yet on a cold launch — the
 * AppleScript side only waits a fixed couple of seconds after activating
 * Meld, which isn't a guarantee. Retrying the connection here (rather than
 * guessing a longer fixed delay upstream) means this script adapts to
 * however long Meld actually takes to boot, instead of failing on a slow
 * launch or wasting time on a fast one.
 */
async function connectWithRetry() {
  for (let attempt = 1; attempt <= CONNECT_RETRY_ATTEMPTS; attempt += 1) {
    try {
      return await new Promise((resolve, reject) => {
        const ws = new WebSocket(MELD_WS_URL);
        ws.onopen = () => resolve(ws);
        ws.onerror = (err) => reject(err);
      });
    } catch (err) {
      if (attempt === CONNECT_RETRY_ATTEMPTS) throw err;
      await sleep(CONNECT_RETRY_DELAY_MS);
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  const shouldRecord = args.includes('--record');
  const sceneName = args.find((a) => a !== '--record');

  if (!sceneName) {
    console.error('Usage: node meld-scene.js "<Scene Name>" [--record]');
    process.exit(1);
  }

  const QWebChannel = await loadQWebChannel();

  let ws;
  try {
    ws = await connectWithRetry();
  } catch (err) {
    console.error(
      `Could not connect to Meld Studio at ${MELD_WS_URL} after ${CONNECT_RETRY_ATTEMPTS} tries ` +
      `(~${CONNECT_RETRY_ATTEMPTS * CONNECT_RETRY_DELAY_MS / 1000}s) — is Meld actually running?`
    );
    process.exit(1);
  }

  // Fail fast instead of hanging forever if Meld accepts the socket but never
  // answers (e.g. mid-update). Every success path exits on its own, so this
  // only ever fires on a genuine hang.
  setTimeout(() => {
    console.error('Timed out after 20s waiting for Meld to respond — is it stuck?');
    process.exit(1);
  }, 20000);

  ws.onerror = (err) => {
    console.error('Meld connection error:', err.message || err);
    process.exit(1);
  };

  new QWebChannel(ws, (channel) => {
    const meld = channel.objects.meld;
    if (!meld) {
      console.error('Connected, but no `meld` object was exposed on the channel.');
      process.exit(1);
    }

    const items = (meld.session && meld.session.items) || {};
    const sceneEntry = Object.entries(items).find(
      ([, item]) => item.type === 'scene' && item.name === sceneName
    );

    if (!sceneEntry) {
      const available = Object.values(items)
        .filter((i) => i.type === 'scene')
        .map((i) => i.name);
      console.error(`Scene "${sceneName}" not found. Available scenes: ${available.join(', ') || '(none found)'}`);
      process.exit(1);
    }

    const [sceneId] = sceneEntry;
    meld.showScene(sceneId);
    console.log(`Switched Meld to scene: ${sceneName}`);

    if (shouldRecord) {
      setTimeout(() => {
        meld.sendCommand('meld.startRecordingAction');
        console.log('Recording started.');
        setTimeout(() => process.exit(0), 500);
      }, 500);
    } else {
      setTimeout(() => process.exit(0), 500);
    }
  });
}

main().catch((err) => {
  console.error('meld-scene.js failed:', err.message || err);
  process.exit(1);
});