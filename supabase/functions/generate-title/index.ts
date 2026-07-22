// @ts-expect-error - Deno
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
// @ts-expect-error - Deno
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Max-Age': '86400',
}

async function generateTitleWithGemini(improvisationData: any): Promise<string> {
    // @ts-expect-error - Deno
    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    if (!GEMINI_API_KEY) {
        console.error("GEMINI_API_KEY is not set.");
        return "AI Title Generation Failed (Key Missing)";
    }

    const notesContent = improvisationData.notes?.map((n: any) => `${n.title}: ${n.content}`).join('; ') || 'No creative notes provided.';
    const tags = improvisationData.user_tags?.join(', ') || 'No user tags.';
    const analysis = improvisationData.analysis_data || {};

    const prompt = `You are an expert music analyst and poet. Based on the following analysis and creative notes, generate a single, evocative, abstract, and unique title for this music piece.

    Improvisation Data:
    - Primary Genre: ${improvisationData.primary_genre || 'Unknown'}
    - Secondary Genre: ${improvisationData.secondary_genre || 'Unknown'}
    - Mood: ${analysis.mood || 'Neutral'}
    - Tempo: ${analysis.simulated_tempo || 'Moderate'} BPM
    - Creative Notes: ${notesContent}
    - User Tags: ${tags}

    The title should be suitable for a music release, focusing on imagery, emotion, or abstract concepts.

    Respond ONLY with the title, nothing else.`;

    const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': GEMINI_API_KEY,
            },
            body: JSON.stringify({
                contents: [{ role: "user", parts: [{ text: prompt }] }],
                generationConfig: {
                    temperature: 0.9,
                }
            }),
        });

        if (!response.ok) {
            const errorBody = await response.json();
            console.error("Gemini API Error:", errorBody);
            return `AI Title Generation Failed (HTTP ${response.status})`;
        }

        const data = await response.json();
        const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "Untitled AI Piece";

        return generatedText.replace(/^["']|["']$/g, '');

    } catch (error) {
        console.error("Error calling Gemini API:", error);
        return "AI Title Generation Failed (Network Error)";
    }
}


serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Missing authorization header');

    const supabase = createClient(
      // @ts-expect-error - Deno
      Deno.env.get('SUPABASE_URL') ?? '',
      // @ts-expect-error - Deno
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) throw new Error('Unauthorized');

    const { improvisationId } = await req.json();

    if (!improvisationId) {
      return new Response(JSON.stringify({ error: 'Missing improvisationId' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: imp, error: fetchError } = await supabase
        .from('improvisations')
        .select('*, notes, user_tags, analysis_data, user_id')
        .eq('id', improvisationId)
        .single();

    if (fetchError || !imp) {
        console.error('Failed to fetch improvisation data:', fetchError);
        return new Response(JSON.stringify({ error: 'Improvisation not found' }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    if (imp.user_id !== user.id) {
        throw new Error('Unauthorized');
    }

    const generatedTitle = await generateTitleWithGemini(imp);

    return new Response(JSON.stringify({ success: true, title: generatedTitle }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Edge Function error:', error);
    const status = error.message === 'Unauthorized' || error.message === 'Missing authorization header' ? 401 : 500;
    return new Response(JSON.stringify({ error: error.message }), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
})
