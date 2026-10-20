import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createClient();
    const { id } = await params;
    
    const { data, error } = await supabase
      .from('improvisations')
      .select(`
        id,
        generated_name,
        original_name,
        session_date,
        created_at,
        status,
        primary_genre,
        secondary_genre,
        analysis_data,
        artwork_url,
        artwork_prompt,
        description,
        user_tags,
        is_improvisation,
        is_original_song,
        is_piano,
        is_instrumental,
        storage_path,
        nas_folder_path,
        video_path,
        insight_themes,
        insight_benefits,
        insight_practices,
        insight_voice,
        insight_content_type,
        insight_language,
        insight_primary_use,
        insight_audience_level,
        insight_audience_age,
        is_submitted_to_distrokid,
        is_submitted_to_insight_timer,
        is_metadata_confirmed,
        is_ready_for_release
      `)
      .eq('id', id)
      .eq('status', 'completed')
      .eq('is_ready_for_release', true)
      .single();
    
    if (error || !data) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    
    const item = data;
    
    // Generate public URLs for storage paths
    const audioUrl = item.storage_path 
      ? `https://rqesjpnhrjdjnrzdhzgw.supabase.co/storage/v1/object/public/piano_improvisations/${item.storage_path}`
      : null;
      
    const videoUrl = item.video_path
      ? `https://rqesjpnhrjdjnrzdhzgw.supabase.co/storage/v1/object/public/piano_improvisations/${item.video_path}`
      : null;
    
    // Categorize
    const category = categorizeItem(data);
    
    return NextResponse.json({
      id: item.id,
      title: item.generated_name,
      originalTitle: item.original_name,
      date: item.session_date || item.created_at?.slice(0, 10),
      category: categorizeItem(data),
      genre: item.primary_genre,
      subGenre: item.secondary_genre,
      artwork: item.artwork_url,
      artworkPrompt: item.artwork_prompt,
      description: item.description,
      tags: item.user_tags || [],
      isImprovisation: item.is_improvisation,
      isOriginal: item.is_original_song,
      isPiano: item.is_piano,
      hasAudio: !!item.storage_path,
      hasVideo: !!item.video_path,
      hasScore: !!item.nas_folder_path,
      audioUrl,
      videoUrl,
      themes: item.insight_themes || [],
      benefits: item.insight_benefits || [],
      practices: item.insight_practices,
      voice: item.insight_voice,
      analysis: item.analysis_data,
      isOriginalSong: item.is_original_song,
      isPiano: item.is_piano,
      isInstrumental: item.is_instrumental,
    });
  } catch (error) {
    console.error('Music item API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch music item' },
      { status: 500 }
    );
  }
}

function categorizeItem(item: any): string {
  const genre = (item.primary_genre || '').toLowerCase();
  const tags = (item.user_tags || []).map((t: string) => t.toLowerCase());
  const desc = (item.description || '').toLowerCase();
  
  if (tags.some(t => t.includes('theatre') || t.includes('musical') || t.includes('production')) ||
      genre.includes('theatre') || genre.includes('music direction')) {
    return 'theatre';
  }
  if (tags.some(t => t.includes('arrangement') || t.includes('cover') || t.includes('orchestral')) ||
      genre.includes('arrangement')) {
    return 'arrangements';
  }
  if (tags.some(t => t.includes('sketch') || t.includes('experiment') || t.includes('wip')) ||
      desc.includes('work in progress') || desc.includes('experiment')) {
    return 'wip';
  }
  return 'compositions';
}