import React, { useEffect, useState } from 'react';
import { Sparkles, Music, Upload, FileText, Zap, CheckCircle, Send, Monitor, Smartphone, BookOpen, ArrowRight, ListOrdered, Image as ImageIcon, HardDrive, Wand2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

const sections = [
  { id: 'overview', label: 'Overview', icon: Sparkles },
  { id: 'capture', label: '1. Capture an Idea', icon: Music },
  { id: 'record', label: '2. Record & Create', icon: Monitor },
  { id: 'upload-audio', label: '3. Upload Audio', icon: Upload },
  { id: 'notes', label: '4. Creative Notes', icon: FileText },
  { id: 'artwork', label: '5. Artwork', icon: ImageIcon },
  { id: 'metadata', label: '6. AI Metadata', icon: Wand2 },
  { id: 'distribution', label: '7. Distribution', icon: Send },
  { id: 'submit', label: '8. Submit', icon: CheckCircle },
];

const Instructions: React.FC = () => {
  const [activeSection, setActiveSection] = useState('overview');

  useEffect(() => {
    document.title = 'Instructions - AI Composer Hub';
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      const scrollPos = window.scrollY + 120;
      for (let i = sections.length - 1; i >= 0; i--) {
        const el = document.getElementById(sections[i].id);
        if (el && el.offsetTop <= scrollPos) {
          setActiveSection(sections[i].id);
          break;
        }
      }
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-8">
      <div className="flex gap-8">
        {/* Sidebar Nav */}
        <nav className="hidden lg:block w-64 flex-shrink-0">
          <div className="sticky top-8 space-y-1">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-3">Contents</h2>
            {sections.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors",
                  activeSection === s.id
                    ? "bg-primary text-primary-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
              >
                <s.icon className="h-4 w-4" />
                {s.label}
              </a>
            ))}
          </div>
        </nav>

        {/* Content */}
        <div className="flex-1 min-w-0 space-y-12">

          {/* Mobile section picker */}
          <div className="lg:hidden">
            <select
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={activeSection}
              onChange={(e) => {
                const el = document.getElementById(e.target.value);
                if (el) el.scrollIntoView({ behavior: 'smooth' });
              }}
            >
              {sections.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
          </div>

          {/* OVERVIEW */}
          <section id="overview">
            <h1 className="text-3xl font-bold mb-2">Workflow Guide</h1>
            <p className="text-muted-foreground mb-6">
              From spark to submission — the complete path an idea takes through AI Composer Hub.
            </p>
            <Card>
              <CardContent className="p-6 space-y-4">
                <p>
                  Every session starts with a creative spark. The AppleScript picker lets you
                  choose what you're making: a TikTok clip, Instagram Story, Felt Piano ambient
                  track, Insight Timer meditation, or a deep composition. Each path automatically
                  logs the idea to Composer Hub so nothing gets lost.
                </p>
                <p>
                  From there, the web app is where you refine: upload audio, add notes, generate
                  artwork, populate distribution metadata, and submit to platforms. Audio upload
                  is always optional — entries exist happily without it.
                </p>
              </CardContent>
            </Card>
          </section>

          {/* 1. CAPTURE */}
          <section id="capture">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">1</div>
              <h2 className="text-2xl font-bold">Capture an Idea</h2>
            </div>
            <Card>
              <CardContent className="p-6 space-y-4">
                <h3 className="font-semibold text-lg">AppleScript Workflow Picker</h3>
                <p>
                  Run the <code className="bg-muted px-1 rounded">Workflow Picker.app</code> to start a session.
                  It asks what you're creating:
                </p>
                <ul className="space-y-2">
                  {[
                    { label: 'TikTok / Shorts', desc: 'Quick vertical video with Meld recording + TikTok upload' },
                    { label: 'IG Story', desc: 'Quick capture, no upload step' },
                    { label: 'Felt Piano', desc: 'felt-ideas.logicx template, auto-logged to Composer Hub' },
                    { label: 'Insight Timer', desc: 'Fetches a Daily Creative Prompt, logs the prompt as the idea title, opens Logic + Insight Timer upload page + VisualGPT' },
                    { label: 'Deep Composition', desc: 'NAS-based project setup with Logic + Sibelius templates' },
                    { label: 'Finish Take', desc: 'Matches the newest video in _Inbox to the newest Logic capture, renames and files it' },
                  ].map((item) => (
                    <li key={item.label} className="flex items-start gap-2">
                      <ArrowRight className="h-4 w-4 mt-1 text-primary flex-shrink-0" />
                      <div><span className="font-medium">{item.label}</span> — {item.desc}</div>
                    </li>
                  ))}
                </ul>

                <h3 className="font-semibold text-lg mt-6">Daily Creative Prompt</h3>
                <p>
                  The Insight Timer branch fetches a Gemini-generated prompt before you play.
                  The prompt is copied to your clipboard and used as the Composer Hub idea
                  title. You can cycle through prompts or skip.
                </p>

                <h3 className="font-semibold text-lg mt-6">Manual Capture</h3>
                <p>
                  On the Dashboard, click <strong>Capture New Idea</strong> to create an entry
                  with just a title. Useful for logging ideas that came to you away from the
                  computer.
                </p>
              </CardContent>
            </Card>
          </section>

          {/* 2. RECORD & CREATE */}
          <section id="record">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">2</div>
              <h2 className="text-2xl font-bold">Record & Create</h2>
            </div>
            <Card>
              <CardContent className="p-6 space-y-4">
                <p>
                  While you create, Composer Hub already has your idea logged. The entry sits at
                  "Idea Captured" until you're ready to add media.
                </p>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="p-4 border rounded-lg">
                    <h4 className="font-semibold flex items-center gap-2"><Monitor className="h-4 w-4" /> With Video</h4>
                    <p className="text-sm text-muted-foreground mt-1">
                      TikTok, IG Story, Felt Piano — Meld Studio records video. After you stop,
                      run <strong>Finish Take</strong> to match the video to the Logic file.
                    </p>
                  </div>
                  <div className="p-4 border rounded-lg">
                    <h4 className="font-semibold flex items-center gap-2"><Music className="h-4 w-4" /> Audio Only</h4>
                    <p className="text-sm text-muted-foreground mt-1">
                      Insight Timer, deep compositions — bounce a WAV/MP3 from Logic and upload
                      to the entry later. No video involved.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* 3. UPLOAD AUDIO */}
          <section id="upload-audio">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">3</div>
              <h2 className="text-2xl font-bold">Upload Audio <span className="text-base font-normal text-muted-foreground">(optional)</span></h2>
            </div>
            <Card>
              <CardContent className="p-6 space-y-4">
                <p>
                  From the Dashboard, click any entry to open its detail page. On the
                  <strong> Creative Hub</strong> tab, attach an MP3 or M4A file (max 250 MB).
                </p>
                <p>
                  Once uploaded, AI processing begins automatically: title generation, artwork
                  prompt generation, and creative suggestions. You can also drag-and-drop audio
                  files from anywhere in the app.
                </p>
                <div className="p-3 bg-muted rounded-lg text-sm">
                  <strong>Tip:</strong> Audio is never required. Entries without audio work
                  perfectly for tracking ideas, notes, and distribution prep. Upload whenever
                  the final bounce is ready.
                </div>
              </CardContent>
            </Card>
          </section>

          {/* 4. CREATIVE NOTES */}
          <section id="notes">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">4</div>
              <h2 className="text-2xl font-bold">Creative Notes</h2>
            </div>
            <Card>
              <CardContent className="p-6 space-y-4">
                <p>
                  The Creative Hub tab has four note sections for documenting your process:
                </p>
                <ul className="space-y-3">
                  <li className="flex items-start gap-2">
                    <FileText className="h-4 w-4 mt-1 text-primary flex-shrink-0" />
                    <div><span className="font-medium">Structure & Form</span> — Sections, arrangement, dynamics</div>
                  </li>
                  <li className="flex items-start gap-2">
                    <FileText className="h-4 w-4 mt-1 text-primary flex-shrink-0" />
                    <div><span className="font-medium">Mood & Inspiration</span> — Emotional intent, references, story</div>
                  </li>
                  <li className="flex items-start gap-2">
                    <FileText className="h-4 w-4 mt-1 text-primary flex-shrink-0" />
                    <div><span className="font-medium">Technical Notes</span> — Gear, plugins, settings used</div>
                  </li>
                  <li className="flex items-start gap-2">
                    <FileText className="h-4 w-4 mt-1 text-primary flex-shrink-0" />
                    <div><span className="font-medium">Next Steps</span> — What to do next time, what to fix</div>
                  </li>
                </ul>
                <p className="text-sm text-muted-foreground">
                  You can also add user tags for filtering and organization.
                </p>
              </CardContent>
            </Card>
          </section>

          {/* 5. ARTWORK */}
          <section id="artwork">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">5</div>
              <h2 className="text-2xl font-bold">Artwork</h2>
            </div>
            <Card>
              <CardContent className="p-6 space-y-4">
                <p>
                  On the <strong>Assets & Downloads</strong> tab, generate an AI artwork prompt
                  based on your metadata (title, genre, mood). The prompt is designed for
                  3000x3000 album artwork generation.
                </p>
                <ol className="space-y-2 list-decimal list-inside text-sm">
                  <li>Click <strong>Generate AI Artwork Prompt</strong></li>
                  <li>Copy the prompt to clipboard</li>
                  <li>Open VisualGPT Nano Banana (link provided) or your preferred AI image tool</li>
                  <li>Generate the image and download</li>
                  <li>Upload the artwork back using the <strong>Upload Artwork</strong> button</li>
                </ol>
              </CardContent>
            </Card>
          </section>

          {/* 6. AI METADATA */}
          <section id="metadata">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">6</div>
              <h2 className="text-2xl font-bold">AI Metadata</h2>
            </div>
            <Card>
              <CardContent className="p-6 space-y-4">
                <p>
                  On the <strong>Distribution Prep</strong> tab, the <strong>AI Populate Metadata</strong>
                  button automatically fills all Insight Timer categorization fields:
                </p>
                <ul className="grid gap-2 md:grid-cols-2 text-sm">
                  {['Content Type', 'Language', 'Primary Use', 'Audience Level', 'Audience Age', 'Benefits', 'Practices', 'Themes', 'Voice', 'Description'].map((f) => (
                    <li key={f} className="flex items-center gap-2"><CheckCircle className="h-3 w-3 text-primary" /> {f}</li>
                  ))}
                </ul>
                <p className="text-sm text-muted-foreground mt-2">
                  Review and edit any field before confirming. The AI also generates a
                  distribution-ready description.
                </p>
              </CardContent>
            </Card>
          </section>

          {/* 7. DISTRIBUTION */}
          <section id="distribution">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">7</div>
              <h2 className="text-2xl font-bold">Distribution Prep</h2>
            </div>
            <Card>
              <CardContent className="p-6 space-y-4">
                <p>
                  The <strong>Distribution Prep</strong> tab has all the tools for getting your
                  track onto platforms:
                </p>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="p-4 border rounded-lg">
                    <h4 className="font-semibold">DistroKid Prep</h4>
                    <p className="text-sm text-muted-foreground mt-1">
                      Mark toggles for: Is Piano, Is Instrumental, Original Song,
                      Has Explicit Lyrics. Then mark as submitted when you've uploaded
                      to DistroKid.
                    </p>
                  </div>
                  <div className="p-4 border rounded-lg">
                    <h4 className="font-semibold">Insight Timer Prep</h4>
                    <p className="text-sm text-muted-foreground mt-1">
                      Full categorization form (content type, audience, benefits, themes,
                      voice). Confirm metadata review when done.
                    </p>
                  </div>
                </div>
                <h3 className="font-semibold mt-4">Pre-Flight Checklist</h3>
                <p>
                  The checklist shows overall readiness at a glance. Audio, artwork, and
                  metadata each have their own status. All three must pass before
                  the track is marked <strong>READY TO SUBMIT</strong>.
                </p>
              </CardContent>
            </Card>
          </section>

          {/* 8. SUBMIT */}
          <section id="submit">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">8</div>
              <h2 className="text-2xl font-bold">Submit</h2>
            </div>
            <Card>
              <CardContent className="p-6 space-y-4">
                <ol className="space-y-3">
                  <li className="flex items-start gap-2">
                    <div className="h-6 w-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold flex-shrink-0">1</div>
                    <div><span className="font-medium">Mark Ready for Release</span> — Sets the entry as ready on the progress card.</div>
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="h-6 w-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold flex-shrink-0">2</div>
                    <div><span className="font-medium">Submit to DistroKid</span> — Open DistroKid, upload your track, then toggle "Submitted to DistroKid" in the app.</div>
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="h-6 w-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold flex-shrink-0">3</div>
                    <div><span className="font-medium">Upload to Insight Timer</span> — Open Insight Timer upload page, submit your audio, then toggle "Submitted to Insight Timer".</div>
                  </li>
                </ol>
                <p className="text-sm text-muted-foreground mt-4">
                  Once both submissions are marked complete, the dashboard shows
                  <strong> 🎉 Submitted!</strong> on the entry and the progress card
                  reads "Project fully submitted!"
                </p>
              </CardContent>
            </Card>
          </section>

        </div>
      </div>
    </div>
  );
};

export default Instructions;
