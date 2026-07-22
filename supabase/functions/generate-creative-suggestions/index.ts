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

async function generateSuggestionsWithGemini(improvisationData: any): Promise<{ suggestions?: string[]; error?: string }> {
    // @ts-expect-error - Deno
    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    if (!GEMINI_API_KEY) {
        console.error("GEMINI_API_KEY is not set.");
        return { error: "AI service not configured" };
    }

    const notesContent = improvisationData.notes?.map((n: any) => `${n.title}: ${n.content}`).join('; ') || 'No creative notes provided.';
    const tags = improvisationData.user_tags?.join(', ') || 'No user tags.';
    const analysis = improvisationData.analysis_data || {};

    const prompt = `You are an expert music producer and creative coach. Based on the following improvisation data, generate exactly three distinct, actionable, and inspiring suggestions for the user to develop this musical idea further. Focus on structure, instrumentation, mood, or arrangement.

    Improvisation Data:
    - Title: "${improvisationData.generated_name || 'Untitled'}"
    - Primary Genre: ${improvisationData.primary_genre || 'Ambient'}
    - Mood: ${analysis.mood || 'Calm'}
    - Tempo: ${analysis.simulated_tempo || 'Moderate'} BPM
    - Creative Notes: ${notesContent}
    - User Tags: ${tags}

    Instructions for Output:
    1. Provide exactly three suggestions.
    2. Each suggestion must be a concise, single sentence.
    3. Respond ONLY with a JSON array of strings, like: ["Suggestion 1.", "Suggestion 2.", "Suggestion 3."].`;

    const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent';

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
            return { error: `AI generation failed (HTTP ${response.status})` };
        }

        const data = await response.json();
        let generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

        if (generatedText) {
            generatedText = generatedText.replace(/^```json\s*|```\s*$/g, '').trim();
            try {
                const result = JSON.parse(generatedText);
                if (Array.isArray(result) && result.length >= 1 && result.length <= 5) {
                    return { suggestions: result as string[] };
                }
                return { error: "AI returned an unexpected format" };
            } catch (e) {
                console.error("Failed to parse Gemini JSON:", e);
            }
        }
        return { error: "AI returned an empty response" };

    } catch (error) {
        console.error("Error calling Gemini API:", error);
        return { error: "AI service unavailable" };
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

    const result = await generateSuggestionsWithGemini(imp);

    if (result.error) {
        return new Response(JSON.stringify(result), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    return new Response(JSON.stringify({ success: true, suggestions: result.suggestions }), {
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
