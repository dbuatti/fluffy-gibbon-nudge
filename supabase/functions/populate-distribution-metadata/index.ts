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

const INSIGHT_CONTENT_TYPES = ["Guided meditation", "Music", "Talk"];
const INSIGHT_LANGUAGES = ["English", "BR. Português", "Deutsch", "Italiano", "Français", "Español", "Nederlands", "Pусский", "Polski", "Svenska", "Norsk", "Dansk", "Suomi", "Türkçe", "العربية", "עברית", "हिन्दी", "中文", "日本語", "한국어"];
const INSIGHT_PRIMARY_USES = ["Meditation", "Yoga", "Tai Chi", "Walking", "Breathing / Pranayama", "Chanting", "Prayer", "Healing", "Dance", "Recreation", "Educational / Informative", "Sleep", "Focus", "Relaxation", "Movement", "Study", "Sound Bath"];
const INSIGHT_AUDIENCE_LEVELS = ["Everyone", "Complete beginners", "Some prior experience necessary (2 months or more)", "Extensive experience necessary (12 months +)"];
const INSIGHT_VOICES = ["Masculine", "Feminine", "None (Instrumental)"];

async function populateFieldsWithGemini(improvisationData: any): Promise<any> {
    // @ts-expect-error - Deno
    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    if (!GEMINI_API_KEY) {
        console.error("GEMINI_API_KEY is not set.");
        return { error: "AI service not configured" };
    }

    const notesContent = improvisationData.notes?.map((n: any) => `${n.title}: ${n.content}`).join('; ') || '';
    const tags = improvisationData.user_tags?.join(', ') || '';
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
            return { error: `AI generation failed (HTTP ${response.status})` };
        }

        const data = await response.json();
        let generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

        if (generatedText) {
            generatedText = generatedText.replace(/^```json\s*|```\s*$/g, '').trim();
            try {
                const result = JSON.parse(generatedText);
                if (result.insight_content_type && result.insight_language) {
                    return result;
                }
                return { error: "AI returned incomplete metadata" };
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

    const aiResults = await populateFieldsWithGemini(imp);

    if (aiResults.error) {
        return new Response(JSON.stringify({ error: aiResults.error }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    const updates: Record<string, unknown> = {};
    if (aiResults.insight_content_type) updates.insight_content_type = aiResults.insight_content_type;
    if (aiResults.insight_language) updates.insight_language = aiResults.insight_language;
    if (aiResults.insight_primary_use) updates.insight_primary_use = aiResults.insight_primary_use;
    if (aiResults.insight_audience_level) updates.insight_audience_level = aiResults.insight_audience_level;
    if (aiResults.insight_voice) updates.insight_voice = aiResults.insight_voice;
    if (aiResults.insight_benefits) updates.insight_benefits = aiResults.insight_benefits;
    if (aiResults.insight_practices) updates.insight_practices = aiResults.insight_practices;
    if (aiResults.insight_themes) updates.insight_themes = aiResults.insight_themes;
    if (aiResults.description) updates.description = aiResults.description;

    if (Object.keys(updates).length === 0) {
        return new Response(JSON.stringify({ error: 'AI did not return any valid metadata' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

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

    return new Response(JSON.stringify({ success: true, description: aiResults.description || '', updates }), {
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
