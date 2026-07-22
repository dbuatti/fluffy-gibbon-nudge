#!/usr/bin/env node
'use strict';

/**
 * composer-hub-login.js
 *
 * One-time interactive setup for Composer Hub integration.
 * Prompts for your Supabase email/password and caches the session
 * so finish-take.js can auto-create ideas without re-prompting.
 *
 * Usage:
 *   node composer-hub-login.js
 *   (enter email + password when prompted)
 */

const readline = require('readline');
const fs = require('fs');
const path = require('path');

const CONFIG_DIR = path.join(require('os').homedir(), '.config', 'composer-hub');
const AUTH_FILE = path.join(CONFIG_DIR, 'auth.json');

const SUPABASE_URL = 'https://rqesjpnhrjdjnrzdhzgw.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJxZXNqcG5ocmpkam5yemRoemd3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIwMzgwNzgsImV4cCI6MjA3NzYxNDA3OH0.NqFKBFI-l96hWOGNc8QxuQdaGKVmvzw6LDGO_MsIoQc';

async function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (answer) => { rl.close(); resolve(answer); }));
}

async function main() {
  console.log('Composer Hub — First-time login\n');

  const email = await prompt('Supabase email (your login email): ');
  const password = await prompt('Supabase password: ');

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
    process.exit(1);
  }

  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(AUTH_FILE, JSON.stringify({
    refresh_token: body.refresh_token,
    user_id: body.user.id,
    email: body.user.email,
  }, null, 2));

  console.log(`\nLogged in as ${body.user.email}. Session cached in ${AUTH_FILE}`);
  console.log('You can now run Finish Take and it will auto-create ideas in Composer Hub.');
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
