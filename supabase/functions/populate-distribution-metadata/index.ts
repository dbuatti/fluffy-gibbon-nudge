// @ts-ignore
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
// @ts-ignore
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Function to call Gemini API for intelligent field population
async function populateFieldsWithGemini(compositionData: any): Promise<any> {
    // @ts-ignore
    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    if (!GEMINI_API_KEY) {
        console.error("GEMINI_API_KEY is not set.");
        return { error: "AI Key Missing" };
    }

    const notesContent = compositionData.notes?.map((n: any) => `${n.title}: ${n.content}`).join('; ') || 'No creative notes provided.';
    const tags = compositionData.user_tags?.join(', ') || 'No user tags.';
    const analysis = compositionData.analysis_data || {};

    // Define the lists the AI must choose from (simplified for prompt)
    const benefitsList = "Clarity of Mind, Focus, Relax, Self-Confidence, Managing Stress, Dealing with Anxiety, Emotional Healing, Gratitude, Love, Sleep, Yoga Nidra, Kids Meditation, etc.";
    const practicesList = "Body Scan, Concentration Meditation, Mantra Meditation, Mindfulness Meditation, Walking meditation, Sound Meditation, Guided imagery or Visualization, etc.";
    const themesList = "Religion, Secular, Nature, Spirituality, Neuroscience, Psychology, etc.";

    const prompt = `You are an expert in wellness and meditation content categorization. Based on the user's input for this music track, select the best fit for the following Insight Timer fields.
    
    Composition Data:
    - Title: "${compositionData.generated_name || 'Untitled'}"
    - Primary Genre: ${compositionData.primary_genre || 'Ambient'}
    - Secondary Genre: ${compositionData.secondary_genre || 'New Age'}
    - Mood: ${analysis.mood || 'Calm'}
    - Tempo: ${analysis.simulated_tempo || 'Moderate'} BPM
    - Creative Notes: ${notesContent}
    - User Tags: ${tags}
    
    Instructions:
    1. Select up to 3 Benefits from the list (e.g., ["Relax", "Focus"]).
    2. Select exactly 1 Practice from the list (e.g., "Sound Meditation").
    3. Select up to 3 Themes from the list (e.g., ["Nature", "Spirituality"]).
    
    Respond ONLY with a JSON object containing the keys "insight_benefits", "insight_practices", and "insight_themes". Ensure all selected values are valid strings from the general categories provided.`;

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
                    temperature: 0.7,
                }
            }),
        });

        if (!response.ok) {
            const errorBody = await response.json();
            console.error("Gemini API Error:", errorBody);
            return { error: `AI Generation Failed (HTTP ${response.status})` };
        }

        const data = await response.json();
        let generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        
        if (generatedText) {
            generatedText = generatedText.replace(/^```json\s*|```\s*$/g, '').trim();
            try {
                const result = JSON.parse(generatedText);
                return result;
            } catch (e) {
                console.error("Failed to parse Gemini JSON:", e);
            }
        }
        return { error: "AI Parsing Failed" };

    } catch (error) {
        console.error("Error calling Gemini API:", error);
        return { error: "AI Network Error" };
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

    // 1. Fetch the full record including notes, tags, and analysis data
    const { data: imp, error: fetchError } = await supabase
        .from('improvisations')
        .select('*, notes, user_tags, analysis_data')
        .eq('id', improvisationId)
        .single();

    if (fetchError || !imp) {
        console.error('Failed to fetch improvisation data:', fetchError);
        return new Response(JSON.stringify({ error: 'Improvisation not found or access denied.' }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    // 2. Populate fields using AI
    const aiResults = await populateFieldsWithGemini(imp);

    if (aiResults.error) {
        return new Response(JSON.stringify({ error: aiResults.error }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    // 3. Update the database with AI-generated fields
    const updates = {
        insight_benefits: aiResults.insight_benefits || [],
        insight_practices: aiResults.insight_practices || null,
        insight_themes: aiResults.insight_themes || [],
    };

    const { error: updateError } = await supabase
      .from('improvisations')
      .update(updates)
      .eq('id', improvisationId);

    if (updateError) {
      console.error('Database update failed:', updateError);
      return new Response(JSON.stringify({ error: 'Failed to update database with AI metadata' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true, updates }), {
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