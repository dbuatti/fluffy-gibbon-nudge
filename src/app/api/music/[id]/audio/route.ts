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
      .select('storage_path')
      .eq('id', id)
      .eq('status', 'completed')
      .eq('is_ready_for_release', true)
      .single();
    
    if (error || !data?.storage_path) {
      return NextResponse.json({ error: 'Audio not found' }, { status: 404 });
    }
    
    // Proxy the audio from Supabase Storage with proper headers
    const storageUrl = `https://rqesjpnhrjdjnrzdhzgw.supabase.co/storage/v1/object/public/piano_improvisations/${data.storage_path}`;
    
    // Fetch with range support for seeking
    const range = request.headers.get('range');
    const headers: Record<string, string> = {
      'Content-Type': 'audio/mpeg',
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=3600',
    };
    
    const fetchOptions: RequestInit = {
      headers: {
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    };
    
    if (range) {
      fetchOptions.headers = {
        ...fetchOptions.headers,
        'Range': range,
      };
    }
    
    const response = await fetch(storageUrl, fetchOptions);
    
    if (!response.ok) {
      return NextResponse.json({ error: 'Failed to fetch audio' }, { status: response.status });
    }
    
    // Forward relevant headers
    const contentLength = response.headers.get('content-length');
    const contentRange = response.headers.get('content-range');
    const contentType = response.headers.get('content-type') || 'audio/mpeg';
    
    if (contentLength) headers['Content-Length'] = contentLength;
    if (contentRange) headers['Content-Range'] = contentRange;
    headers['Content-Type'] = contentType;
    
    const status = response.status === 206 ? 206 : 200;
    
    return new NextResponse(response.body, {
      status,
      headers,
    });
  } catch (error) {
    console.error('Audio streaming error:', error);
    return NextResponse.json({ error: 'Failed to stream audio' }, { status: 500 });
  }
}