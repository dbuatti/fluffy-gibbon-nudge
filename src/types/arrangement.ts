export type ArrangementStatus = 'draft' | 'in_progress' | 'completed' | 'archived';

export interface Arrangement {
  id: string;
  user_id?: string;
  title: string | null;
  source_track: string | null;
  status: ArrangementStatus;
  instrumentation: string | null;
  key: string | null;
  tempo: string | null;
  genre: string | null;
  notes: string | null;
  file_links: string[] | null;
  created_at: string;
  updated_at: string;
}

export const ARRANGEMENT_STATUS_OPTIONS: { value: ArrangementStatus; label: string }[] = [
  { value: 'draft', label: 'Draft' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'archived', label: 'Archived' },
];