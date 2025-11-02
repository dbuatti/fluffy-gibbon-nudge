// @ts-ignore
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
// @ts-ignore
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Function to call Gemini API for description generation
async function generateDescriptionWithGemini(compositionData: any): Promise<string> {
    // @ts-ignore
    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    if (!GEMINI_API_KEY) {
        console.error("GEMINI_API_KEY is not set.");
        return "AI Description Generation Failed (Key Missing)";
    }

    const notesContent = compositionData.notes?.map((n: any) => `${n.title}: ${n.content}`).join('; ') || 'No creative notes provided.';
    const tags = compositionData.user_tags?.join(', ') || 'No user tags.';
    const analysis = compositionData.analysis_data || {};
    
    // New Insight Timer fields extraction
    const contentType = compositionData.insight_content_type || 'Music';
    const primaryUse = compositionData.insight_primary_use || 'Relaxation';
    const audienceLevel = compositionData.insight_audience_level || 'Everyone';
    const benefits = compositionData.insight_benefits?.join(', ') || 'General wellness';
    const practices = compositionData.insight_practices || 'Sound Meditation';
    const themes = compositionData.insight_themes?.join(', ') || 'Secular Mindfulness';
    const voice = compositionData.insight_voice || 'None (Instrumental)';


    const prompt = `You are an expert copywriter for wellness and meditation platforms like Insight Timer. Your task is to write a compelling, compliant description for a music track.
    
    Compliance Rules:
    1. The description must be 3 to 5 sentences long.
    2. DO NOT include any promotional content, links, or mentions of other websites/platforms (e.g., Spotify, DistroKid, social media).
    3. Focus on the mood, feeling, and intended use (meditation, relaxation, focus).
    
    Composition Data:
    - Title: "${compositionData.generated_name}"
    - Primary Genre: ${compositionData.primary_genre}
    - Mood: ${analysis.mood || 'Calm'}
    - Tempo: ${analysis.simulated_tempo || 'Moderate'} BPM
    
    Insight Timer Categorization:
    - Content Type: ${contentType}
    - Primary Use: ${primaryUse}
    - Audience Level: ${audienceLevel}
    - Benefits: ${benefits}
    - Practices: ${practices}
    - Themes: ${themes}
    - Voice: ${voice}
    
    Creative Input:
    - User Notes (Creative Intent): ${notesContent}
    - User Tags: ${tags}
    
    Generate ONLY the description text, formatted as a single paragraph.`;

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
                    temperature: 0.8,
                }
            }),
        });

        if (!response.ok) {
            const errorBody = await response.json();
            console.error("Gemini API Error:", errorBody);
            return `AI Description Generation Failed (HTTP ${response.status})`;
        }

        const data = await response.json();
        const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "A beautiful piece for deep relaxation.";
        
        return generatedText.replace(/^["']|["']$/g, '');

    } catch (error) {
        console.error("Error calling Gemini API:", error);
        return "AI Description Generation Failed (Network Error)";
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

    const { improvisationId } = await req.json();

    if (!improvisationId) {
      return new Response(JSON.stringify({ error: 'Missing improvisationId' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch the full record using the Service Role Key
    const { data: imp, error: fetchError } = await supabase
        .from('improvisations')
        .select('*')
        .eq('id', improvisationId)
        .single();

    if (fetchError || !imp) {
        console.error('Failed to fetch improvisation data:', fetchError);
        return new Response(JSON.stringify({ error: 'Improvisation not found or access denied.' }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    // Generate the description
    const generatedDescription = await generateDescriptionWithGemini(imp);

    return new Response(JSON.stringify({ success: true, description: generatedDescription }), {
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