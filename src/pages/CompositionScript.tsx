import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { HardDrive, FolderOpen, Music, FileText, ArrowRight, CheckCircle, Zap, ListOrdered, Code } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

interface ScriptStepProps {
    stepNumber: number;
    title: string;
    description: string;
    Icon: React.ElementType;
    isPrimary?: boolean;
    colorClass: string; // New prop for color control
}

const ScriptStep: React.FC<ScriptStepProps> = ({ stepNumber, title, description, Icon, isPrimary = false, colorClass }) => (
    <li className={cn("flex items-start p-3 rounded-lg transition-colors", isPrimary ? `${colorClass}/10 border border-${colorClass}/50` : "hover:bg-muted/50")}>
        <div className="flex items-center flex-shrink-0 mr-3 mt-1">
            <div className={cn(
                "w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold",
                isPrimary ? `bg-${colorClass} text-white` : "bg-primary text-primary-foreground"
            )}>
                {stepNumber}
            </div>
        </div>
        <div>
            <span className="font-semibold text-base flex items-center">
                <Icon className={cn("w-4 h-4 mr-2", isPrimary ? `text-${colorClass} dark:text-${colorClass}/80` : "text-primary")} />
                {title}
            </span>
            <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
        </div>
    </li>
);

const CompositionScript: React.FC = () => {
  // Define color classes for the two sections
  const automatedColor = 'blue-600';
  const manualColor = 'green-600';

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-2">Local Composition Script</h1>
      <p className="text-lg text-muted-foreground mb-6">
        This is your definitive, step-by-step guide to turning an idea into a finished, distributable track. Follow the script!
      </p>
      
      <Card className={cn("shadow-card-light dark:shadow-card-dark border-l-4", `border-${automatedColor}`)}>
        <CardHeader className="pb-3">
          <CardTitle className={cn("text-xl font-bold flex items-center", `text-${automatedColor} dark:text-${automatedColor}/80`)}>
            <Code className="w-5 h-5 mr-2" /> Automated Project Setup (AppleScript)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            These steps are handled automatically by your local script when you initiate a new idea.
          </p>
          
          <ol className="space-y-3">
            <ScriptStep
                stepNumber={1}
                title="Mount Network Volume"
                description='The script checks for and mounts the "Moon Prism" network volume, ensuring all project files are centralized.'
                Icon={HardDrive}
                colorClass={automatedColor}
            />
            <ScriptStep
                stepNumber={2}
                title="Create Project Folder"
                description='A new folder is created on the network drive, prefixed with YYYYMMDD and the composition title (e.g., "20241027 - Unspoken Lament").'
                Icon={FolderOpen}
                colorClass={automatedColor}
            />
            <ScriptStep
                stepNumber={3}
                title="Copy Templates"
                description='Your master "Piano Template.logicx" and "#TEMPLATE.sib" files are copied into the new folder and renamed to match the composition title.'
                Icon={Music}
                colorClass={automatedColor}
            />
            <ScriptStep
                stepNumber={4}
                title="Launch Application"
                description='The script opens the new project folder in Finder and prompts you to choose whether to launch Logic, Sibelius, or neither.'
                Icon={ArrowRight}
                isPrimary
                colorClass={automatedColor}
            />
          </ol>
        </CardContent>
      </Card>
      
      <Card className={cn("mt-8 shadow-card-light dark:shadow-card-dark border-l-4", `border-${manualColor}`)}>
        <CardHeader className="pb-3">
          <CardTitle className={cn("text-xl font-bold flex items-center", `text-${manualColor} dark:text-${manualColor}/80`)}>
            <ListOrdered className="w-5 h-5 mr-2" /> Post-Capture Workflow (Web App)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            After recording, use the web app's Composition Details page to complete these steps for distribution readiness.
          </p>
          
          <ol className="space-y-3">
            <ScriptStep
                stepNumber={1}
                title="Upload Audio File"
                description='Attach the final MP3/M4A audio file to the composition record.'
                Icon={Music}
                colorClass={manualColor}
            />
            <ScriptStep
                stepNumber={2}
                title="Add Creative Notes & Tags"
                description='Fill out the four creative zones (Structure, Mood, Technical, Next Steps) and add relevant user tags.'
                Icon={FileText}
                colorClass={manualColor}
            />
            <ScriptStep
                stepNumber={3}
                title="Generate Artwork Prompt"
                description='Use the AI tool to generate a compliant 3000x3000 artwork prompt based on your metadata.'
                Icon={Zap}
                colorClass={manualColor}
            />
            <ScriptStep
                stepNumber={4}
                title="AI Populate Metadata"
                description='Use the AI Augmentation button to automatically fill all Insight Timer categorization fields and generate a description.'
                Icon={Zap}
                colorClass={manualColor}
            />
            <ScriptStep
                stepNumber={5}
                title="Review & Confirm"
                description='Review all generated metadata, upload the final artwork, and mark the composition as "Ready for Release".'
                Icon={CheckCircle}
                isPrimary
                colorClass={manualColor}
            />
          </ol>
        </CardContent>
      </Card>
    </div>
  );
};

export default CompositionScript;