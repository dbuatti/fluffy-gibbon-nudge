import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { HardDrive, FolderOpen, Music, FileText, ArrowRight } from 'lucide-react';
import { Separator } from '@/components/ui/separator';

const CompositionScriptCard: React.FC = () => {
  return (
    <Card className="shadow-card-light dark:shadow-card-dark border-l-4 border-blue-500">
      <CardHeader className="pb-3">
        <CardTitle className="text-xl font-bold flex items-center text-blue-600 dark:text-blue-400">
          <FileText className="w-5 h-5 mr-2" /> Local Composition Script Story
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          This is the story of how your local composition script automates project setup, ensuring consistency and saving time.
        </p>
        
        <ol className="space-y-3 text-sm">
          <li className="flex items-start">
            <HardDrive className="w-5 h-5 mr-3 mt-1 flex-shrink-0 text-primary" />
            <div>
              <span className="font-semibold">The Volume Check:</span> The script first checks if the "Moon Prism" network volume is mounted. If not, it attempts to mount it automatically, ensuring all files land in the correct, centralized location.
            </div>
          </li>
          <li className="flex items-start">
            <FolderOpen className="w-5 h-5 mr-3 mt-1 flex-shrink-0 text-primary" />
            <div>
              <span className="font-semibold">The Folder Creation:</span> It takes the generated title from the web app (e.g., "Unspoken Lament"), prefixes it with today's date (YYYYMMDD), and creates a brand new, dedicated project folder on the network drive.
            </div>
          </li>
          <li className="flex items-start">
            <Music className="w-5 h-5 mr-3 mt-1 flex-shrink-0 text-primary" />
            <div>
              <span className="font-semibold">The Template Copy:</span> It copies your master "Piano Template.logicx" and "#TEMPLATE.sib" files into the new folder, renaming them to match the new composition title.
            </div>
          </li>
          <li className="flex items-start">
            <ArrowRight className="w-5 h-5 mr-3 mt-1 flex-shrink-0 text-primary" />
            <div>
              <span className="font-semibold">The Grand Opening:</span> Finally, it opens the new project folder in Finder and prompts you to choose whether to launch Logic, Sibelius, or neither, allowing you to jump straight into creation.
            </div>
          </li>
        </ol>
        
        <Separator />
        <p className="text-xs text-muted-foreground italic">
            This process ensures every new idea starts with the correct structure and file paths, ready for development.
        </p>
      </CardContent>
    </Card>
  );
};

export default CompositionScriptCard;