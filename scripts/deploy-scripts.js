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
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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