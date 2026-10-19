#!/usr/bin/env node
'use strict';

/**
 * sync-to-nas.js
 *
 * Syncs local Logic captures to NAS (Moon Prism) for backup/redundancy.
 * Run manually when on home network, or via cron/launchd.
 *
 * Usage:
 *   node sync-to-nas.js           # dry-run (shows what would sync)
 *   node sync-to-nas.js --apply   # actually copy files + update Supabase
 *   node sync-to-nas.js --status  # show sync status from Supabase
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFileSync, spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REPO_ROOT = path.dirname(__dirname);
const CONFIG_DIR = path.join(os.homedir(), '.config', 'composer-hub');
const AUTH_FILE = path.join(CONFIG_DIR, 'auth.json');

const SUPABASE_URL = 'https://rqesjpnhrjdjnrzdhzgw.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJxZXNqcG5ocmpkam5yemRoemd3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIwMzgwNzgsImV4cCI6MjA3NzYxNDA3OH0.NqFKBFI-l96hWOGNc8QxuQdaGKVmvzw6LDGO_MsIoQc';

const LOCAL_CAPTURES_DIR = '/Users/danielebuatti/Music/Logic/_Captures';
const NAS_BASE = '/Volumes/Moon Prism/DBP/Backups/Logic';

const DRY_RUN = process.argv.includes('--dry-run') || !process.argv.includes('--apply');
const SHOW_STATUS = process.argv.includes('--status');


function fetchWithTimeout(url, options = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(timer));
}

async function getSession() {
  if (!fs.existsSync(AUTH_FILE)) return null;
  try {
    const auth = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf-8'));
    if (!auth.refresh_token) return null;

    const res = await fetchWithTimeout(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { 'apikey': ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: auth.refresh_token }),
    });

    if (!res.ok) {
      fs.unlinkSync(AUTH_FILE);
      return null;
    }

    const body = await res.json();
    fs.writeFileSync(AUTH_FILE, JSON.stringify({
      refresh_token: body.refresh_token,
      user_id: body.user.id,
      email: body.user.email,
    }, null, 2));
    fs.chmodSync(AUTH_FILE, 0o600);

    return { access_token: body.access_token, user_id: body.user.id };
  } catch {
    return null;
  }
}

function checkNasMounted() {
  try {
    fs.accessSync('/Volumes/Moon Prism', fs.constants.R_OK | fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

async function tryMountNas() {
  const candidates = ['smb://100.124.90.53/Moon%20Prism', 'smb://Crystal-Tokyo.local/Moon%20Prism', 'smb://192.168.1.102/Moon%20Prism'];
  for (const url of candidates) {
    try {
      execFileSync('open', [url], { stdio: 'ignore', timeout: 5000 });
      // Poll (rather than busy-spin) for the volume to appear — mounting over
      // SMB/Tailscale usually takes a couple of seconds.
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline) {
        if (checkNasMounted()) return true;
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    } catch {
      // Try next candidate
    }
  }
  return checkNasMounted();
}

function getLocalCaptures() {
  if (!fs.existsSync(LOCAL_CAPTURES_DIR)) return [];
  return fs.readdirSync(LOCAL_CAPTURES_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory() && d.name.endsWith('.logicx'))
    .map(d => {
      const fullPath = path.join(LOCAL_CAPTURES_DIR, d.name);
      const stat = fs.statSync(fullPath);
      return { name: d.name, fullPath, mtime: stat.mtimeMs, size: stat.size };
    })
    .sort((a, b) => b.mtime - a.mtime);
}

function getNasSyncPath(captureName) {
  // Date from capture name: 20261019-143022 My Title.logicx
  const match = captureName.match(/^(\d{8})/);
  const dateFolder = match ? match[1] : new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const sanitized = captureName.replace(/\.logicx$/, '').replace(/[^\w\s-]/g, '_');
  const result = path.join(NAS_BASE, dateFolder, sanitized + '.logicx');
  // Security: ensure result is within NAS_BASE
  if (!result.startsWith(NAS_BASE + path.sep) && result !== NAS_BASE) {
    throw new Error(`Path traversal detected: ${captureName}`);
  }
  return result;
}

async function getSupabaseSyncStatus(session) {
  const res = await fetchWithTimeout(
    `${SUPABASE_URL}/rest/v1/improvisations?user_id=eq.${encodeURIComponent(session.user_id)}&select=id,logic_project_path,nas_folder_path&logic_project_path=not.is.null`,
    { headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${session.access_token}` } }
  );
  if (!res.ok) throw new Error(`Supabase query failed: ${res.status}`);
  return res.json();
}

async function updateNasFolderPath(session, improvisationId, nasPath) {
  const res = await fetchWithTimeout(
    `${SUPABASE_URL}/rest/v1/improvisations?id=eq.${improvisationId}`,
    {
      method: 'PATCH',
      headers: {
        'apikey': ANON_KEY,
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({ nas_folder_path: nasPath }),
    }
  );
  if (!res.ok) throw new Error(`Supabase update failed: ${res.status}`);
}

/**
 * Recursive folder size in MB (source is always local, so this is cheap).
 * Shown before each copy so a long NAS transfer is never a silent "hang".
 */
function dirSizeMB(dirPath) {
  let bytes = 0;
  const stack = [dirPath];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue; // unreadable subfolder — size is an estimate anyway
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile()) {
        try { bytes += fs.statSync(fullPath).size; } catch { /* raced away */ }
      }
    }
  }
  return bytes / (1024 * 1024);
}

/**
 * Copy a .logicx bundle to the NAS with visible progress. Prefers rsync
 * (--progress streams live per-file output, and same-size/same-mtime files
 * are skipped, so an interrupted --apply resumes instead of restarting);
 * falls back to a plain recursive copy if rsync is unavailable.
 */
function copyTree(src, dest) {
  // A partial dest bundle (from an interrupted run) should have contents
  // synced into it; otherwise copy src AS dest — which also preserves the
  // sanitised rename that getNasSyncPath computed.
  const plainArgs = fs.existsSync(dest) && fs.statSync(dest).isDirectory()
    ? ['-a', `${src}/`, `${dest}/`]
    : ['-a', src, dest];
  for (const args of [['-a', '--progress', ...plainArgs.slice(1)], plainArgs]) {
    const result = spawnSync('rsync', args, { stdio: ['ignore', 'inherit', 'inherit'] });
    if (result.error && result.error.code === 'ENOENT') break; // rsync not installed → cpSync fallback
    if (result.status === 0) return;
  }
  fs.cpSync(src, dest, { recursive: true });
}

async function main() {
  console.log('🔄 sync-to-nas');
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (use --apply to copy)' : 'APPLY'}`);
  console.log('');

  // Check NAS - try to mount if not mounted
  let nasMounted = checkNasMounted();
  if (!nasMounted) {
    console.log('NAS not mounted. Attempting to mount via Tailscale...');
    nasMounted = await tryMountNas();
  }
  console.log(`NAS mounted: ${nasMounted ? '✅' : '❌'} (${nasMounted ? 'OK' : 'Not mounted — check Tailscale connection'})`);
  if (!nasMounted) {
    console.log('\n❌ NAS not mounted. Mount it first, then re-run.');
    process.exit(1);
  }

  // Get Supabase session
  const session = await getSession();
  if (!session) {
    console.log('\n❌ No Supabase session. Run: node composer-hub-login.js');
    process.exit(1);
  }
  console.log(`Logged in as: ${session.user_id}`);

  // Get local captures
  const localCaptures = getLocalCaptures();
  console.log(`\nLocal captures found: ${localCaptures.length}`);

  // Get existing sync status from Supabase
  const supabaseEntries = await getSupabaseSyncStatus(session);
  const syncedPaths = new Set(supabaseEntries
    .filter(e => e.nas_folder_path)
    .map(e => e.nas_folder_path));

  console.log(`Already synced (in Supabase): ${syncedPaths.size}`);

  // Find captures needing sync
  const toSync = localCaptures.filter(c => {
    const nasPath = getNasSyncPath(c.name);
    return !syncedPaths.has(nasPath);
  });

  if (toSync.length === 0) {
    console.log('\n✅ All captures already synced to NAS.');
    return;
  }

  console.log(`\nTo sync: ${toSync.length}`);
  for (const c of toSync) {
    const nasPath = getNasSyncPath(c.name);
    console.log(`  ${c.name} → ${nasPath}`);
  }

  if (DRY_RUN) {
    console.log('\n🔍 Dry run complete. Run with --apply to copy files and update Supabase.');
    return;
  }

  // Apply: copy files and update Supabase
  console.log('\n📦 Copying files...');
  let copied = 0;
  let updated = 0;
  let errors = 0;

  for (const c of toSync) {
    const nasPath = getNasSyncPath(c.name);
    try {
      // Ensure NAS directory exists
      fs.mkdirSync(path.dirname(nasPath), { recursive: true });

      // Copy the bundle (a .logicx is a directory tree). copyTree uses rsync
      // with live progress — which also resumes cleanly if a previous --apply
      // was interrupted — and falls back to a plain recursive copy.
      if (fs.existsSync(c.fullPath)) {
        console.log(`    (${dirSizeMB(c.fullPath).toFixed(1)} MB — progress below)`);
        const startedAt = Date.now();
        copyTree(c.fullPath, nasPath);
        console.log(`  ✅ Copied: ${c.name} (${((Date.now() - startedAt) / 1000).toFixed(1)}s)`);
        copied++;
      } else {
        console.log(`  ⚠️ Source missing: ${c.fullPath}`);
        errors++;
        continue;
      }

      // Update Supabase - find matching improvisation by logic_project_path
      const match = supabaseEntries.find(e => e.logic_project_path?.includes(c.name));
      if (match) {
        await updateNasFolderPath(session, match.id, nasPath);
        console.log(`  📝 Updated Supabase: ${match.id}`);
        updated++;
      } else {
        console.log(`  ⚠️ No matching Supabase entry for: ${c.name}`);
      }
    } catch (e) {
      console.log(`  ❌ Failed: ${c.name} — ${e.message}`);
      errors++;
    }
  }

  console.log(`\n📊 Summary: ${copied} copied, ${updated} DB updated, ${errors} errors`);
  if (errors > 0) process.exit(1);
}

main().catch(e => {
  console.error('❌ Fatal error:', e.message);
  process.exit(1);
});