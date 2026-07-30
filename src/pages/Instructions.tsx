import React, { useEffect, useState } from 'react';
import { Sparkles, Music, Upload, FileText, CheckCircle, Send, Monitor, Image as ImageIcon, Wand2, LogIn, Terminal, Apple, Video, Clapperboard } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

const sections = [
  { id: 'overview', label: 'Overview', icon: Sparkles, color: 'text-primary' },
  { id: 'setup', label: '1. Local Script Setup', icon: Terminal, color: 'text-blue-500' },
  { id: 'capture', label: '2. Capture an Idea', icon: Music, color: 'text-purple-500' },
  { id: 'record', label: '3. Record & Create', icon: Monitor, color: 'text-cyan-500' },
  { id: 'upload-audio', label: '4. Upload Audio', icon: Upload, color: 'text-orange-500' },
  { id: 'notes', label: '5. Creative Notes', icon: FileText, color: 'text-yellow-500' },
  { id: 'artwork', label: '6. Artwork', icon: ImageIcon, color: 'text-pink-500' },
  { id: 'metadata', label: '7. AI Metadata', icon: Wand2, color: 'text-indigo-500' },
  { id: 'distribution', label: '8. Distribution', icon: Send, color: 'text-teal-500' },
  { id: 'submit', label: '9. Submit', icon: CheckCircle, color: 'text-green-500' },
];

const stepColors = [
  'bg-blue-500', 'bg-purple-500', 'bg-cyan-500', 'bg-orange-500',
  'bg-yellow-500', 'bg-pink-500', 'bg-indigo-500', 'bg-teal-500', 'bg-green-500'
];

const workflowOptions = [
  { label: 'TikTok / Shorts', desc: 'Vertical video + Meld recording', template: 'For Streaming Things.logicx', templatePath: 'Scripts/_QuickCapture/' },
  { label: 'IG Story', desc: 'Quick capture, no upload step', template: 'For Streaming Things.logicx', templatePath: 'Scripts/_QuickCapture/' },
  { label: 'Felt Piano', desc: 'Ambient felt piano improvisation', template: 'felt-ideas.logicx', templatePath: 'Scripts/_QuickCapture/' },
  { label: 'Piano', desc: 'Plain piano improvisation', template: 'piano.logicx', templatePath: 'Scripts/_QuickCapture/' },
  { label: 'Insight Timer', desc: 'Meditation / ambient audio', template: 'felt-ideas.logicx', templatePath: 'Scripts/_QuickCapture/' },
  { label: 'Deep Composition', desc: 'NAS project with Logic + Sibelius', template: 'Piano Template.logicx', templatePath: 'NAS Moon Prism/' },
  { label: 'Finish Take', desc: 'Match video to Logic file', template: '—', templatePath: '—' },
];

const Instructions: React.FC = () => {
  const [activeSection, setActiveSection] = useState('overview');

  useEffect(() => {
    document.title = 'Instructions - AI Composer Hub';
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      const scrollPos = window.scrollY + 140;
      let current = sections[0].id;
      for (let i = sections.length - 1; i >= 0; i--) {
        const el = document.getElementById(sections[i].id);
        if (el && el.offsetTop <= scrollPos) { current = sections[i].id; break; }
      }
      setActiveSection(current);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const activeIdx = sections.findIndex(s => s.id === activeSection);

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-8">
      <div className="flex gap-8">

        {/* ===== SIDEBAR ===== */}
        <nav className="hidden lg:block w-64 flex-shrink-0">
          <div className="sticky top-8 space-y-1">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-4 px-3">Guide</h2>

            {/* Progress dots */}
            <div className="flex items-center gap-1 px-3 mb-4">
              {stepColors.map((c, i) => (
                <div key={i} className={cn("h-1.5 flex-1 rounded-full transition-colors", i <= activeIdx ? c : "bg-muted")} />
              ))}
            </div>

            {sections.map((s, i) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all",
                  activeSection === s.id
                    ? "bg-primary text-primary-foreground font-medium shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
              >
                <div className={cn(
                  "h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0",
                  activeSection === s.id ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted-foreground/10 text-muted-foreground"
                )}>
                  {i === 0 ? '•' : i}
                </div>
                <span className="truncate">{s.label}</span>
              </a>
            ))}
          </div>
        </nav>

        {/* ===== CONTENT ===== */}
        <div className="flex-1 min-w-0 space-y-16">

          {/* Mobile picker */}
          <div className="lg:hidden">
            <div className="flex items-center gap-1 mb-3">
              {stepColors.map((c, i) => (
                <div key={i} className={cn("h-1.5 flex-1 rounded-full transition-colors", i <= activeIdx ? c : "bg-muted")} />
              ))}
            </div>
            <select
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={activeSection}
              onChange={(e) => document.getElementById(e.target.value)?.scrollIntoView({ behavior: 'smooth' })}
            >
              {sections.map((s, i) => (
                <option key={s.id} value={s.id}>{i === 0 ? s.label : `${i}. ${s.label.slice(3)}`}</option>
              ))}
            </select>
          </div>

          {/* ===== OVERVIEW ===== */}
          <section id="overview">
            <h1 className="text-4xl font-bold tracking-tight mb-2">Workflow Guide</h1>
            <p className="text-lg text-muted-foreground mb-8">From creative spark to platform submission — the complete path an idea takes through AI Composer Hub.</p>

            <div className="grid gap-6 md:grid-cols-3 mb-8">
              <Card className="border-l-4 border-l-purple-500">
                <CardContent className="p-5">
                  <div className="h-10 w-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center mb-3"><Music className="h-5 w-5 text-purple-500" /></div>
                  <h3 className="font-semibold mb-1">1. Capture</h3>
                  <p className="text-sm text-muted-foreground">AppleScript picker creates a Logic file and logs the idea to Composer Hub automatically.</p>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-orange-500">
                <CardContent className="p-5">
                  <div className="h-10 w-10 rounded-lg bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center mb-3"><Wand2 className="h-5 w-5 text-orange-500" /></div>
                  <h3 className="font-semibold mb-1">2. Refine</h3>
                  <p className="text-sm text-muted-foreground">Upload audio, add notes, generate artwork, populate metadata — all in the web app.</p>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-green-500">
                <CardContent className="p-5">
                  <div className="h-10 w-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-3"><Send className="h-5 w-5 text-green-500" /></div>
                  <h3 className="font-semibold mb-1">3. Submit</h3>
                  <p className="text-sm text-muted-foreground">Mark ready, submit to DistroKid and/or Insight Timer, track everything in one place.</p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardContent className="p-6 space-y-4">
                <p>
                  AI Composer Hub is a two-part system: <strong>local AppleScripts</strong> handle the
                  recording setup (opening Logic, switching Meld scenes, filing videos), and the
                  <strong> web app</strong> handles everything after — audio, notes, artwork, metadata,
                  and distribution.
                </p>
                <p>
                  Every session automatically logs an entry to Composer Hub so nothing is lost.
                  Audio upload is always optional — entries exist happily without it, ready for
                  you to come back to later.
                </p>
              </CardContent>
            </Card>
          </section>

          {/* ===== 1. LOCAL SCRIPT SETUP ===== */}
          <section id="setup">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-9 w-9 rounded-full bg-blue-500 text-white flex items-center justify-center text-sm font-bold flex-shrink-0">1</div>
              <h2 className="text-2xl font-bold">Local Script Setup</h2>
            </div>

            <div className="space-y-4">
              <Card>
                <CardContent className="p-6 space-y-4">
                  <h3 className="font-semibold text-lg flex items-center gap-2"><LogIn className="h-4 w-4 text-blue-500" /> Login to Composer Hub</h3>
                  <p>Before the scripts can create ideas, you need to log in once:</p>
                  <div className="bg-muted rounded-lg p-4 font-mono text-sm space-y-1">
                    <div className="text-muted-foreground"># Run the login script</div>
                    <div>node ~/Music/Logic/_Scripts/composer-hub-login.js</div>
                    <div className="text-muted-foreground mt-2"># Choose option 1 (Email & Password)</div>
                    <div className="text-muted-foreground"># Enter your Composer Hub credentials</div>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    This caches a session in <code className="bg-muted px-1 rounded">~/.config/composer-hub/auth.json</code>.
                    The token refreshes automatically on each use. Re-run only if you sign out.
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6 space-y-4">
                  <h3 className="font-semibold text-lg flex items-center gap-2"><Apple className="h-4 w-4 text-blue-500" /> Workflow Picker AppleScript</h3>
                  <p>
                    The <code className="bg-muted px-1 rounded">Workflow Picker (Consolidated).applescript</code> is the
                    main entry point. Compile it to an app for easy access:
                  </p>
                  <div className="bg-muted rounded-lg p-4 font-mono text-sm">
                    osacompile -o "~/Music/Logic/_Scripts/Workflow Picker.app" \
                      "~/Music/Logic/_Scripts/Workflow Picker (Consolidated).applescript"
                  </div>
                  <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg text-sm">
                    <strong>Note:</strong> The <code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">.app</code> is a compiled binary.
                    Always recompile after editing the <code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">.applescript</code> source.
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6 space-y-4">
                  <h3 className="font-semibold text-lg flex items-center gap-2"><Terminal className="h-4 w-4 text-blue-500" /> Quick CLI Tests</h3>
                  <p>Verify the login works and test the scripts independently:</p>
                  <div className="bg-muted rounded-lg p-4 font-mono text-sm space-y-1">
                    <div className="text-muted-foreground"># Fetch a daily prompt</div>
                    <div>node ~/Music/Logic/_Scripts/composer-hub.js --prompt</div>
                    <div className="text-muted-foreground mt-2"># Create an idea directly</div>
                    <div>node ~/Music/Logic/_Scripts/composer-hub.js "My Idea Title"</div>
                    <div className="text-muted-foreground mt-2"># Run Finish Take manually</div>
                    <div>node ~/Music/Logic/_Scripts/finish-take.js</div>
                    <div className="text-muted-foreground mt-2"># With a custom title</div>
                    <div>node ~/Music/Logic/_Scripts/finish-take.js "Song Title"</div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </section>

          {/* ===== 2. CAPTURE AN IDEA ===== */}
          <section id="capture">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-9 w-9 rounded-full bg-purple-500 text-white flex items-center justify-center text-sm font-bold flex-shrink-0">2</div>
              <h2 className="text-2xl font-bold">Capture an Idea</h2>
            </div>

            <div className="space-y-4">
              <Card>
                <CardContent className="p-6 space-y-4">
                  <h3 className="font-semibold text-lg">Workflow Picker Menu</h3>
                  <p>
                    Run <strong>Workflow Picker.app</strong> — it asks what you're creating and
                    handles everything from there. Choose from:
                  </p>

                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-muted-foreground">
                          <th className="text-left py-2 pr-4 font-medium">Workflow</th>
                          <th className="text-left py-2 pr-4 font-medium">Template</th>
                          <th className="text-left py-2 font-medium">Description</th>
                        </tr>
                      </thead>
                      <tbody>
                        {workflowOptions.map((w) => (
                          <tr key={w.label} className="border-b last:border-0">
                            <td className="py-2.5 pr-4 font-medium">{w.label}</td>
                            <td className="py-2.5 pr-4 text-muted-foreground font-mono text-xs">{w.template}</td>
                            <td className="py-2.5 text-muted-foreground">{w.desc}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6 space-y-4">
                  <h3 className="font-semibold text-lg flex items-center gap-2"><Sparkles className="h-4 w-4 text-purple-500" /> Daily Creative Prompt</h3>
                  <p>
                    The Insight Timer workflow fetches a Gemini-generated prompt before Logic opens.
                    The prompt is copied to your clipboard and used as the Composer Hub idea title
                    automatically. You can cycle through prompts, skip the session entirely, or
                    go straight to playing.
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6 space-y-4">
                  <h3 className="font-semibold text-lg flex items-center gap-2"><Music className="h-4 w-4 text-purple-500" /> Manual Capture</h3>
                  <p>
                    On the Dashboard, click <strong>Capture New Idea</strong> to create an entry
                    with just a title. Useful for logging ideas that came to you away from the
                    computer — on a walk, in the car, etc.
                  </p>
                </CardContent>
              </Card>
            </div>
          </section>

          {/* ===== 3. RECORD & CREATE ===== */}
          <section id="record">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-9 w-9 rounded-full bg-cyan-500 text-white flex items-center justify-center text-sm font-bold flex-shrink-0">3</div>
              <h2 className="text-2xl font-bold">Record & Create</h2>
            </div>

            <Card>
              <CardContent className="p-6 space-y-6">
                <p>
                  While you create, Composer Hub already has your idea logged. The entry sits at
                  "Idea Captured" — ready for audio, notes, and artwork when you are.
                </p>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="p-5 border rounded-xl bg-cyan-50/50 dark:bg-cyan-900/10">
                    <div className="h-10 w-10 rounded-lg bg-cyan-100 dark:bg-cyan-900/30 flex items-center justify-center mb-3">
                      <Video className="h-5 w-5 text-cyan-500" />
                    </div>
                    <h4 className="font-semibold mb-1">Recording with Video</h4>
                    <p className="text-sm text-muted-foreground">
                      TikTok, IG Story, Felt Piano — Meld Studio records video in parallel.
                      After you stop recording, run <strong>Finish Take</strong> to match the
                      newest video to the newest Logic capture, rename it, and file it in the
                      right <code className="bg-muted px-1 rounded">Movies/</code> folder.
                    </p>
                  </div>
                  <div className="p-5 border rounded-xl">
                    <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center mb-3">
                      <Music className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <h4 className="font-semibold mb-1">Audio Only</h4>
                    <p className="text-sm text-muted-foreground">
                      Insight Timer, deep compositions — no video needed. Bounce a WAV or MP3
                      from Logic when you're done and upload it to the entry's Creative Hub tab.
                      No Finish Take required.
                    </p>
                  </div>
                </div>

                <div className="p-4 border rounded-lg">
                  <h4 className="font-semibold flex items-center gap-2 mb-2"><Clapperboard className="h-4 w-4 text-cyan-500" /> Finish Take</h4>
                  <p className="text-sm text-muted-foreground">
                    This is the bridge between recording and filing. It finds the newest Logic
                    capture in <code className="bg-muted px-1 rounded">_Captures/</code>, works out
                    which workflow it belongs to (TikTok, IG Story, or Felt Piano), finds the
                    newest video in the matching <code className="bg-muted px-1 rounded">Movies/</code> folder,
                    and renames the video to match. If it's a Felt Piano take, it also creates a
                    Composer Hub entry (other workflows are logged at session start).
                    <strong className="block mt-2 text-foreground">Always run Finish Take after stopping a Meld recording.</strong>
                  </p>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* ===== 4. UPLOAD AUDIO ===== */}
          <section id="upload-audio">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-9 w-9 rounded-full bg-orange-500 text-white flex items-center justify-center text-sm font-bold flex-shrink-0">4</div>
              <h2 className="text-2xl font-bold">Upload Audio <span className="text-base font-normal text-muted-foreground">(optional)</span></h2>
            </div>

            <Card>
              <CardContent className="p-6 space-y-4">
                <p>
                  From the Dashboard, click any entry to open its detail page. On the
                  <strong> Creative Hub</strong> tab, find the <strong>Attach Audio File</strong> card.
                  Select an MP3 or M4A (max 250 MB) to upload.
                </p>
                <p>
                  Once uploaded, AI processing begins automatically:
                </p>
                <ul className="space-y-2">
                  <li className="flex items-start gap-2"><CheckCircle className="h-4 w-4 mt-0.5 text-orange-500 flex-shrink-0" /> <span className="text-sm"><strong>Title generation</strong> — AI analyzes the audio and generates a creative title</span></li>
                  <li className="flex items-start gap-2"><CheckCircle className="h-4 w-4 mt-0.5 text-orange-500 flex-shrink-0" /> <span className="text-sm"><strong>Artwork prompt</strong> — Generates a 3000x3000 album artwork prompt from the mood and genre</span></li>
                  <li className="flex items-start gap-2"><CheckCircle className="h-4 w-4 mt-0.5 text-orange-500 flex-shrink-0" /> <span className="text-sm"><strong>Creative suggestions</strong> — AI coach provides feedback and ideas</span></li>
                </ul>
                <p className="text-sm text-muted-foreground">
                  You can also <strong>drag-and-drop</strong> audio files from anywhere in the app
                  — the DragDropOverlay handles it app-wide.
                </p>
                <div className="p-3 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg text-sm">
                  <strong>Key point:</strong> Audio is never required. Entries without audio work
                  perfectly for tracking ideas, notes, artwork, and distribution prep. Upload
                  whenever the final bounce is ready — there's no rush.
                </div>
              </CardContent>
            </Card>
          </section>

          {/* ===== 5. CREATIVE NOTES ===== */}
          <section id="notes">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-9 w-9 rounded-full bg-yellow-500 text-white flex items-center justify-center text-sm font-bold flex-shrink-0">5</div>
              <h2 className="text-2xl font-bold">Creative Notes</h2>
            </div>

            <Card>
              <CardContent className="p-6 space-y-4">
                <p>
                  The Creative Hub tab has four note sections for documenting your creative process.
                  Each one auto-saves as you type.
                </p>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="p-4 border rounded-lg bg-yellow-50/50 dark:bg-yellow-900/10">
                    <h4 className="font-semibold flex items-center gap-2 text-sm"><FileText className="h-4 w-4 text-yellow-500" /> Structure & Form</h4>
                    <p className="text-xs text-muted-foreground mt-1">Sections, arrangement, dynamics, form analysis.</p>
                  </div>
                  <div className="p-4 border rounded-lg bg-yellow-50/50 dark:bg-yellow-900/10">
                    <h4 className="font-semibold flex items-center gap-2 text-sm"><FileText className="h-4 w-4 text-yellow-500" /> Mood & Inspiration</h4>
                    <p className="text-xs text-muted-foreground mt-1">Emotional intent, references, the story behind the piece.</p>
                  </div>
                  <div className="p-4 border rounded-lg bg-yellow-50/50 dark:bg-yellow-900/10">
                    <h4 className="font-semibold flex items-center gap-2 text-sm"><FileText className="h-4 w-4 text-yellow-500" /> Technical Notes</h4>
                    <p className="text-xs text-muted-foreground mt-1">Gear, plugins, settings, microphone placement.</p>
                  </div>
                  <div className="p-4 border rounded-lg bg-yellow-50/50 dark:bg-yellow-900/10">
                    <h4 className="font-semibold flex items-center gap-2 text-sm"><FileText className="h-4 w-4 text-yellow-500" /> Next Steps</h4>
                    <p className="text-xs text-muted-foreground mt-1">What to try next time, what to fix in the mix.</p>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  You can also add <strong>user tags</strong> for filtering and organization across
                  all your entries.
                </p>
              </CardContent>
            </Card>
          </section>

          {/* ===== 6. ARTWORK ===== */}
          <section id="artwork">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-9 w-9 rounded-full bg-pink-500 text-white flex items-center justify-center text-sm font-bold flex-shrink-0">6</div>
              <h2 className="text-2xl font-bold">Artwork</h2>
            </div>

            <Card>
              <CardContent className="p-6 space-y-4">
                <p>
                  On the <strong>Assets & Downloads</strong> tab, generate an AI artwork prompt
                  based on your metadata (title, genre, mood). The prompt is designed for
                  3000x3000 album artwork — the standard all distribution platforms require.
                </p>
                <ol className="space-y-3">
                  <li className="flex items-start gap-3">
                    <div className="h-6 w-6 rounded-full bg-pink-100 dark:bg-pink-900/30 text-pink-500 flex items-center justify-center text-xs font-bold flex-shrink-0">1</div>
                    <div className="text-sm">Click <strong>Generate AI Artwork Prompt</strong> (requires core metadata to be set first)</div>
                  </li>
                  <li className="flex items-start gap-3">
                    <div className="h-6 w-6 rounded-full bg-pink-100 dark:bg-pink-900/30 text-pink-500 flex items-center justify-center text-xs font-bold flex-shrink-0">2</div>
                    <div className="text-sm">Click <strong>Copy Prompt to Clipboard</strong></div>
                  </li>
                  <li className="flex items-start gap-3">
                    <div className="h-6 w-6 rounded-full bg-pink-100 dark:bg-pink-900/30 text-pink-500 flex items-center justify-center text-xs font-bold flex-shrink-0">3</div>
                    <div className="text-sm">Open VisualGPT Nano Banana (link provided) or your preferred AI image generator</div>
                  </li>
                  <li className="flex items-start gap-3">
                    <div className="h-6 w-6 rounded-full bg-pink-100 dark:bg-pink-900/30 text-pink-500 flex items-center justify-center text-xs font-bold flex-shrink-0">4</div>
                    <div className="text-sm">Generate and download the 3000x3000 image</div>
                  </li>
                  <li className="flex items-start gap-3">
                    <div className="h-6 w-6 rounded-full bg-pink-100 dark:bg-pink-900/30 text-pink-500 flex items-center justify-center text-xs font-bold flex-shrink-0">5</div>
                    <div className="text-sm">Upload it back using the <strong>Upload Artwork</strong> button on the same page</div>
                  </li>
                </ol>
              </CardContent>
            </Card>
          </section>

          {/* ===== 7. AI METADATA ===== */}
          <section id="metadata">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-9 w-9 rounded-full bg-indigo-500 text-white flex items-center justify-center text-sm font-bold flex-shrink-0">7</div>
              <h2 className="text-2xl font-bold">AI Metadata</h2>
            </div>

            <Card>
              <CardContent className="p-6 space-y-4">
                <p>
                  On the <strong>Distribution Prep</strong> tab, the <strong>AI Populate Metadata</strong>
                  button automatically fills all Insight Timer categorization fields at once:
                </p>
                <ul className="grid gap-2 md:grid-cols-2 text-sm">
                  {['Content Type', 'Language', 'Primary Use', 'Audience Level', 'Audience Age Range', 'Key Benefits', 'Recommended Practices', 'Themes & Topics', 'Voice Style', 'Description'].map((f) => (
                    <li key={f} className="flex items-center gap-2 p-2 rounded bg-indigo-50/50 dark:bg-indigo-900/10"><CheckCircle className="h-3.5 w-3.5 text-indigo-500 flex-shrink-0" /> {f}</li>
                  ))}
                </ul>
                <p className="text-sm text-muted-foreground">
                  Every field is editable after generation. Review and adjust before confirming.
                  The AI also generates a distribution-ready description based on the metadata.
                </p>
              </CardContent>
            </Card>
          </section>

          {/* ===== 8. DISTRIBUTION ===== */}
          <section id="distribution">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-9 w-9 rounded-full bg-teal-500 text-white flex items-center justify-center text-sm font-bold flex-shrink-0">8</div>
              <h2 className="text-2xl font-bold">Distribution Prep</h2>
            </div>

            <Card>
              <CardContent className="p-6 space-y-6">
                <p>
                  The <strong>Distribution Prep</strong> tab has everything for getting your track
                  onto streaming platforms.
                </p>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="p-5 border rounded-xl">
                    <h4 className="font-semibold text-lg mb-2">DistroKid Prep</h4>
                    <p className="text-sm text-muted-foreground mb-3">
                      Set the track's distribution toggles, then mark as submitted.
                    </p>
                    <ul className="space-y-1.5 text-sm">
                      <li className="flex items-center gap-2"><CheckCircle className="h-3.5 w-3.5 text-teal-500" /> Is Piano</li>
                      <li className="flex items-center gap-2"><CheckCircle className="h-3.5 w-3.5 text-teal-500" /> Is Instrumental</li>
                      <li className="flex items-center gap-2"><CheckCircle className="h-3.5 w-3.5 text-teal-500" /> Original Song</li>
                      <li className="flex items-center gap-2"><CheckCircle className="h-3.5 w-3.5 text-teal-500" /> Has Explicit Lyrics</li>
                    </ul>
                    <p className="text-xs text-muted-foreground mt-3">
                      After uploading to DistroKid, toggle <strong>Submitted to DistroKid</strong>.
                    </p>
                  </div>
                  <div className="p-5 border rounded-xl">
                    <h4 className="font-semibold text-lg mb-2">Insight Timer Prep</h4>
                    <p className="text-sm text-muted-foreground mb-3">
                      Full categorization form for meditation/ambient tracks.
                    </p>
                    <ul className="space-y-1.5 text-sm">
                      <li className="flex items-center gap-2"><CheckCircle className="h-3.5 w-3.5 text-teal-500" /> Content Type & Language</li>
                      <li className="flex items-center gap-2"><CheckCircle className="h-3.5 w-3.5 text-teal-500" /> Primary Use & Audience</li>
                      <li className="flex items-center gap-2"><CheckCircle className="h-3.5 w-3.5 text-teal-500" /> Benefits & Practices</li>
                      <li className="flex items-center gap-2"><CheckCircle className="h-3.5 w-3.5 text-teal-500" /> Themes & Voice</li>
                    </ul>
                    <p className="text-xs text-muted-foreground mt-3">
                      Confirm metadata review when done to mark the section complete.
                    </p>
                  </div>
                </div>

                <div className="p-4 border rounded-lg bg-teal-50/50 dark:bg-teal-900/10">
                  <h4 className="font-semibold flex items-center gap-2 mb-2">Pre-Flight Checklist</h4>
                  <p className="text-sm">
                    The checklist on the Distribution Prep tab shows overall readiness at a glance:
                  </p>
                  <ul className="space-y-1 mt-2 text-sm">
                    <li className="flex items-center gap-2"><span className="text-teal-500 font-bold">✓</span> Audio File — optional, shows as "Skipped" if not uploaded</li>
                    <li className="flex items-center gap-2"><span className="text-teal-500 font-bold">✓</span> Artwork — required for distribution</li>
                    <li className="flex items-center gap-2"><span className="text-teal-500 font-bold">✓</span> Metadata — must be reviewed and confirmed</li>
                  </ul>
                  <p className="text-xs text-muted-foreground mt-2">
                    All three must pass before the track is marked <strong>READY TO SUBMIT</strong>.
                  </p>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* ===== 9. SUBMIT ===== */}
          <section id="submit">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-9 w-9 rounded-full bg-green-500 text-white flex items-center justify-center text-sm font-bold flex-shrink-0">9</div>
              <h2 className="text-2xl font-bold">Submit</h2>
            </div>

            <Card>
              <CardContent className="p-6 space-y-6">
                <ol className="space-y-4">
                  <li className="flex items-start gap-3 p-4 border rounded-lg">
                    <div className="h-7 w-7 rounded-full bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 flex items-center justify-center text-sm font-bold flex-shrink-0">1</div>
                    <div>
                      <h4 className="font-semibold">Mark Ready for Release</h4>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        Click the button on the progress card. This signals that the entry has
                        all the metadata and assets it needs for distribution.
                      </p>
                    </div>
                  </li>
                  <li className="flex items-start gap-3 p-4 border rounded-lg">
                    <div className="h-7 w-7 rounded-full bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 flex items-center justify-center text-sm font-bold flex-shrink-0">2</div>
                    <div>
                      <h4 className="font-semibold">Submit to DistroKid</h4>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        Open the DistroKid link from Quick Tools, upload your track, then toggle
                        "Submitted to DistroKid" on the Distribution Prep tab.
                      </p>
                    </div>
                  </li>
                  <li className="flex items-start gap-3 p-4 border rounded-lg">
                    <div className="h-7 w-7 rounded-full bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 flex items-center justify-center text-sm font-bold flex-shrink-0">3</div>
                    <div>
                      <h4 className="font-semibold">Upload to Insight Timer</h4>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        Open the Insight Timer upload page, submit your audio file, then toggle
                        "Submitted to Insight Timer".
                      </p>
                    </div>
                  </li>
                </ol>

                <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                  <p className="text-sm font-medium text-green-800 dark:text-green-300">
                    Once both submissions are marked complete, the dashboard shows{' '}
                    <strong>🎉 Submitted!</strong> on the entry and the progress card reads
                    "Project fully submitted! Congratulations!"
                  </p>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Bottom nav */}
          <div className="flex items-center justify-between pt-4 border-t">
            <p className="text-xs text-muted-foreground">AI Composer Hub — Workflow Guide</p>
            <a href="#overview" className="text-xs text-primary hover:underline">Back to top ↑</a>
          </div>

        </div>
      </div>
    </div>
  );
};

export default Instructions;
