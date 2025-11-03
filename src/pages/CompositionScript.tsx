import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { HardDrive, FolderOpen, Music, FileText, ArrowRight, CheckCircle, Zap } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

const ScriptStep: React.FC<{ title: string, description: string, Icon: React.ElementType, isPrimary?: boolean }> = ({ title, description, Icon, isPrimary = false }) => (
    <li className={cn("flex items-start p-3 rounded-lg transition-colors", isPrimary ? "bg-blue-500/10 dark:bg-blue-900/20 border border-blue-500/50" : "hover:bg-muted/50")}>
        <Icon className={cn("w-5 h-5 mr-3 mt-1 flex-shrink-0", isPrimary ? "text-blue-600 dark:text-blue-400" : "text-primary")} />
        <div>
            <span className="font-semibold text-base">{title}</span>
            <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
        </div>
    </li>
);

const CompositionScript: React.FC = () => {
  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Local Composition Script: Your Workflow Checklist</h1>
      
      <Card className="shadow-card-light dark:shadow-card-dark border-l-4 border-blue-500">
        <CardHeader className="pb-3">
          <CardTitle className="text-xl font-bold flex items-center text-blue-600 dark:text-blue-400">
            <Zap className="w-5 h-5 mr-2" /> Automated Project Setup (AppleScript)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            This script runs automatically when you start a new idea, ensuring your local files are organized and ready for production.
          </p>
          
          <ol className="space-y-3">
            <ScriptStep
                title="Step 1: Mount Network Volume"
                description='The script checks for and mounts the "Moon Prism" network volume, ensuring all project files are centralized.'
                Icon={HardDrive}
            />
            <ScriptStep
                title="Step 2: Create Project Folder"
                description='A new folder is created on the network drive, prefixed with YYYYMMDD and the composition title (e.g., "20241027 - Unspoken Lament").'
                Icon={FolderOpen}
            />
            <ScriptStep
                title="Step 3: Copy Templates"
                description='Your master "Piano Template.logicx" and "#TEMPLATE.sib" files are copied into the new folder and renamed to match the composition title.'
                Icon={Music}
            />
            <ScriptStep
                title="Step 4: Launch Application"
                description='The script opens the new project folder in Finder and prompts you to choose whether to launch Logic, Sibelius, or neither.'
                Icon={ArrowRight}
                isPrimary
            />
          </ol>
        </CardContent>
      </Card>
      
      <Card className="mt-8 shadow-card-light dark:shadow-card-dark border-l-4 border-green-500">
        <CardHeader className="pb-3">
          <CardTitle className="text-xl font-bold flex items-center text-green-600 dark:text-green-400">
            <CheckCircle className="w-5 h-5 mr-2" /> Post-Capture Workflow (Web App)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            After capturing an idea, use the web app to complete these steps for distribution readiness.
          </p>
          
          <ol className="space-y-3">
            <ScriptStep
                title="1. Upload Audio File"
                description='Attach the final MP3/M4A audio file to the composition record.'
                Icon={Music}
            />
            <ScriptStep
                title="2. Add Creative Notes & Tags"
                description='Fill out the four creative zones (Structure, Mood, Technical, Next Steps) and add relevant user tags.'
                Icon={FileText}
            />
            <ScriptStep
                title="3. Generate Artwork Prompt"
                description='Use the AI tool to generate a compliant 3000x3000 artwork prompt based on your metadata.'
                Icon={Zap}
            />
            <ScriptStep
                title="4. AI Populate Metadata"
                description='Use the AI Augmentation button to automatically fill all Insight Timer categorization fields and generate a description.'
                Icon={Zap}
            />
            <ScriptStep
                title="5. Review & Confirm"
                description='Review all generated metadata, upload the final artwork, and mark the composition as "Ready for Release".'
                Icon={CheckCircle}
                isPrimary
            />
          </ol>
        </CardContent>
      </Card>
    </div>
  );
};

export default CompositionScript;