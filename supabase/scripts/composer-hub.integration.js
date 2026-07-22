#!/usr/bin/env node
'use strict';

/**
 * composer-hub.js
 *
 * Integration layer between local scripts (finish-take.js) and
 * Composer Hub's Supabase backend. Handles auth token caching and
 * improvisation creation via the Supabase REST API.
 *
 * Depends only on Node 18+ built-in fetch. No npm install needed.
 *
 * First-time setup:
 *   node composer-hub-login.js
 *
 * Then Finish Take will call captureIdea() automatically on each run.
 */

const fs = require('fs');
const path = require('path');

const CONFIG_DIR = path.join(require('os').homedir(), '.config', 'composer-hub');
const AUTH_FILE = path.join(CONFIG_DIR, 'auth.json');

const SUPABASE_URL = 'https://rqesjpnhrjdjnrzdhzgw.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJxZXNqcG5ocmpkam5yemRoemd3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIwMzgwNzgsImV4cCI6MjA3NzYxNDA3OH0.NqFKBFI-l96hWOGNc8QxuQdaGKVmvzw6LDGO_MsIoQc';

/**
 * Reads the cached refresh token and exchanges it for a fresh session.
 * Returns { access_token, user_id } or null if no valid session.
 */
async function getSession() {
  if (!fs.existsSync(AUTH_FILE)) return null;

  let auth;
  try {
    auth = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf-8'));
  } catch {
    return null;
  }

  if (!auth.refresh_token) return null;

  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: {
      'apikey': ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ refresh_token: auth.refresh_token }),
  });

  if (!res.ok) {
    // Token expired or invalid — wipe it so next run prompts re-login
    fs.unlinkSync(AUTH_FILE);
    return null;
  }

  const body = await res.json();

  // Cache the new refresh token
  fs.writeFileSync(AUTH_FILE, JSON.stringify({
    refresh_token: body.refresh_token,
    user_id: body.user.id,
    email: body.user.email,
  }, null, 2));

  return { access_token: body.access_token, user_id: body.user.id };
}

/**
 * Creates a new improvisation entry in Composer Hub.
 * @param {string} title - The generated name for the improvisation
 * @returns {Promise<{success: boolean, id?: string, error?: string}>}
 */
async function captureIdea(title) {
  const session = await getSession();
  if (!session) {
    return { success: false, error: 'Not logged in. Run: node composer-hub-login.js' };
  }

  const datePrefix = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const finalTitle = `${datePrefix} - ${title}`;

  const res = await fetch(`${SUPABASE_URL}/rest/v1/improvisations`, {
    method: 'POST',
    headers: {
      'apikey': ANON_KEY,
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    },
    body: JSON.stringify({
      user_id: session.user_id,
      generated_name: finalTitle,
      status: 'uploaded',
      file_name: null,
      storage_path: null,
      is_improvisation: true,
    }),
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    const message = errBody.message || errBody.msg || `HTTP ${res.status}`;
    return { success: false, error: message };
  }

  const [record] = await res.json();
  return { success: true, id: record.id };
}

module.exports = { captureIdea };

// Allow direct CLI usage: node composer-hub.js "My Title"
if (require.main === module) {
  const title = process.argv[2];
  if (!title) {
    console.error('Usage: node composer-hub.js "Title for the idea"');
    process.exit(1);
  }
  captureIdea(title).then((result) => {
    console.log(JSON.stringify(result, null, 2));
  });
}
