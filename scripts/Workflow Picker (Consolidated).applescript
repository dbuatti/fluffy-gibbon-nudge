-----------------------------------------------------------
-- CONSOLIDATED WORKFLOW PICKER
-- Replaces: original 2-version Workflow Picker, Composition.scpt,
-- and the OBS/Chrome-profile/Photos scripts.
--
-- Changes from the older scripts:
-- - OBS dropped entirely (retired in favor of Meld Studio).
-- - Audient references swapped for the PreSonus Studio-series
--   interface. PreSonus's own docs say Universal Control Loopback
--   is Windows-only on this line, so BlackHole + a Multi-Output
--   Device is still the audio-routing plan on Mac.
-- - Rode Wireless GO is a voice/commentary mic now, wired into a
--   spare PreSonus input via its 3.5mm TRS output — nothing plugs
--   into the iPhone, so it can sit flat on a table.
-- - The old Photos "Slo-Mo album" step used System Events keystroke
--   navigation to fake menu clicks — this is inherently fragile
--   (breaks on timing, macOS updates, focus changes) and there is
--   no documented AppleScript command to open a specific album
--   directly, so it's replaced here with: open Photos, and a
--   reminder to click into Slo-Mo yourself. A few seconds of manual
--   clicking beats an automation that silently fails.
-- - Chrome's --profile-directory trick (to land in the right logged
--   in TikTok account) is kept.
--
-- RESOLVED: "For Streaming Things (TikTok, OBS).logicx" is the confirmed
-- quick-capture template; "For Recording Things (TikTok, OBS).logicx" from
-- the old OBS scripts was the duplicate — safe to delete once you've
-- confirmed you're not still using it anywhere.
--
-- TikTok/Shorts, IG Story, and Felt Piano now each duplicate their shared
-- template into a dated file under /Users/danielebuatti/Music/Logic/_Captures/
-- instead of opening/editing the template directly — the template stays
-- pristine, and every recording keeps its own MIDI take. They also open a
-- matching /Users/danielebuatti/Movies/<Workflow Name>/ folder each time —
-- this is where Finish Take files the video after sorting it, not where
-- Meld should save to directly (see the Finish Take / _Inbox note further
-- down — Meld only has one global recording destination, not one per scene).
-----------------------------------------------------------

-- Declared as a `property` (not `set`) so it's visible inside handlers
-- further down — plain top-level `set` variables aren't automatically
-- visible inside `on ... end` handlers in AppleScript, properties are.
property meldScenePath : "/Users/danielebuatti/Music/Logic/_Scripts/meld-scene.js"
property finishTakePath : "/Users/danielebuatti/Music/Logic/_Scripts/finish-take.js"
property composerHubPath : "/Users/danielebuatti/Music/Logic/_Scripts/composer-hub.js"
property lastCapturePath : "" -- set by duplicateAndOpenTemplate; passed to composer-hub.js --path so the Hub entry keeps its immutable link to the local folder

set workflowOptions to {"TikTok/Shorts", "IG Story (Quick Capture)", "Piano Improvisation", "Deep Composition", "Finish Take (Match Video to Logic File)"}
set workflowChoiceList to (choose from list workflowOptions with prompt "What are we creating today?" default items {"TikTok/Shorts"})
if workflowChoiceList is false then return -- user cancelled
set workflowChoice to item 1 of workflowChoiceList

-- Shared paths / settings
-- NOTE: paths point at the proposed _QuickCapture subfolder (see reference
-- doc's file-consolidation section). If you haven't moved the files there
-- yet, either run the move commands from that doc first, or temporarily
-- point these back at "/Users/danielebuatti/Music/Logic/<filename>" until you do.
set quickLogicPath to POSIX file "/Users/danielebuatti/Music/Logic/_QuickCapture/For Streaming Things (TikTok, OBS).logicx"
set feltPianoLogicPath to POSIX file "/Users/danielebuatti/Music/Logic/_QuickCapture/felt-ideas.logicx"
set pianoLogicPath to POSIX file "/Users/danielebuatti/Music/Logic/_QuickCapture/piano.logicx"
set tiktokUploadURL to "https://www.tiktok.com/tiktokstudio/upload?from=upload"
set composerHubURL to "https://composerhub.vercel.app/" -- fallback only, if the automatic prompt fetch fails (see Piano Improvisation branch) — where to upload a finished piece is now decided from Composer Hub itself, not auto-opened here
set chromeProfileName to "Profile 11" -- confirm this is still your TikTok-logged-in profile

-- Each "quick capture" workflow duplicates the shared template into its own
-- dated project file (same pattern Deep Composition already uses for its
-- template) instead of opening/editing the shared template directly. This
-- keeps the template pristine and gives every recording its own file, which
-- matters since the MIDI from each take is worth keeping for composition
-- later — see reference doc's "Logic readiness" section for why.
-- Returns true/false so callers can stop the rest of their branch on failure
-- instead of silently continuing into a session with no Logic file open
-- (which is what used to happen — the dialog showed, but Meld would still
-- activate and switch scenes as if everything was fine).
on duplicateAndOpenTemplate(templatePOSIXPath, labelPrefix)
	if (do shell script "test -e " & quoted form of templatePOSIXPath & " && echo yes || echo no") is not "yes" then
		display dialog "Template not found: " & templatePOSIXPath & return & return & "Stopping here — nothing else in this workflow will run." buttons {"OK"} default button "OK"
		return false
	end if
	set captureFolder to "/Users/danielebuatti/Music/Logic/_Captures/"
	do shell script "mkdir -p " & quoted form of captureFolder
	set stamp to do shell script "date +%Y%m%d-%H%M%S"
	-- Date-first naming (e.g. "20260722-172057 Piano.logicx") — matches
	-- Deep Composition's folder naming and sorts chronologically in Finder
	-- regardless of label. (Creative titles themselves no longer carry a
	-- date prefix — the folder stamp and created_at cover that.)
	set newPath to captureFolder & stamp & " " & labelPrefix & ".logicx"
	do shell script "cp -R " & quoted form of templatePOSIXPath & " " & quoted form of newPath
	do shell script "open " & quoted form of newPath
	set lastCapturePath to newPath -- remembered for the Composer Hub log (--path flag)
	-- Reveal the new file in Finder too, selected — so it's obvious where this
	-- capture actually lives (useful later when bouncing audio and needing to
	-- know where to save it). Deliberately NOT activating Finder here — that
	-- would steal focus straight back off Logic right after it opens, working
	-- against the actual goal of getting into Logic as fast as possible. The
	-- file sits selected in a Finder window in the background, ready whenever
	-- you switch to it.
	try
		tell application "Finder" to reveal (POSIX file newPath)
	end try
	return true
end duplicateAndOpenTemplate

-- Requires Meld scenes named exactly "TikTok", "IG Story", "Felt Piano" to
-- exist already. Uses Meld's local WebChannel API (meld-scene.js, delivered
-- alongside this script — keep it in the same _Scripts folder) to switch to
-- the right scene automatically instead of hunting for it by hand. Only
-- switches scenes; does NOT auto-start recording, so timing stays under
-- your control — add "--record" as a second argument below if you'd rather
-- it start recording immediately too.
on switchMeldScene(sceneName)
	try
		do shell script "zsh -lic " & quoted form of ("node " & quoted form of meldScenePath & " " & quoted form of sceneName)
	on error errMsg
		display notification "Couldn't auto-switch Meld scene (" & sceneName & "): " & errMsg with title "Meld Scene Switch — switch manually"
	end try
end switchMeldScene

-- Re-selects the scene (harmless if already selected) and starts recording,
-- via the same WebChannel API — not a keystroke simulation, so it's not
-- fragile the way faking a click would be.
on startMeldRecording(sceneName)
	try
		do shell script "zsh -lic " & quoted form of ("node " & quoted form of meldScenePath & " " & quoted form of sceneName & " --record")
	on error errMsg
		display notification "Couldn't auto-start Meld recording: " & errMsg & " — hit record manually." with title "Meld Recording — start manually"
	end try
end startMeldRecording

-- Tiles Logic Pro and Meld Studio side by side (Logic left, Meld right) on
-- the main screen, via System Events window positioning — not Swish, so it
-- doesn't depend on remembering which shortcut Swish has bound to "left/right
-- half" (works the same regardless of what's configured there, or if Swish
-- isn't running at all). First use may prompt for Accessibility permission
-- (System Settings > Privacy & Security > Accessibility) — approve it once
-- and it won't ask again. Ends with Logic frontmost/focused, matching the
-- "get into Logic as fast as possible" priority used elsewhere in this
-- script; window focus doesn't affect MIDI input either way; it's cosmetic.
on splitScreenLogicMeld()
	try
		tell application "Finder" to set screenBounds to bounds of window of desktop
		set screenW to item 3 of screenBounds
		set screenH to item 4 of screenBounds
		set halfW to screenW / 2
		tell application "System Events"
			tell process "Meld Studio"
				set frontmost to true
				set position of front window to {halfW, 0}
				set size of front window to {halfW, screenH}
			end tell
			tell process "Logic Pro"
				set frontmost to true
				set position of front window to {0, 0}
				set size of front window to {halfW, screenH}
			end tell
		end tell
	on error errMsg
		display notification "Couldn't auto-split the screen (" & errMsg & ") — drag windows manually, or use Swish. First run may need Accessibility permission (System Settings > Privacy & Security)." with title "Window Split"
	end try
end splitScreenLogicMeld

-- NOTE on portrait vs landscape: with Multi Canvas enabled in Meld, every
-- scene already contains BOTH a Main and a Portrait canvas simultaneously —
-- no separate scenes needed per orientation. Which one actually gets
-- recorded is a single Settings toggle (Settings > General > Recording >
-- Recording Canvas Output), which isn't exposed anywhere in Meld's
-- documented WebChannel API (only scenes/layers/tracks/effects are), so it
-- can't be scripted here — check that dropdown manually before recording if
-- you've switched projects since last time.

-- Meld only has ONE global recording destination (Settings > General >
-- Recording > Local Destination), not one per scene — so rather than
-- require changing that setting every time you switch workflows, point it
-- at /Users/danielebuatti/Movies/_Inbox once, and Finish Take sorts videos
-- out of there into the right Movies/<Workflow> folder automatically.
on ensureAndOpenMoviesSubfolder(subfolderName)
	set fullPath to "/Users/danielebuatti/Movies/" & subfolderName
	do shell script "mkdir -p " & quoted form of fullPath
	do shell script "mkdir -p " & quoted form of "/Users/danielebuatti/Movies/_Inbox"
	tell application "Finder"
		open (POSIX file fullPath as alias)
		set current view of front window to icon view
	end tell
end ensureAndOpenMoviesSubfolder

set audioChecklist to "1. 💾 SSD in, if this Logic file lives on it
2. PreSonus interface -> ON, connected via USB
3. Privia -> USB (MIDI only, no audio) -> Connected
4. Rode Wireless GO receiver -> charged, powered ON, in range of transmitter -> 3.5mm TRS out -> spare PreSonus input (NOT into the phone or its USB-C port)
5. Logic's audio Output Device = \"Recording Output (PreSonus + BlackHole)\" (built in Audio MIDI Setup, sample rates matched)
6. If Meld hears nothing: System Settings > Privacy & Security -> re-check BlackHole is permitted (resets on macOS updates)
7. Meld Studio audio source = BlackHole 2ch
8. Headphones into the PreSonus headphone out if you want to hear yourself + the VST live (optional if you're fine reviewing after)
9. iPhone -> camera only, no cables -> can sit flat on the table (occasional wireless dropouts reported — glance at the preview before recording)
10. Meld Settings > General > Recording > Recording Canvas Output -> confirm Main or Portrait, whichever you actually want (can't be scripted)
11. Meld Settings > General > Recording > Local Destination -> confirm it's /Users/danielebuatti/Movies/_Inbox (set once, should never need changing)
12. MIDI keeps recording in Logic regardless of all of the above"

-----------------------------------------------------------
-- BRANCH A: TIKTOK / SHORTS (full pipeline through to upload)
-----------------------------------------------------------
if workflowChoice is "TikTok/Shorts" then
	
	display alert "⚡️ TikTok Setup Checklist" message audioChecklist buttons {"Ready"} default button "Ready"
	
	my ensureAndOpenMoviesSubfolder("TikTok")
	if not (my duplicateAndOpenTemplate(POSIX path of quickLogicPath, "TikTok")) then return
	
	tell application "Meld Studio" to activate
	delay 2
	my switchMeldScene("TikTok")
	my splitScreenLogicMeld()

	-- Grab a Slo-Mo clip if you want one for the edit — manual click, no automation
	do shell script "open -a 'Photos'"
	display notification "Photos is open — click into the Slo-Mo album yourself if you need a clip." with title "Manual step"
	
	delay 1
	do shell script "/Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --profile-directory=" & quoted form of chromeProfileName & " --args " & quoted form of tiktokUploadURL
	
	display notification "Studio Live. Run 'Finish Take' when you stop recording, then drag from Movies to Browser." with title "TikTok Mode Active"
	return
	
	-----------------------------------------------------------
	-- BRANCH B: IG STORY / QUICK CAPTURE (no upload step — just play, Meld records)
	-----------------------------------------------------------
else if workflowChoice is "IG Story (Quick Capture)" then
	
	display alert "📱 IG Story Quick Capture Checklist" message audioChecklist buttons {"Ready"} default button "Ready"
	
	my ensureAndOpenMoviesSubfolder("IG Story")
	if not (my duplicateAndOpenTemplate(POSIX path of quickLogicPath, "IG Story")) then return
	
	tell application "Meld Studio" to activate
	delay 2
	my switchMeldScene("IG Story")
	my splitScreenLogicMeld()

	display notification "Hit record in Meld, then play. When you stop, run 'Finish Take' from this script." with title "IG Story Mode Active"
	return
	
	-----------------------------------------------------------
	-- BRANCH C: PIANO IMPROVISATION — replaces the old separate "Felt Piano"
	-- and "Insight Timer" branches, which were really the same underlying
	-- action (record a piano improvisation) split awkwardly across two menu
	-- items. Now it just asks the two things that actually vary — which
	-- sound, and whether to film — and handles everything else the same way
	-- regardless. Meld's scene only governs the camera/visual framing, not
	-- audio (that's all Logic), so there's no need for a separate "Piano"
	-- scene — the existing "Felt Piano" scene is reused for filming either way.
	--
	-- Composer Hub gets an entry immediately, before Logic even opens, using
	-- either the Daily Creative Prompt (as inspiration + title) or a generic
	-- date-based title if you'd rather skip that. Where the finished piece
	-- ends up (TikTok, IG, Insight Timer, DistroKid) is no longer decided
	-- here at record time — that's a call you make later, from Composer Hub.
	-----------------------------------------------------------
else if workflowChoice is "Piano Improvisation" then
	
	-- Both wrapped in try/on error so Escape/Cmd-. exits cleanly instead of
	-- throwing an unhandled AppleScript error dialog (same fix as applied to
	-- Deep Composition's name dialog).
	try
		set soundChoice to button returned of (display dialog "What sound?" buttons {"Felt Piano", "Piano"} default button "Felt Piano" with title "Piano Improvisation")
		set filmChoice to button returned of (display dialog "Film it too?" buttons {"No — Audio Only", "Yes — Film It"} default button "Yes — Film It" with title "Piano Improvisation")
	on error
		return -- user cancelled
	end try
	set willFilm to (filmChoice is "Yes — Film It")
	
	if soundChoice is "Felt Piano" then
		set templatePath to feltPianoLogicPath
	else
		set templatePath to pianoLogicPath
	end if
	
	if willFilm then
		display alert "🎹 " & soundChoice & " Setup Checklist" message audioChecklist buttons {"Ready"} default button "Ready"
	else
		display alert "🎹 " & soundChoice & " Setup (Audio Only)" message "1. 💾 SSD in, if this file lives on it
2. PreSonus interface -> ON, connected via USB
3. Headphones -> Into PreSonus (optional)
4. Check room for noise floor
5. Bounce a WAV/MP3 from Logic when you're happy with it (File > Bounce) — needed for wherever you decide to upload this later" buttons {"Ready"} default button "Ready"
	end if
	
	-- Fetch a fresh Daily Creative Prompt directly (no browser needed) and put
	-- it straight in front of you + on the clipboard, before Logic even opens.
	-- Three options instead of a full bail-out: Skip Title (play anyway, with
	-- a generic date-based title), Get Another Prompt (cycle — this calls
	-- Composer Hub's "generate" endpoint, so a fresh prompt comes back each
	-- time), or Let's Play (use the prompt itself as the title). If you want
	-- to abandon the session entirely, just quit the app.
	repeat
		try
			set dailyPrompt to do shell script "zsh -lic " & quoted form of ("node " & quoted form of composerHubPath & " --prompt")
			set the clipboard to dailyPrompt
			set promptChoice to button returned of (display dialog "🎼 Today's prompt:" & return & return & dailyPrompt & return & return & "(copied to clipboard)" buttons {"Skip Title", "Get Another Prompt", "Let's Play"} default button "Let's Play" with title "Composer Hub — Daily Creative Prompt")
		on error errMsg
			-- A blocking dialog, not a notification — notifications are easy to miss
			-- (that's exactly what happened during testing: the fetch was silently
			-- failing for several runs before anyone noticed).
			display dialog "Couldn't fetch a Composer Hub prompt:" & return & return & errMsg & return & return & "Continuing with a generic title instead — you can still play." buttons {"OK"} default button "OK" with title "Composer Hub — Prompt Fetch Failed"
			set promptChoice to "Skip Title"
		end try
		if promptChoice is "Skip Title" then
			-- Just the sound + time, no date — composer-hub.js already prepends
			-- today's date to every title, so including it here too would show
			-- up twice (e.g. "20260722 - Piano 2026-07-22 16:10").
			set finalTitle to soundChoice & " " & (do shell script "date +%H:%M")
			exit repeat
		else if promptChoice is "Let's Play" then
			set finalTitle to dailyPrompt
			exit repeat
		end if
		-- "Get Another Prompt" falls through and loops, fetching a new one
	end repeat
	
	-- Log to Composer Hub right now, regardless of sound/film choice — an
	-- entry exists immediately, matched and ready to go from the start.
	-- Non-blocking: a failure here shouldn't stop you from playing. Also
	-- opens the new entry's page directly (composer-hub.js always prints the
	-- URL as its last line on success) — so you land straight on this idea,
	-- not the generic dashboard, and can see immediately that it worked.
	--
	-- Runs AFTER duplicateAndOpenTemplate on purpose: the .logicx file must
	-- exist first so its path can be passed via --path, giving the Hub entry
	-- its immutable original_name / logic_project_path link to the folder.
	if not (my duplicateAndOpenTemplate(POSIX path of templatePath, soundChoice)) then return

	try
		set hubCmd to "node " & quoted form of composerHubPath & " " & quoted form of finalTitle & " --mode piano_improvisation"
		if lastCapturePath is not "" then set hubCmd to hubCmd & " --path " & quoted form of lastCapturePath
		set hubResultURL to do shell script "zsh -lic " & quoted form of (hubCmd & " | tail -1")
		display notification "Logged to Composer Hub as \"" & finalTitle & "\"." with title "Composer Hub"
		open location hubResultURL
	on error errMsg
		display notification "Couldn't log to Composer Hub (" & errMsg & ") — you can still play, it just won't be tracked." with title "Composer Hub"
	end try

	if willFilm then
		my ensureAndOpenMoviesSubfolder(soundChoice)
	end if
	
	if willFilm then
		tell application "Meld Studio" to activate
		delay 2
		my switchMeldScene("Felt Piano")
		my splitScreenLogicMeld()

		-- Auto-record is a real option (via Meld's WebChannel API, not a
		-- fragile keystroke simulation) but always asks first — recording
		-- immediately with no confirmation would mean dead air at the start
		-- of every take while you get settled.
		set startChoice to button returned of (display dialog "Ready to start recording in Meld?" buttons {"Not Yet", "Start Recording"} default button "Start Recording" with title "Piano Improvisation")
		if startChoice is "Start Recording" then
			my startMeldRecording("Felt Piano")
			set modeTitle to soundChoice & " Mode Active (Recording)"
			display notification "Recording — just play. When you stop, run 'Finish Take' from this script." with title modeTitle
		else
			set modeTitle to soundChoice & " Mode Active"
			display notification "Hit record in Meld yourself when ready, then play. When you stop, run 'Finish Take'." with title modeTitle
		end if
	else
		set modeTitle to soundChoice & " Mode Active (Audio Only)"
		display notification "Play, then bounce when you're ready. Decide where to upload it later, via Composer Hub." with title modeTitle
	end if
	return
	
	-----------------------------------------------------------
	-- BRANCH D: DEEP COMPOSITION
	-- NOTE: your NAS's IP changes, so a hardcoded IP is fragile by design.
	-- This tries the NAS's confirmed Bonjour hostname first (Crystal-Tokyo.local,
	-- per DSM Control Panel), and only falls back to the last-known IP below if
	-- the hostname doesn't resolve — that IP WILL drift again until the
	-- dual-DHCP/dual-subnet network issue is actually fixed (see reference doc).
	-----------------------------------------------------------
else if workflowChoice is "Deep Composition" then
	
	set volumeName to "Moon Prism"
	set mountHostGuess to "smb://Crystal-Tokyo.local" -- NAS's actual DSM device name (confirmed via DSM Control Panel)
	set mountIPFallback to "smb://192.168.1.102" -- current DHCP IP as of 2026-07-22; see reference doc re: dual-subnet issue, this WILL drift again until fixed
	set basePath to "/Volumes/Moon Prism/DBP/Creation"
	set logicTemplate to basePath & "/Piano Template.logicx"
	set sibTemplate to basePath & "/#TEMPLATE.sib"
	
	display alert "🎹 Deep Work Prep" message "1. 💾 PLUG IN SSD (Moon Prism Drive)
2. PreSonus Interface -> ON
3. Moon Prism Server -> Checking Connection" buttons {"Start"} default button "Start"
	
	tell application "Finder"
		if not (exists disk volumeName) then
			try
				mount volume mountHostGuess
			on error
				try
					mount volume mountIPFallback
				on error errMsg
					display dialog "Mount failed via hostname and IP: " & errMsg & " — check the NAS is on and reachable."
					return
				end try
			end try
		end if
	end tell
	
	set folderExists to false
	repeat with i from 1 to 10
		if (do shell script "test -d " & quoted form of basePath & " && echo exists || echo missing") is "exists" then
			set folderExists to true
			exit repeat
		end if
		delay 1
	end repeat
	
	if folderExists is false then
		display dialog "Server folder not found. Check network/SSD."
		return
	end if
	
	-- Wrapped in try/on error so clicking Cancel here exits cleanly instead of
	-- throwing an unhandled AppleScript error dialog.
	try
		set userInput to text returned of (display dialog "Project/Song Name:" default answer "")
	on error
		return -- user cancelled
	end try
	set currentDate to do shell script "date +%Y%m%d"
	
	set finalFolderName to currentDate & " " & userInput
	set finalFolderPath to basePath & "/" & finalFolderName
	set finalLogicxPath to finalFolderPath & "/" & finalFolderName & ".logicx"
	set finalSibPath to finalFolderPath & "/" & finalFolderName & ".sib"
	
	-- Same immediate-logging pattern as Piano Improvisation — a "Needs Audio"
	-- entry exists in Composer Hub from the moment you name the project, ready to
	-- receive a bounce whenever the piece is far enough along. Non-blocking:
	-- a failure here shouldn't stop you from getting into the actual work.
	-- Skipped entirely (not attempted) if the name was left blank, rather than
	-- trying and showing a confusing "failed" notification for a non-failure.
	-- Runs AFTER the folder paths are computed (and the folder is created
	-- below) so --path can carry the immutable link to the NAS folder.
	do shell script "mkdir -p " & quoted form of finalFolderPath
	
	if userInput is not "" then
		try
			set hubCmd to "node " & quoted form of composerHubPath & " " & quoted form of userInput & " --mode deep_composition --path " & quoted form of finalFolderPath
			set hubResultURL to do shell script "zsh -lic " & quoted form of (hubCmd & " | tail -1")
			display notification "Logged to Composer Hub — upload audio there whenever it's ready." with title "Composer Hub"
			open location hubResultURL
		on error errMsg
			display notification "Couldn't log to Composer Hub (" & errMsg & ") — continuing anyway." with title "Composer Hub"
		end try
	end if
	
	do shell script "cp -R " & quoted form of logicTemplate & " " & quoted form of finalLogicxPath
	do shell script "cp " & quoted form of sibTemplate & " " & quoted form of finalSibPath
	
	tell application "Finder"
		open (POSIX file finalFolderPath as alias)
		activate
	end tell
	
	set optionsList to {"Logic", "Sibelius", "Both", "Folder Only"}
	set selected to (choose from list optionsList with prompt "Open which apps?" default items {"Both"})
	
	if selected is false then return
	
	if (selected contains "Logic") or (selected contains "Both") then
		do shell script "open " & quoted form of finalLogicxPath
	end if
	if (selected contains "Sibelius") or (selected contains "Both") then
		do shell script "open " & quoted form of finalSibPath
	end if
	
	-----------------------------------------------------------
	-- BRANCH E: FINISH TAKE — run this right after stopping a recording in
	-- Meld. Finds the newest Logic capture in _Captures/, works out which
	-- workflow it belongs to, finds the newest video in the matching
	-- Movies/<Workflow>/ folder, and renames the video to match — solving the
	-- "which video goes with which Logic file" tracking grievance without a
	-- manual drag-and-rename. Refuses to guess (and tells you why) if the
	-- newest video looks stale, rather than risk renaming the wrong file.
	-----------------------------------------------------------
else if workflowChoice is "Finish Take (Match Video to Logic File)" then
	
	-- Optional title, additive to the timestamp (not replacing it) — appended
	-- to the video filename only. Composer Hub logging already happened at
	-- record-start (Piano Improvisation / Deep Composition branches), so this
	-- title is just for the file itself. Leave blank to skip; nothing changes.
	set takeTitle to ""
	try
		set takeTitle to text returned of (display dialog "Song title (optional — leave blank to skip):" default answer "" buttons {"Skip", "OK"} default button "OK" cancel button "Skip")
	on error
		set takeTitle to ""
	end try
	
	try
		if takeTitle is "" then
			set finishResult to do shell script "zsh -lic " & quoted form of ("node " & quoted form of finishTakePath)
		else
			set finishResult to do shell script "zsh -lic " & quoted form of ("node " & quoted form of finishTakePath & " " & quoted form of takeTitle)
		end if

		-- finish-take.js always prints a "VIDEO_PATH: <path>" line on success
		-- (not necessarily the last line, since a leftovers note can follow it).
		-- Pull it out to reveal the moved/renamed video in Finder — the same
		-- "show me where it landed" treatment duplicateAndOpenTemplate already
		-- gives the Logic file — and strip it from what actually gets shown in
		-- the dialog, so you see the human-readable summary, not the tag.
		set videoPathToReveal to ""
		set displayLines to {}
		repeat with oneLine in paragraphs of finishResult
			if oneLine starts with "VIDEO_PATH: " then
				set videoPathToReveal to text 13 thru -1 of oneLine
			else
				set end of displayLines to oneLine
			end if
		end repeat
		set AppleScript's text item delimiters to return
		set cleanResult to displayLines as text
		set AppleScript's text item delimiters to ""

		if videoPathToReveal is not "" then
			-- Activate here (unlike the Logic-file reveal) — Finish Take means
			-- you're done recording, so there's no more "stay focused in Logic"
			-- urgency, and seeing the finished file is the actual point.
			try
				tell application "Finder"
					reveal (POSIX file videoPathToReveal)
					activate
				end tell
			end try
		end if

		display dialog cleanResult buttons {"OK"} default button "OK" with title "Finish Take"
	on error errMsg
		display dialog "Finish Take couldn't match a video to a Logic file:" & return & return & errMsg buttons {"OK"} default button "OK"
	end try
	
end if
