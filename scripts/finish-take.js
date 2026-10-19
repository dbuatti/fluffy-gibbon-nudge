#!/usr/bin/env node
'use strict';
/**
 * finish-take.js
 *
 * Solves two grievances at once: (1) Meld only has ONE global recording
 * destination setting, not one per scene, so relying on Meld to already
 * save into Movies/<Workflow>/ would mean manually changing that setting
 * every time you switch workflows; (2) "which video goes with which Logic
 * file" wasn't obvious from the filenames Meld and Logic generate
 * independently.
 *
 * Fix: point Meld's Local Destination at ONE inbox folder, set once, never
 * touched again. This script finds the newest video sitting in that inbox,
 * finds the most recently created Logic capture in _Captures/, works out
 * which workflow it belongs to (from its filename), and MOVES the video into
 * the matching Movies/<Workflow>/ folder, renamed to match the Logic file's
 * name exactly — same stem, same timestamp, just the video's own extension.
 * Run it once, right after you stop recording in Meld.
 *
 * Usage:
 *   node finish-take.js
 *   node finish-take.js "Optional Song Title"
 *
 * Optional title argument: if given, it's appended to the video's filename
 * (the original timestamp-based name is kept, not replaced — e.g.
 * "20260722-124215 Felt Piano - Indigo Dusk.mov"). Leave it out to keep the
 * plain timestamp filename.
 *
 * Safety: it will refuse to move/rename anything if the newest video in the
 * inbox looks stale (last modified more than 30 minutes ago) rather than
 * guess wrong — that usually means you haven't actually recorded anything
 * new yet, or Meld's Local Destination isn't pointed at the inbox folder.
 *
 * Composer Hub: this script no longer auto-logs to Composer Hub. That now
 * happens at record-start instead, in the "Piano Improvisation" branch of
 * the picker, before Logic even opens — see that branch's comments. Logging
 * again here after the fact would just create a duplicate entry.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { uploadAudio, getEntryStatus } from './composer-hub.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CAPTURES_DIR = '/Users/danielebuatti/Music/Logic/_Captures';
const INBOX_DIR = '/Users/danielebuatti/Movies/_Inbox'; // point Meld's Local Destination here, once
const MOVIES_DIR = '/Users/danielebuatti/Movies';
const VIDEO_EXTENSIONS = new Set(['.mov', '.mp4', '.mkv', '.flv']);
const AUDIO_EXTENSIONS = new Set(['.mp3', '.m4a', '.wav', '.aiff']);
const STALE_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

function allEntriesSorted(dirPath, filterFn) {
  if (!fs.existsSync(dirPath)) return [];
  return fs.readdirSync(dirPath, { withFileTypes: true })
    .filter(filterFn)
    .map((entry) => {
      const fullPath = path.join(dirPath, entry.name);
      const stat = fs.statSync(fullPath);
      return { name: entry.name, fullPath, mtime: stat.mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime);
}

function newestEntry(dirPath, filterFn) {
  return allEntriesSorted(dirPath, filterFn)[0] || null;
}

function extractLabel(logicxName) {
  // Date-first naming, e.g. "20260722-124215 IG Story.logicx" -> "IG Story"
  const match = logicxName.match(/^\d{8}-\d{6} (.*)\.logicx$/);
  return match ? match[1] : null;
}

function sanitizeTitle(rawTitle) {
  if (!rawTitle) return null;
  const trimmed = rawTitle.trim();
  if (!trimmed) return null;
  // Strip characters that are awkward/illegal in macOS filenames (":" and "/" in particular)
  return trimmed.replace(/[:\/]/g, '-').replace(/\s+/g, ' ');
}

async function uploadAudioOnlyMain() {
  console.log('🎵 Upload Latest Audio — finding bounced audio...');

  // Find newest Logic project
  const newestLogic = newestEntry(
    CAPTURES_DIR,
    (entry) => entry.isDirectory() && entry.name.endsWith('.logicx')
  );

  if (!newestLogic) {
    console.error(`No .logicx files found in ${CAPTURES_DIR}.`);
    process.exit(1);
  }

  const logicProjectDir = path.join(CAPTURES_DIR, newestLogic.name);
  const targetStem = newestLogic.name.replace(/\.logicx$/, '');

  // Find bounced audio
  const bouncesDir = path.join(logicProjectDir, 'Bounces');
  let audioFile = null;

  if (fs.existsSync(bouncesDir)) {
    const files = fs.readdirSync(bouncesDir)
      .filter(f => AUDIO_EXTENSIONS.has(path.extname(f).toLowerCase()))
      .map(f => ({ name: f, fullPath: path.join(bouncesDir, f), mtime: fs.statSync(path.join(bouncesDir, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    if (files.length > 0) audioFile = files[0];
  }

  if (!audioFile && fs.existsSync(logicProjectDir)) {
    const files = fs.readdirSync(logicProjectDir)
      .filter(f => AUDIO_EXTENSIONS.has(path.extname(f).toLowerCase()))
      .map(f => ({ name: f, fullPath: path.join(logicProjectDir, f), mtime: fs.statSync(path.join(logicProjectDir, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    if (files.length > 0) audioFile = files[0];
  }

  if (!audioFile) {
    console.log('ℹ️  No bounced audio file found in Logic project.');
    console.log('   Bounce your track in Logic (File > Bounce), then re-run.');
    process.exit(0);
  }

  console.log(`🎵 Found: ${audioFile.name}`);

  // Find matching entry in Supabase
  const { getSyncSummary, uploadAudio } = await import('./composer-hub.js');
  const syncResult = await getSyncSummary({ limit: 100 });

  if (!syncResult.success) {
    console.error('❌ Could not fetch sync status');
    process.exit(1);
  }

  const match = syncResult.data.items.find(item =>
    item.logicProjectPath?.includes(targetStem)
  );

  if (!match) {
    console.error('❌ No matching Composer Hub entry found');
    process.exit(1);
  }

  console.log(`📤 Uploading to: ${match.generatedName} (${match.id})`);
  const uploadResult = await uploadAudio(match.id, audioFile.fullPath);

  if (uploadResult.success) {
    console.log(`✅ Uploaded: ${uploadResult.publicUrl}`);
  } else {
    console.error(`❌ Upload failed: ${uploadResult.error}`);
    process.exit(1);
  }
}

function main() {
  const args = process.argv.slice(2);
  const uploadAudioOnly = args.includes('--upload-audio-only');
  const title = sanitizeTitle(args.find(a => !a.startsWith('--')));

  if (uploadAudioOnly) {
    return uploadAudioOnlyMain();
  }

  const newestLogic = newestEntry(
    CAPTURES_DIR,
    (entry) => entry.isDirectory() && entry.name.endsWith('.logicx')
  );
  if (!newestLogic) {
    console.error(`No .logicx files found in ${CAPTURES_DIR}. Nothing to match against.`);
    process.exit(1);
  }
  const label = extractLabel(newestLogic.name);
  if (!label) {
    console.error(`Could not work out the workflow label from "${newestLogic.name}" — expected a name like "20260722-124215 IG Story.logicx".`);
    process.exit(1);
  }
  const targetStem = newestLogic.name.replace(/\.logicx$/, '');
  const moviesSubfolder = path.join(MOVIES_DIR, label);
  const allVideos = allEntriesSorted(
    INBOX_DIR,
    (entry) => entry.isFile() && VIDEO_EXTENSIONS.has(path.extname(entry.name).toLowerCase())
  );
  const newestVideo = allVideos[0] || null;
  if (!newestVideo) {
    console.error(
      `No video files found in ${INBOX_DIR}. Has Meld's Local Destination (Settings > General > Recording) ` +
      `been pointed at this folder yet? It only needs setting once.`
    );
    process.exit(1);
  }
  const ageMs = Date.now() - newestVideo.mtime;
  if (ageMs > STALE_THRESHOLD_MS) {
    const ageMinutes = Math.round(ageMs / 60000);
    console.error(
      `Newest video in ${INBOX_DIR} is "${newestVideo.name}", but it's ${ageMinutes} minutes old — ` +
      `that's stale enough that it's probably not this take. Refusing to guess; move/rename it yourself if it's ` +
      `actually the right file, or check Meld's Local Destination setting.`
    );
    process.exit(1);
  }
  const videoExt = path.extname(newestVideo.name);
  fs.mkdirSync(moviesSubfolder, { recursive: true });
  // Timestamp stem is always kept — the title (if given) is additive, appended
  // after it, so the Logic-file pairing stays obvious from the filename alone.
  const newVideoName = title ? `${targetStem} - ${title}${videoExt}` : `${targetStem}${videoExt}`;
  const newVideoPath = path.join(moviesSubfolder, newVideoName);
  if (fs.existsSync(newVideoPath)) {
    console.error(`A file already exists at ${newVideoPath} — not overwriting it. Move/rename manually if needed.`);
    process.exit(1);
  }
  fs.renameSync(newestVideo.fullPath, newVideoPath);
  console.log(`Moved:\n  ${INBOX_DIR}/${newestVideo.name}\n  -> ${newVideoPath}`);
  console.log(`Now paired with: ${newestLogic.name}`);

  // --- Audio upload to Composer Hub ---
  await uploadMatchingAudio(targetStem, newestLogic.name);

  // Anything else left in the inbox is presumably from an earlier session
  // where Finish Take didn't get run — surface it rather than let it pile
  // up silently, since only the single newest file is ever auto-handled.
  const leftovers = allVideos.slice(1);
  if (leftovers.length > 0) {
    console.log(
      `\nNote: ${leftovers.length} older file(s) still sitting in ${INBOX_DIR} from a previous session ` +
      `(not touched by this run): ${leftovers.map((v) => v.name).join(', ')}`
    );
  }
  // NOTE: this used to also auto-create a Composer Hub idea here, scoped to
  // Felt Piano takes only. That's now handled at record-start instead — the
  // "Piano Improvisation" branch in the picker logs to Composer Hub the
  // moment you start (Felt Piano or Piano, filmed or not), before Logic
  // even opens. Doing it again here would just create a second, duplicate
  // entry for the same take, so this step was removed. `composer-hub.js`
  // is still available for manual use any time: `node composer-hub.js "Title"`.

  // Machine-readable tag line, always printed last regardless of whether a
  // leftovers note came before it — the picker's AppleScript scans the full
  // output for a line starting with this exact prefix (not just "the last
  // line", since leftovers notes can follow the move message) to reveal the
  // moved/renamed video in Finder, mirroring the Logic-file reveal that
  // already happens when a capture is created.
  console.log(`VIDEO_PATH: ${newVideoPath}`);
}

async function uploadMatchingAudio(targetStem, logicxName) {
  try {
    // Find the improvisation in Supabase by logic_project_path
    const logicProjectDir = path.join(CAPTURES_DIR, logicxName);
    const bouncesDir = path.join(logicProjectDir, 'Bounces');

    let audioFile = null;

    // Check Bounces folder first
    if (fs.existsSync(bouncesDir)) {
      const files = fs.readdirSync(bouncesDir)
        .filter(f => AUDIO_EXTENSIONS.has(path.extname(f).toLowerCase()))
        .map(f => ({ name: f, fullPath: path.join(bouncesDir, f), mtime: fs.statSync(path.join(bouncesDir, f)).mtimeMs }))
        .sort((a, b) => b.mtime - a.mtime);
      if (files.length > 0) {
        audioFile = files[0];
      }
    }

    // Fallback: check project root for bounced files
    if (!audioFile && fs.existsSync(logicProjectDir)) {
      const files = fs.readdirSync(logicProjectDir)
        .filter(f => AUDIO_EXTENSIONS.has(path.extname(f).toLowerCase()))
        .map(f => ({ name: f, fullPath: path.join(logicProjectDir, f), mtime: fs.statSync(path.join(logicProjectDir, f)).mtimeMs }))
        .sort((a, b) => b.mtime - a.mtime);
      if (files.length > 0) {
        audioFile = files[0];
      }
    }

    if (!audioFile) {
      console.log('ℹ️  No bounced audio file found in Logic project. Upload manually in web app when ready.');
      return;
    }

    console.log(`🎵 Found bounced audio: ${audioFile.name}`);

    // Find matching improvisation by logic_project_path
    const { getSyncSummary } = await import('./composer-hub.js');
    const syncResult = await getSyncSummary({ limit: 100 });
    if (!syncResult.success) {
      console.log('⚠️  Could not fetch sync status to find matching entry');
      return;
    }

    const match = syncResult.data.items.find(item =>
      item.logicProjectPath?.includes(targetStem)
    );

    if (!match) {
      console.log('⚠️  No matching Composer Hub entry found for this Logic project');
      return;
    }

    console.log(`📤 Uploading audio to entry: ${match.generatedName} (${match.id})`);

    const { uploadAudio } = await import('./composer-hub.js');
    const uploadResult = await uploadAudio(match.id, audioFile.fullPath);

    if (uploadResult.success) {
      console.log(`✅ Audio uploaded: ${uploadResult.publicUrl}`);
    } else {
      console.log(`❌ Audio upload failed: ${uploadResult.error}`);
    }
  } catch (e) {
    console.log(`⚠️  Audio upload skipped: ${e.message}`);
  }
}

main();