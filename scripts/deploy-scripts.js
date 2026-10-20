#!/usr/bin/env node
'use strict';

/**
 * deploy-scripts.js
 *
 * Syncs the canonical scripts from this repo (scripts/) to the live
 * production location (/Users/danielebuatti/Music/Logic/_Scripts/).
 *
 * Run via: pnpm ch:deploy
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Parse a script as ESM before it is allowed anywhere near the live bridge.
 *
 * This exists because of a real outage: scripts/local-bridge.js spent several
 * commits with mismatched braces and a duplicated function header, so the
 * module could not be parsed at all. The bridge was already running from before
 * the breakage, so nothing looked wrong — until the next restart, when it came
 * up dead and the cause was not obvious.
 *
 * The gotcha is that `node --check <file>.js` parses as CommonJS, because the
 * repo's package.json says `"type": "module"` but a bare temp file has no such
 * context. Checking a `.js` copy therefore *passes* on genuinely broken ESM.
 * The file must be copied to a `.mjs` path so it is parsed the way it will
 * actually be loaded.
 *
 * Returns null when the file is fine, or a short error string when it is not.
 */
function checkEsmSyntax(file) {
  const tmp = path.join(os.tmpdir(), `deploy-check-${path.basename(file, '.js')}-${process.pid}.mjs`);
  try {
    fs.copyFileSync(file, tmp);
    const result = spawnSync(process.execPath, ['--check', tmp], { encoding: 'utf-8' });
    if (result.status === 0) return null;
    const output = (result.stderr || result.stdout || 'unknown error').trim();
    // Lead with the location, which is the part that actually helps.
    return output.split('\n').slice(0, 4).join('\n');
  } finally {
    try { fs.unlinkSync(tmp); } catch { /* temp file already gone */ }
  }
}

const REPO_ROOT = path.dirname(__dirname);
const SOURCE_DIR = path.join(REPO_ROOT, 'scripts');
const TARGET_DIR = '/Users/danielebuatti/Music/Logic/_Scripts';

const FILES = [
  'composer-hub.js',
  'composer-hub-login.js',
  'meld-scene.js',
  'finish-take.js',
  'local-bridge.js',
  'sync-to-nas.js',
  'qwebchannel.cache.js',
  // The Workflow Picker source must be synced too — osacompile below builds
  // the .app from the TARGET copy, so without this the live app silently
  // stays frozen at whatever version was last copied by hand.
  'Workflow Picker (Consolidated).applescript',
];

async function main() {
  console.log('Deploying scripts from repo → _Scripts\n');
  console.log(`Source: ${SOURCE_DIR}`);
  console.log(`Target: ${TARGET_DIR}\n`);

  if (!fs.existsSync(TARGET_DIR)) {
    console.error(`Target directory does not exist: ${TARGET_DIR}`);
    process.exit(1);
  }

  let allOk = true;

  // Gate first: never copy a script that cannot even be parsed. Failing before
  // any file is written means a bad commit can't half-update the live bridge.
  for (const file of FILES) {
    const src = path.join(SOURCE_DIR, file);
    if (!fs.existsSync(src) || !file.endsWith('.js')) continue;
    const syntaxError = checkEsmSyntax(src);
    if (syntaxError) {
      console.error(`  ✗ ${file}: will not parse as ESM — refusing to deploy`);
      console.error(`\n${syntaxError}\n`);
      allOk = false;
    }
  }
  if (!allOk) {
    console.error('Syntax check failed. Nothing was copied — fix the errors above and retry.');
    process.exit(1);
  }

  for (const file of FILES) {
    const src = path.join(SOURCE_DIR, file);
    const dst = path.join(TARGET_DIR, file);

    if (!fs.existsSync(src)) {
      console.warn(`  ⚠ Source missing: ${file}`);
      allOk = false;
      continue;
    }

    try {
      fs.copyFileSync(src, dst);
      fs.chmodSync(dst, 0o755);
      console.log(`  ✓ ${file}`);
    } catch (err) {
      console.error(`  ✗ ${file}: ${err.message}`);
      allOk = false;
    }
  }

  // Also recompile the AppleScript app if the source changed
  const applescriptSource = path.join(TARGET_DIR, 'Workflow Picker (Consolidated).applescript');
  const applescriptApp = path.join(TARGET_DIR, 'Workflow Picker.app');

  if (fs.existsSync(applescriptSource)) {
    console.log('\nRecompiling Workflow Picker.app...');
    const result = spawnSync('osacompile', [
      '-o', applescriptApp,
      applescriptSource
    ], { encoding: 'utf-8' });

    if (result.status === 0) {
      console.log('  ✓ Workflow Picker.app rebuilt');
    } else {
      console.error('  ✗ Recompile failed:', result.stderr || result.stdout);
      allOk = false;
    }
  }

  console.log();
  if (allOk) {
    console.log('All done — Workflow Picker is now running the latest scripts.');
  } else {
    console.error('Some steps failed. Check output above.');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});