#!/usr/bin/env node
'use strict';

/**
 * composer-hub-login.js
 *
 * One-time interactive setup for Composer Hub integration.
 * Supports GitHub OAuth users (paste session from browser) and
 * email/password users.
 *
 * Usage:
 *   node composer-hub-login.js
 */

import readline from 'readline';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { pathToFileURL } from 'url';

const CONFIG_DIR = path.join(os.homedir(), '.config', 'composer-hub');
const AUTH_FILE = path.join(CONFIG_DIR, 'auth.json');

const SUPABASE_URL = 'https://rqesjpnhrjdjnrzdhzgw.supabase.co';
const SUPABASE_PROJECT_REF = 'rqesjpnhrjdjnrzdhzgw';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJxZXNqcG5ocmpkam5yemRoemd3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIwMzgwNzgsImV4cCI6MjA3NzYxNDA3OH0.NqFKBFI-l96hWOGNc8QxuQdaGKVmvzw6LDGO_MsIoQc';

async function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (answer) => { rl.close(); resolve(answer); }));
}

/**
 * Like prompt(), but echoes * per character instead of the typed text, so
 * the password doesn't end up in scrollback or over the shoulder.
 */
function promptHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    // readline echoes keystrokes through _writeToOutput — swap it for a
    // masked version while the secret is being typed. (The prompt itself is
    // written synchronously inside question(), before muting kicks in.)
    rl._writeToOutput = (stringToWrite) => {
      rl.output.write(rl.stdoutMuted ? '*' : stringToWrite);
    };
    rl.question(question, (answer) => {
      rl.stdoutMuted = false;
      process.stdout.write('\n');
      rl.close();
      resolve(answer);
    });
    rl.stdoutMuted = true;
  });
}

/**
 * Attempt to extract the Supabase session from Chrome's local storage
 * on disk. Chrome stores it as a LevelDB value keyed by
 * `sb-<project-ref>-auth-token` for the supabase.co origin.
 * Returns the parsed session array or null.
 */
function extractSessionFromChrome() {
  const chromeProfiles = [
    path.join(os.homedir(), 'Library', 'Application Support', 'Google', 'Chrome'),
    path.join(os.homedir(), 'Library', 'Application Support', 'Google', 'Chrome Canary'),
    path.join(os.homedir(), 'Library', 'Application Support', 'BraveSoftware', 'Brave-Browser'),
    path.join(os.homedir(), 'Library', 'Application Support', 'Chromium'),
    path.join(os.homedir(), 'Library', 'Application Support', 'Microsoft Edge'),
  ];

  const storageKey = `sb-${SUPABASE_PROJECT_REF}-auth-token`;

  for (const chromeDir of chromeProfiles) {
    if (!fs.existsSync(chromeDir)) continue;

    // Search all profiles' Local Storage leveldb directories
    const profiles = fs.readdirSync(chromeDir).filter((name) =>
      name.startsWith('Profile') || name === 'Default'
    );

    for (const profile of profiles) {
      const leveldbDir = path.join(chromeDir, profile, 'Local Storage', 'leveldb');
      if (!fs.existsSync(leveldbDir)) continue;

      const files = fs.readdirSync(leveldbDir).filter((f) => f.endsWith('.ldb') || f.endsWith('.log'));
      for (const file of files) {
        try {
          const content = fs.readFileSync(path.join(leveldbDir, file), 'utf-8');
          // LevelDB stores values as raw strings — search for our key
          const idx = content.indexOf(storageKey);
          if (idx === -1) continue;

          // The value follows the key as a JSON array: [access_token, refresh_token, ...]
          const valueStart = content.indexOf('[', idx + storageKey.length);
          if (valueStart === -1) continue;
          const valueEnd = content.indexOf(']\n', valueStart);
          if (valueEnd === -1) continue;

          const raw = content.slice(valueStart, valueEnd + 1);
          const session = JSON.parse(raw);
          if (Array.isArray(session) && session.length >= 2 && session[1]) {
            return { refresh_token: session[1], email: session[3] || null };
          }
        } catch {
          // Individual file read/parse errors are non-fatal
        }
      }
    }
  }
  return null;
}

async function loginWithPassword() {
  const email = await prompt('Supabase email: ');
  const password = await promptHidden('Supabase password: ');

  console.log('\nSigning in...');

  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      'apikey': ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });

  const body = await res.json();

  if (!res.ok) {
    console.error(`Login failed (${res.status}):`, body.msg || body.error_description || body.error || 'Unknown error');
    return null;
  }

  return { refresh_token: body.refresh_token, email: body.user.email };
}

/**
 * Reads the pasted session JSON from a file instead of an interactive
 * terminal prompt. Long single-line pastes (the full Supabase session
 * object is several KB on one line) are unreliable typed directly into
 * readline — many terminals mangle or truncate very long single-line
 * pastes. Writing the clipboard to a file first (pbpaste > file.json)
 * and pointing here avoids that entirely.
 */
function loginWithTokenFile(filePath) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf-8');
  } catch (err) {
    console.error(`Could not read ${filePath}: ${err.message}`);
    return null;
  }

  let session;
  try {
    session = JSON.parse(raw.trim());
  } catch {
    console.error(`${filePath} did not contain valid JSON. Re-run: pbpaste > ${filePath}`);
    return null;
  }

  return parseSessionObject(session);
}

/**
 * Shared parsing logic for a pasted/loaded Supabase session — accepts
 * either the array format ["access_token", "refresh_token", ...] or the
 * object format {refresh_token, user: {...}}.
 */
function parseSessionObject(session) {
  if (Array.isArray(session)) {
    if (session.length < 2 || !session[1]) {
      console.error('No refresh token found. Make sure you are logged in.');
      return null;
    }
    return { refresh_token: session[1], email: session[3] || null };
  } else if (typeof session === 'object' && session && session.refresh_token) {
    return { refresh_token: session.refresh_token, email: session.user?.email || null };
  }
  console.error('Could not find a refresh token in the value. Make sure you are logged in.');
  return null;
}

async function loginWithPastedToken() {
  console.log('\n--- GitHub / SSO users ---');
  console.log('1. Open https://composerhub.vercel.app in Chrome');
  console.log('2. Open Dev Tools → Application → Local Storage');
  console.log(`3. Find the key: sb-${SUPABASE_PROJECT_REF}-auth-token`);
  console.log('4. Double-click its Value field and copy the entire JSON array');
  console.log('   (starts with "[", ends with "]" — it has your tokens inside)');
  console.log('   Tip: this value can be several KB on one line, which some terminals');
  console.log('   mangle when pasted directly. If this fails, run instead:');
  console.log('     pbpaste > /tmp/ch-token.json');
  console.log('     node composer-hub-login.js --token-file /tmp/ch-token.json\n');

  const raw = await prompt('Paste the auth token value here: ');

  let session;
  try {
    session = JSON.parse(raw.trim());
  } catch {
    console.error('That was not valid JSON. Copy the entire value including the brackets.');
    return null;
  }

  return parseSessionObject(session);
}

async function validateAndSave(refresh_token, email) {
  // Validate the token by exchanging it
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: {
      'apikey': ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ refresh_token }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    console.error(`Token validation failed (${res.status}):`, body.msg || body.error_description || 'Invalid token');
    return false;
  }

  const body = await res.json();

  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(AUTH_FILE, JSON.stringify({
    refresh_token: body.refresh_token,
    user_id: body.user.id,
    email: body.user.email || email,
  }, null, 2));
  fs.chmodSync(AUTH_FILE, 0o600);

  console.log(`\nLogged in as ${body.user.email || email}. Session cached in ${AUTH_FILE}`);
  console.log('You can now use Piano Improvisation / Deep Composition from the picker — both log to Composer Hub automatically at record-start.');
  return true;
}

async function main() {
  console.log('Composer Hub — Login\n');

  // --token-file <path>: read a pasted session from a file instead of an
  // interactive prompt. Use this if pasting directly into the terminal
  // garbles or truncates (long single-line JSON pastes are unreliable in
  // some terminals). Usage:
  //   pbpaste > /tmp/ch-token.json
  //   node composer-hub-login.js --token-file /tmp/ch-token.json
  if (process.argv[2] === '--token-file') {
    const filePath = process.argv[3];
    if (!filePath) {
      console.error('Usage: node composer-hub-login.js --token-file /path/to/pasted-token.json');
      process.exit(1);
    }
    const result = loginWithTokenFile(filePath);
    if (!result) {
      console.error('Login failed.');
      process.exit(1);
    }
    if (!(await validateAndSave(result.refresh_token, result.email))) {
      console.error('Login failed.');
      process.exit(1);
    }
    return;
  }

  // First, try to extract from Chrome automatically (works if logged in via browser)
  console.log('Checking Chrome for an existing session...');
  const chromeSession = extractSessionFromChrome();
  if (chromeSession) {
    console.log(`Found a session for ${chromeSession.email || 'your account'}.`);
    const ok = await prompt('Use this session? (Y/n): ');
    if (ok.toLowerCase() !== 'n') {
      if (await validateAndSave(chromeSession.refresh_token, chromeSession.email)) return;
      console.log('Session expired. Falling through to manual login.\n');
    }
  } else {
    console.log('No existing session found in Chrome.\n');
  }

  // Ask which flow
  console.log('How would you like to log in?');
  console.log('  1 — Email & password (if you use email login)');
  console.log('  2 — Paste token from browser (GitHub / SSO users)');
  const choice = await prompt('Choice (1 or 2): ');

  let result = null;
  if (choice === '1') {
    result = await loginWithPassword();
  } else if (choice === '2') {
    result = await loginWithPastedToken();
  } else {
    console.error('Invalid choice.');
    process.exit(1);
  }

  if (!result) {
    console.error('Login failed.');
    process.exit(1);
  }

  if (!(await validateAndSave(result.refresh_token, result.email))) {
    console.error('Login failed.');
    process.exit(1);
  }
}

// pathToFileURL handles spaces/symlinks in argv[1] that a raw `file://` +
// path concat would get wrong.
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((err) => {
    console.error('Unexpected error:', err);
    process.exit(1);
  });
}