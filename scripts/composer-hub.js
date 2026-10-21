#!/usr/bin/env node
'use strict';

/**
 * composer-hub.js
 *
 * Integration layer between local scripts and Composer Hub's Supabase
 * backend. Handles auth token caching, improvisation creation, and daily
 * prompt fetching via the Supabase REST API / Edge Functions.
 *
 * Depends only on Node 18+ built-in fetch. No npm install needed.
 *
 * First-time setup:
 *   node composer-hub-login.js
 *
 * Called by the "Piano Improvisation" and "Deep Composition" branches in
 * Workflow Picker (Consolidated).applescript — an idea is logged at
 * record-start via captureIdea(), and getDailyPrompt() supplies the Daily
 * Creative Prompt shown before Piano Improvisation sessions. finish-take.js
 * no longer calls into this file (see its own header comment for why).
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { pathToFileURL } from 'url';

const CONFIG_DIR = path.join(os.homedir(), '.config', 'composer-hub');
const AUTH_FILE = path.join(CONFIG_DIR, 'auth.json');

const SUPABASE_URL = 'https://rqesjpnhrjdjnrzdhzgw.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJxZXNqcG5ocmpkam5yemRoemd3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIwMzgwNzgsImV4cCI6MjA3NzYxNDA3OH0.NqFKBFI-l96hWOGNc8QxuQdaGKVmvzw6LDGO_MsIoQc';

/**
 * fetch with a timeout (default 30s) to prevent hung requests.
 */
function fetchWithTimeout(url, options = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(timer));
}

/**
 * Reads the cached refresh token and exchanges it for a fresh session.
 * Returns { access_token, user_id } or null if no valid session.
 */
async function loginWithPassword(email, password) {
  let res;
  try {
    res = await fetchWithTimeout(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        'apikey': ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  const body = await res.json();
  // Cache the refresh token + credentials for future auto-login
  fs.writeFileSync(AUTH_FILE, JSON.stringify({
    refresh_token: body.refresh_token,
    user_id: body.user.id,
    email: body.user.email,
    email_cred: email,
    password_cred: password,
  }, null, 2));
  fs.chmodSync(AUTH_FILE, 0o600);
  return { access_token: body.access_token, user_id: body.user.id };
}

/**
 * Write the auth file atomically.
 *
 * A plain writeFileSync truncates first, so a concurrent reader can see a
 * half-written file and fail to parse it — which used to look like "not signed
 * in". Writing to a temp file and renaming is atomic on the same filesystem.
 */
function writeAuthFile(data) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  const tmp = `${AUTH_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, AUTH_FILE);
  fs.chmodSync(AUTH_FILE, 0o600);
}

/**
 * Write the auth file, but only if it still holds the refresh token we
 * replaced.
 *
 * Supabase refresh tokens rotate on every use, so two writers can each hold a
 * valid "new" token while the older one is already spent. A plain write means
 * the slower writer wins and clobbers the fresh token with a dead one — the
 * session then fails forever with "refresh_token_already_used" and can only be
 * recovered by logging in again. Comparing before writing keeps the newest
 * token.
 *
 * Returns true if the file was written.
 */
function writeAuthFileIfUnchanged(expectedRefreshToken, data) {
  try {
    const current = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf-8'));
    if (current.refresh_token !== expectedRefreshToken) return false;
  } catch {
    // Unreadable or missing — proceed with the write.
  }
  writeAuthFile(data);
  return true;
}

/**
 * In-flight session promise.
 *
 * Supabase rotates refresh tokens on every use: a refresh token is single-use.
 * If two callers refresh at the same time they both send the same token, the
 * second one is rejected with 400 "Invalid refresh token", and (before the
 * delete guard was fixed) that destroyed the session file. Sharing one
 * in-flight promise means concurrent callers — e.g. a long build plus the
 * browser polling /social/kit — use a single refresh between them.
 */
let sessionInFlight = null;

async function getSession() {
  if (sessionInFlight) return sessionInFlight;
  sessionInFlight = resolveSession().finally(() => {
    sessionInFlight = null;
  });
  return sessionInFlight;
}

async function resolveSession() {
  if (!fs.existsSync(AUTH_FILE)) return null;

  // Supabase refresh tokens are single-use: every refresh issues a new one and
  // invalidates the old. Two processes (the bridge and the sync-to-nas child)
  // can therefore race, and the loser sees "refresh_token_already_used".
  // Retrying with whatever is on disk now resolves that, because the winner
  // has already written the fresh token.
  for (let attempt = 0; attempt < 3; attempt++) {
  let auth;
  try {
    auth = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf-8'));
  } catch {
    return null;
  }

  // Try refresh token first
  if (auth.refresh_token) {
    let res;
    try {
      res = await fetchWithTimeout(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: {
          'apikey': ANON_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refresh_token: auth.refresh_token }),
      });
    } catch {
      return null;
    }

    if (res.ok) {
      const body = await res.json();
      // Compare-and-swap: only persist the new token if the file still holds
      // the one we just replaced. Without this, a slower writer can overwrite
      // a newer token with one that has already been spent, which leaves the
      // session permanently broken and unrecoverable without a fresh login.
      const stored = writeAuthFileIfUnchanged(auth.refresh_token, {
        refresh_token: body.refresh_token,
        user_id: body.user.id,
        email: body.user.email,
        email_cred: auth.email_cred,
        password_cred: auth.password_cred,
      });
      if (!stored) continue; // someone else rotated first — read theirs and retry
      return { access_token: body.access_token, user_id: body.user.id };
    }

    // The token was already spent by a concurrent refresh. Re-read the file
    // and retry with whatever the winner wrote.
    if (res.status === 400) {
      let current = null;
      try {
        current = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf-8'));
      } catch { /* unreadable */ }
      if (current?.refresh_token && current.refresh_token !== auth.refresh_token) {
        continue;
      }
    }

    // If refresh failed with auth error, try password login if we have credentials
    if ([400, 401, 403, 404].includes(res.status) && auth.email_cred && auth.password_cred) {
      const result = await loginWithPassword(auth.email_cred, auth.password_cred);
      if (result) return result;
    }

    // NOTE: we deliberately do NOT delete the auth file here.
    //
    // A refresh can fail for reasons that are not "you are signed out" — most
    // notably a concurrent rotation, where a second refresh reuses a token
    // that was already spent. Deleting the file then wiped the session and
    // left the bridge reporting "Not signed in on this Mac" even though the
    // user had logged in. The file is small and self-healing (the password
    // fallback above rewrites it), so keeping it is strictly safer.
    return null;
  }

  // No refresh token — try password login if we have credentials
  if (auth.email_cred && auth.password_cred) {
    return loginWithPassword(auth.email_cred, auth.password_cred);
  }

  return null;
  }
  return null;
}

/**
 * Creates a new improvisation entry in Composer Hub.
 *
 * The title is free-form and always editable later in the app. When a local
 * project folder / .logicx file exists, pass its path in `meta.logicProjectPath`
 * — it becomes the immutable link back to disk (original_name + logic_project_path),
 * so renames in the app never lose the association.
 *
 * @param {string} title - The generated name for the improvisation
 * @param {object} [meta] - Optional local metadata
 * @param {string} [meta.logicProjectPath] - Full path to the .logicx / project folder
 * @param {string} [meta.workflowMode] - tiktok | ig_story | piano_improvisation | deep_composition
 * @returns {Promise<{success: boolean, id?: string, originalName?: string, error?: string}>}
 */
async function captureIdea(title, meta = {}) {
  const session = await getSession();
  if (!session) {
    return { success: false, error: 'Not logged in. Run: node composer-hub-login.js' };
  }

  // Title is the raw creative name — no date prefix. The date lives on the
  // record (created_at) and, for local projects, in the folder name itself.
  const finalTitle = (title || '').trim() || 'Untitled Idea';

  // original_name is derived from the folder/file basename — the sacred,
  // never-changing link to the local project.
  let originalName = null;
  if (meta.logicProjectPath) {
    const base = meta.logicProjectPath.split('/').filter(Boolean).pop() || '';
    originalName = base.replace(/\.logicx$/, '');
  }

  const res = await fetchWithTimeout(`${SUPABASE_URL}/rest/v1/improvisations`, {
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
      original_name: originalName,
      logic_project_path: meta.logicProjectPath || null,
      workflow_mode: meta.workflowMode || null,
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
  return { success: true, id: record.id, originalName: record.original_name || undefined };
}

/**
 * Fetches a freshly generated Daily Creative Prompt from Composer Hub.
 * Note: this is a *generate* endpoint, not a fixed lookup — it may return a
 * different prompt on each call. Call it once per session (e.g. right before
 * playing) rather than repeatedly, so the prompt you see stays the one that
 * actually inspired the take.
 * @returns {Promise<{success: boolean, prompt?: string, error?: string}>}
 */
async function getDailyPrompt() {
  const session = await getSession();
  if (!session) {
    return { success: false, error: 'Not logged in. Run: node composer-hub-login.js' };
  }

  const res = await fetchWithTimeout(`${SUPABASE_URL}/functions/v1/generate-daily-prompt`, {
    method: 'POST',
    headers: {
      'apikey': ANON_KEY,
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    const message = errBody.message || errBody.error || `HTTP ${res.status}`;
    return { success: false, error: message };
  }

  const body = await res.json();
  if (!body.success || !body.prompt) {
    return { success: false, error: 'Unexpected response shape from generate-daily-prompt' };
  }

  return { success: true, prompt: body.prompt };
}

/**
 * Uploads an audio file to Supabase Storage and updates the improvisation record.
 * @param {string} improvisationId - The ID of the improvisation entry
 * @param {string} filePath - Local path to the audio file (MP3/M4A)
 * @returns {Promise<{success: boolean, error?: string, publicUrl?: string}>}
 */
async function uploadAudio(improvisationId, filePath) {
  const session = await getSession();
  if (!session) {
    return { success: false, error: 'Not logged in. Run: node composer-hub-login.js' };
  }

  if (!fs.existsSync(filePath)) {
    return { success: false, error: `File not found: ${filePath}` };
  }

  const ext = path.extname(filePath).toLowerCase();
  if (!['.mp3', '.m4a', '.wav', '.aiff'].includes(ext)) {
    return { success: false, error: 'Unsupported audio format. Use MP3, M4A, WAV, or AIFF.' };
  }

  // Generate storage path: {userId}/{improvisationId}{ext}
  const storagePath = `${session.user_id}/${improvisationId}${ext}`;
  const fileName = path.basename(filePath);

  // Read file
  const fileBuffer = fs.readFileSync(filePath);

  // Upload to Supabase Storage
  const uploadRes = await fetchWithTimeout(`${SUPABASE_URL}/storage/v1/object/piano_improvisations/${storagePath}`, {
    method: 'POST',
    headers: {
      'apikey': ANON_KEY,
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/octet-stream',
      'x-upsert': 'true',
    },
    body: fileBuffer,
  });

  if (!uploadRes.ok) {
    const errBody = await uploadRes.json().catch(() => ({}));
    return { success: false, error: errBody.message || `Upload failed: HTTP ${uploadRes.status}` };
  }

  // Update the improvisation record
  const updateRes = await fetchWithTimeout(`${SUPABASE_URL}/rest/v1/improvisations?id=eq.${improvisationId}`, {
    method: 'PATCH',
    headers: {
      'apikey': ANON_KEY,
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    },
    body: JSON.stringify({
      file_name: fileName,
      storage_path: storagePath,
      status: 'analyzing',
    }),
  });

  if (!updateRes.ok) {
    const errBody = await updateRes.json().catch(() => ({}));
    return { success: false, error: errBody.message || `DB update failed: HTTP ${updateRes.status}` };
  }

  // Get public URL
  const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/piano_improvisations/${storagePath}`;

  return { success: true, publicUrl };
}

/**
 * Fetches entries that are ready for release (completed + is_ready_for_release = true)
 * @returns {Promise<{success: boolean, data?: any[], error?: string}>}
 */
async function getPendingReleases() {
  const session = await getSession();
  if (!session) {
    return { success: false, error: 'Not logged in. Run: node composer-hub-login.js' };
  }

  const res = await fetchWithTimeout(
    `${SUPABASE_URL}/rest/v1/improvisations?user_id=eq.${session.user_id}&status=eq.completed&is_ready_for_release=eq.true&order=created_at.desc`,
    {
      headers: {
        'apikey': ANON_KEY,
        'Authorization': `Bearer ${session.access_token}`,
      },
    }
  );

  if (!res.ok) {
    return { success: false, error: `HTTP ${res.status}` };
  }

  const data = await res.json();
  return { success: true, data };
}

/**
 * Fetches stale ideas (uploaded > N days ago, no audio attached)
 * @param {number} days - Threshold in days (default 7)
 * @returns {Promise<{success: boolean, data?: any[], error?: string}>}
 */
async function getStaleIdeas(days = 7) {
  const session = await getSession();
  if (!session) {
    return { success: false, error: 'Not logged in. Run: node composer-hub-login.js' };
  }

  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const res = await fetchWithTimeout(
    `${SUPABASE_URL}/rest/v1/improvisations?user_id=eq.${session.user_id}&status=eq.uploaded&storage_path=is.null&created_at=lt.${cutoff}&order=created_at.desc`,
    {
      headers: {
        'apikey': ANON_KEY,
        'Authorization': `Bearer ${session.access_token}`,
      },
    }
  );

  if (!res.ok) {
    return { success: false, error: `HTTP ${res.status}` };
  }

  const data = await res.json();
  return { success: true, data };
}

/**
 * Fetches a single improvisation by ID with all fields
 * @param {string} id - Improvisation ID
 * @returns {Promise<{success: boolean, data?: any, error?: string}>}
 */
async function getEntryStatus(id) {
  const session = await getSession();
  if (!session) {
    return { success: false, error: 'Not logged in. Run: node composer-hub-login.js' };
  }

  const res = await fetchWithTimeout(
    `${SUPABASE_URL}/rest/v1/improvisations?id=eq.${id}&user_id=eq.${session.user_id}`,
    {
      headers: {
        'apikey': ANON_KEY,
        'Authorization': `Bearer ${session.access_token}`,
      },
    }
  );

  if (!res.ok) {
    return { success: false, error: `HTTP ${res.status}` };
  }

  const data = await res.json();
  return { success: true, data: data[0] || null };
}

/**
 * Fetches a summary of all entries with local workflow metadata for sync display
 * @param {Object} options - Filter options
 * @returns {Promise<{success: boolean, data?: any[], error?: string}>}
 */
async function getSyncSummary(options = {}) {
  const session = await getSession();
  if (!session) {
    return { success: false, error: 'Not logged in. Run: node composer-hub-login.js' };
  }

  const { limit = 50, status, workflowMode } = options;
  let query = `${SUPABASE_URL}/rest/v1/improvisations?user_id=eq.${encodeURIComponent(session.user_id)}&select=id,generated_name,status,workflow_mode,file_name,storage_path,video_path,is_ready_for_release,created_at,nas_folder_path,logic_project_path&order=created_at.desc&limit=${limit}`;

  if (status) query += `&status=eq.${encodeURIComponent(status)}`;
  if (workflowMode) query += `&workflow_mode=eq.${encodeURIComponent(workflowMode)}`;

  const res = await fetchWithTimeout(query, {
    headers: {
      'apikey': ANON_KEY,
      'Authorization': `Bearer ${session.access_token}`,
    },
  });

  if (!res.ok) {
    return { success: false, error: `HTTP ${res.status}` };
  }

  const data = await res.json();

  // Compute derived fields
  const items = data.map((item) => ({
    id: item.id,
    generatedName: item.generated_name,
    status: item.status,
    workflowMode: item.workflow_mode,
    hasAudio: !!item.storage_path,
    hasVideo: !!item.video_path,
    isReadyForRelease: !!item.is_ready_for_release,
    createdAt: item.created_at,
    nasFolderPath: item.nas_folder_path,
    logicProjectPath: item.logic_project_path,
  }));

  const counts = {
    total: items.length,
    readyForRelease: items.filter((i) => i.isReadyForRelease).length,
    staleNoAudio: items.filter((i) => i.status === 'uploaded' && !i.hasAudio && new Date(i.createdAt) < new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)).length,
  };

  return { success: true, data: { items, counts } };
}

export { captureIdea, getDailyPrompt, uploadAudio, getPendingReleases, getStaleIdeas, getEntryStatus, getSyncSummary, getSession, SUPABASE_URL, ANON_KEY };

// Allow direct CLI usage:
//   node composer-hub.js "My Title"                              -> creates an idea
//   node composer-hub.js "My Title" --path "/path/Project.logicx" -> idea + folder link
//   node composer-hub.js "My Title" --path "..." --mode piano_improvisation
//   node composer-hub.js --prompt                                -> prints a fresh daily prompt (plain text, for scripting)
// pathToFileURL handles spaces/symlinks in argv[1] that a raw `file://` +
// path concat would get wrong.
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const args = process.argv.slice(2);
  const arg = args.find(a => !a.startsWith('--'));
  const getPathFlag = () => {
    const i = args.indexOf('--path');
    return i !== -1 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : null;
  };
  const getModeFlag = () => {
    const i = args.indexOf('--mode');
    return i !== -1 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : null;
  };

  if (args.includes('--prompt')) {
    getDailyPrompt().then((result) => {
      if (result.success) {
        console.log(result.prompt);
      } else {
        console.error(result.error);
        process.exit(1);
      }
    }).catch((err) => {
      console.error(`✗ ${err.message}`);
      process.exit(1);
    });
  } else if (!arg) {
    console.error('Usage: node composer-hub.js "Title for the idea" [--path "/path/Project.logicx"] [--mode piano_improvisation]  |  node composer-hub.js --prompt');
    process.exit(1);
  } else {
    captureIdea(arg, { logicProjectPath: getPathFlag(), workflowMode: getModeFlag() }).then((result) => {
      console.log(JSON.stringify(result, null, 2));
      // Always the last line on success — lets callers grab just the URL via
      // `| tail -1` without needing to parse JSON (the picker's AppleScript
      // does exactly this, to open the new entry directly after logging it).
      if (result.success) {
        console.log(`https://composerhub.vercel.app/improvisation/${result.id}`);
      } else {
        process.exit(1);
      }
    }).catch((err) => {
      console.error(`✗ Capture failed: ${err.message}`);
      process.exit(1);
    });
  }
}