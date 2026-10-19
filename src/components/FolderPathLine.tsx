import React from 'react';
import { Folder, Copy } from 'lucide-react';
import { showSuccess } from '@/utils/toast';
import type { Improvisation } from '@/types/improvisation';

/**
 * Returns the immutable local folder name for an improvisation.
 * Priority: original_name (set once at creation) → basename of
 * logic_project_path → null.
 */
export function getOriginalFolderName(imp: Pick<Improvisation, 'original_name' | 'logic_project_path'>): string | null {
  if (imp.original_name) return imp.original_name;
  if (imp.logic_project_path) {
    const base = imp.logic_project_path.split('/').filter(Boolean).pop() || '';
    return base.replace(/\.logicx$/, '') || null;
  }
  return null;
}

interface FolderPathLineProps {
  imp: Pick<Improvisation, 'original_name' | 'logic_project_path' | 'nas_folder_path'>;
  className?: string;
  /** Show the full path instead of just the folder name */
  full?: boolean;
}

/**
 * Small, unobtrusive line showing the local folder the improvisation came
 * from. The title (generated_name) stays freely editable — this is the
 * permanent link back to the .logicx / NAS folder. Click the copy icon to
 * copy the full path.
 */
const FolderPathLine: React.FC<FolderPathLineProps> = ({ imp, className, full = false }) => {
  const folderName = getOriginalFolderName(imp);
  const fullPath = imp.logic_project_path || imp.nas_folder_path;
  if (!folderName && !fullPath) return null;

  const display = full && fullPath ? fullPath : folderName;

  return (
    <div
      className={`flex items-center gap-1.5 text-[11px] text-muted-foreground/80 min-w-0 ${className || ''}`}
      title={fullPath || folderName || ''}
    >
      <Folder className="h-3 w-3 flex-shrink-0" />
      <span className="truncate font-mono">{display}</span>
      {fullPath && (
        <button
          type="button"
          className="flex-shrink-0 p-0.5 rounded hover:bg-muted transition-colors"
          onClick={(e) => {
            e.stopPropagation();
            navigator.clipboard.writeText(fullPath);
            showSuccess('Path copied to clipboard');
          }}
          aria-label="Copy folder path"
        >
          <Copy className="h-2.5 w-2.5" />
        </button>
      )}
    </div>
  );
};

export default FolderPathLine;
