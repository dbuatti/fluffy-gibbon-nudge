// @ts-ignore
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
// @ts-ignore
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Define constants for AI guidance (copied from client-side constants)
const INSIGHT_CONTENT_TYPES = ["Guided meditation", "Music", "Talk"];
const INSIGHT_LANGUAGES = ["English", "BR. Português", "Deutsch", "Italiano", "Français", "Español", "Nederlands", "Pусский", "Polski", "Svenska", "Norsk", "Dansk", "Suomi", "Türkçe", "العربية", "עברית", "हिन्दी", "中文", "日本語", "한국어"];
const INSIGHT_PRIMARY_USES = ["Meditation", "Yoga", "Tai Chi", "Walking", "Breathing / Pranayama", "Chanting", "Prayer", "Healing", "Dance", "Recreation", "Educational / Informative", "Sleep", "Focus", "Relaxation", "Movement", "Study", "Sound Bath"];
const INSIGHT_AUDIENCE_LEVELS = ["Everyone", "Complete beginners", "Some prior experience necessary (2 months or more)", "Extensive experience necessary (12 months +)"];
const INSIGHT_VOICES = ["Masculine", "Feminine", "None (Instrumental)"]; // Added None (Instrumental) for music tracks

// Function to call Gemini API for intelligent field population and description
async function populateFieldsWithGemini(improvisationData: any): Promise<any> {
    // @ts-ignore
    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    if (!GEMINI_API_KEY) {
        console.error("GEMINI_API_KEY is not set.");
        return { error: "AI Key Missing" };
    }

    const notesContent = improvisationData.notes?.map((n: any) => `${n.title}: ${n.content}`).join('; ') || 'No creative notes provided.';
    const tags = improvisationData.user_tags?.join(', ') || 'No user tags.';
    const analysis = improvisationData.analysis_data || {};

    const prompt = `You are an expert in wellness and meditation content categorization and copywriting for platforms like Insight Timer. Based on the user's input for this music track, select the best fit for the required metadata fields and generate a compliant description.
    
    Improvisation Data:
    - Title: "${improvisationData.generated_name || 'Untitled'}"
    - Primary Genre: ${improvisationData.primary_genre || 'Ambient'}
    - Mood: ${analysis.mood || 'Calm'}
    - Creative Notes: ${notesContent}
    - User Tags: ${tags}
    
    Instructions for Metadata Selection:
    1. Content Type: Select one from: ${INSIGHT_CONTENT_TYPES.join(', ')}.
    2. Language: Select one from: ${INSIGHT_LANGUAGES.join(', ')}. Default to "English" if unsure.
    3. Primary Use: Select one from: ${INSIGHT_PRIMARY_USES.join(', ')}.
    4. Audience Level: Select one from: ${INSIGHT_AUDIENCE_LEVELS.join(', ')}.
    5. Voice: Select one from: ${INSIGHT_VOICES.join(', ')}. If the track is instrumental, select "None (Instrumental)".
    6. Benefits: Select up to 3 relevant benefits (e.g., ["Relax", "Focus"]).
    7. Practices: Select exactly 1 practice (e.g., "Sound Meditation").
    8. Themes: Select up to 3 relevant themes (e.g., ["Nature", "Spirituality"]).
    
    Respond ONLY with a single JSON object containing the following keys: "insight_content_type", "insight_language", "insight_primary_use", "insight_audience_level", "insight_voice", "insight_benefits" (array), "insight_practices" (string), "insight_themes" (array), and "description" (string).`;

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

    const { improvisationId } = await req.json(); // Updated parameter name

    if (!improvisationId) {
      return new Response(JSON.stringify({ error: 'Missing improvisationId' }), { // Updated parameter name
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 1. Fetch the full record including notes, tags, and analysis data
    const { data: imp, error: fetchError } = await supabase // Renamed variable
        .from('improvisations') // Updated table name
        .select('*, notes, user_tags, analysis_data')
        .eq('id', improvisationId) // Updated parameter name
        .single();

    if (fetchError || !imp) { // Updated variable
        console.error('Failed to fetch improvisation data:', fetchError);
        return new Response(JSON.stringify({ error: 'Improvisation not found or access denied.' }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    // 2. Populate fields using AI
    const aiResults = await populateFieldsWithGemini(imp); // Updated variable

    if (aiResults.error) {
        return new Response(JSON.stringify({ error: aiResults.error }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
    
    // Extract description before updating the DB
    const description = aiResults.description || "AI failed to generate a description.";
    
    // 3. Prepare updates for the database (including the new 'description' field)
    const updates = {
        insight_content_type: aiResults.insight_content_type || null,
        insight_language: aiResults.insight_language || null,
        insight_primary_use: aiResults.insight_primary_use || null,
        insight_audience_level: aiResults.insight_audience_level || null,
        insight_voice: aiResults.insight_voice || null,
        insight_benefits: aiResults.insight_benefits || [],
        insight_practices: aiResults.insight_practices || null,
        insight_themes: aiResults.insight_themes || [],
        description: description, // NEW: Save the generated description
    };

    const { error: updateError } = await supabase
      .from('improvisations') // Updated table name
      .update(updates)
      .eq('id', improvisationId); // Updated parameter name

    if (updateError) {
      console.error('Database update failed:', updateError);
      return new Response(JSON.stringify({ error: 'Failed to update database with AI metadata' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 4. Return the description and success status to the client
    return new Response(JSON.stringify({ success: true, description, updates }), {
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