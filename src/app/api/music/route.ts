import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient();
    const { searchParams } = new URL(request.url);
    
    // Query params
    const category = searchParams.get('category'); // compositions | arrangements | theatre | wip | all
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = parseInt(searchParams.get('offset') || '0');
    const search = searchParams.get('search');
    const tags = searchParams.get('tags')?.split(',').filter(Boolean);
    
    let query = supabase
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
        storage_path,
        nas_folder_path,
        video_path,
        insight_themes,
        insight_benefits,
        insight_practices,
        is_piano,
        is_original_song
      `)
      .eq('status', 'completed')
      .eq('is_ready_for_release', true)
      .order('session_date', { ascending: false, nullsLast: true })
      .range(offset, offset + limit - 1);
    
    // Category filtering
    if (category && category !== 'all') {
      const categoryMap: Record<string, string[]> = {
        compositions: ['Original', 'Piano', 'Ambient', 'Neoclassical'],
        arrangements: ['Arrangement', 'Cover', 'Orchestral'],
        theatre: ['Theatre', 'Music Direction', 'Production'],
        wip: ['Sketch', 'Experiment', 'Work in Progress'],
      };
      const genres = categoryMap[category];
      if (genres) {
        query = query.or(genres.map(g => `primary_genre.ilike.%${g}%`).join(','));
      }
    }
    
    // Search
    if (search) {
      query = query.or(
        `generated_name.ilike.%${search}%,description.ilike.%${search}%,user_tags.cs.{${search}}`
      );
    }
    
    // Tags filter
    if (tags && tags.length > 0) {
      query = query.contains('user_tags', tags);
    }
    
    const { data, error, count } = await query;
    
    if (error) throw error;
    
    // Transform for frontend
    const items = data?.map(item => ({
      id: item.id,
      title: item.generated_name,
      originalTitle: item.original_name,
      date: item.session_date || item.created_at?.slice(0, 10),
      category: categorizeItem(item),
      genre: item.primary_genre,
      subGenre: item.secondary_genre,
      artwork: item.artwork_url,
      artworkPrompt: item.artwork_prompt,
      description: item.description,
      tags: item.user_tags || [],
      isImprovisation: item.is_improvisation,
      isOriginal: item.is_original_song,
      hasAudio: !!item.storage_path,
      hasVideo: !!item.video_path,
      hasScore: !!item.nas_folder_path,
      themes: item.insight_themes || [],
      benefits: item.insight_benefits || [],
      practices: item.insight_practices,
      isPiano: item.is_piano,
      isOriginalSong: item.is_original_song,
      analysis: item.analysis_data,
    })) || [];
    
    return NextResponse.json({
      items,
      total: count,
      limit,
      offset,
    });
  } catch (error) {
    console.error('Music API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch music' },
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