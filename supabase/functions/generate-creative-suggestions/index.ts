// @ts-ignore
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
// @ts-ignore
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Function to call Gemini API for creative suggestions
async function generateSuggestionsWithGemini(compositionData: any): Promise<string[]> {
    // @ts-ignore
    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    if (!GEMINI_API_KEY) {
        console.error("GEMINI_API_KEY is not set.");
        return ["AI Key Missing"];
    }

    const notesContent = compositionData.notes?.map((n: any) => `${n.title}: ${n.content}`).join('; ') || 'No creative notes provided.';
    const tags = compositionData.user_tags?.join(', ') || 'No user tags.';
    const analysis = compositionData.analysis_data || {};

    const prompt = `You are an expert music producer and creative coach. Based on the following composition data, generate exactly three distinct, actionable, and inspiring suggestions for the user to develop this musical idea further. Focus on structure, instrumentation, mood, or arrangement.
    
    Composition Data:
    - Title: "${compositionData.generated_name || 'Untitled'}"
    - Primary Genre: ${compositionData.primary_genre || 'Ambient'}
    - Mood: ${analysis.mood || 'Calm'}
    - Tempo: ${analysis.simulated_tempo || 'Moderate'} BPM
    - Creative Notes: ${notesContent}
    - User Tags: ${tags}
    
    Instructions for Output:
    1. Provide exactly three suggestions.
    2. Each suggestion must be a concise, single sentence.
    3. Respond ONLY with a JSON array of strings, like: ["Suggestion 1.", "Suggestion 2.", "Suggestion 3."].`;

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
            return [`AI Generation Failed (HTTP ${response.status})`];
        }

        const data = await response.json();
        let generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        
        if (generatedText) {
            generatedText = generatedText.replace(/^```json\s*|```\s*$/g, '').trim();
            try {
                const result = JSON.parse(generatedText);
                if (Array.isArray(result) && result.length === 3) {
                    return result as string[];
                }
            } catch (e) {
                console.error("Failed to parse Gemini JSON:", e);
            }
        }
        return ["AI Parsing Failed. Try again."];

    } catch (error) {
        console.error("Error calling Gemini API:", error);
        return ["AI Network Error."];
    }
}


serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // @ts-ignore
    const supabase = createClient(
      // @ts-ignore
      Deno.env.get('SUPABASE_URL') ?? '',
      // @ts-ignore
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '' // Use Service Role Key for secure data fetching
    );

    const { compositionId } = await req.json(); // Updated parameter name

    if (!compositionId) {
      return new Response(JSON.stringify({ error: 'Missing compositionId' }), { // Updated parameter name
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch the full record using the Service Role Key
    const { data: comp, error: fetchError } = await supabase // Renamed variable
        .from('compositions') // Updated table name
        .select('*, notes, user_tags, analysis_data')
        .eq('id', compositionId) // Updated parameter name
        .single();

    if (fetchError || !comp) { // Updated variable
        console.error('Failed to fetch composition data:', fetchError);
        return new Response(JSON.stringify({ error: 'Composition not found or access denied.' }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    // Generate the suggestions
    const suggestions = await generateSuggestionsWithGemini(comp); // Updated variable

    return new Response(JSON.stringify({ success: true, suggestions }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Edge Function error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
})