export interface NoteTab {
  id: string;
  title: string;
  color: string;
  content: string;
}

export interface AnalysisData {
  simulated_key?: string;
  simulated_tempo?: number;
  mood?: string;
}

export interface Improvisation {
  id: string;
  user_id?: string;
  file_name: string | null;
  storage_path: string | null;
  status: 'uploaded' | 'analyzing' | 'completed' | 'failed';
  generated_name: string | null;
  artwork_url: string | null;
  artwork_prompt: string | null;
  is_piano: boolean | null;
  is_improvisation: boolean | null;
  primary_genre: string | null;
  secondary_genre: string | null;
  analysis_data: AnalysisData | Record<string, string | number | undefined> | null;
  notes: NoteTab[] | null;
  created_at: string;
  is_ready_for_release: boolean | null;
  user_tags: string[] | null;
  is_instrumental: boolean | null;
  is_original_song: boolean | null;
  has_explicit_lyrics: boolean | null;
  is_metadata_confirmed: boolean | null;
  insight_content_type: string | null;
  insight_language: string | null;
  insight_primary_use: string | null;
  insight_audience_level: string | null;
  insight_audience_age: string[] | null;
  insight_benefits: string[] | null;
  insight_practices: string | null;
  insight_themes: string[] | null;
  insight_voice: string | null;
  description: string | null;
  is_submitted_to_distrokid: boolean | null;
  is_submitted_to_insight_timer: boolean | null;
}
