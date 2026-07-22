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

async function triggerArtworkGeneration(supabaseClient: any, improvisationId: string, generatedName: string, primaryGenre: string, secondaryGenre: string, mood: string) {
    console.log(`Invoking generate-artwork for ID: ${improvisationId}`);
    const { data, error } = await supabaseClient.functions.invoke('generate-artwork', {
        body: {
            improvisationId,
            generatedName,
            primaryGenre,
            secondaryGenre,
            mood,
        },
    });

    if (error) {
        console.error('Error invoking generate-artwork:', error);
    } else {
        console.log('Artwork generation triggered successfully:', data);
    }
}

async function generateNameWithGemini(fileName: string): Promise<string> {
    // @ts-expect-error - Deno
    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    if (!GEMINI_API_KEY) {
        console.error("GEMINI_API_KEY is not set.");
        return fileName.replace(/\.[^/.]+$/, "").trim() || "Untitled AI Piece";
    }

    const prompt = `You are an expert music poet. Based on the file name "${fileName}", generate a single, evocative, and unique title for the piece.

    Respond ONLY with the title, nothing else. The title should be suitable for a music release.`;

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
            return fileName.replace(/\.[^/.]+$/, "").trim() || `AI Name Generation Failed (HTTP ${response.status})`;
        }

        const data = await response.json();
        const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || fileName.replace(/\.[^/.]+$/, "").trim() || "Untitled AI Piece";

        return generatedText.replace(/^["']|["']$/g, '');

    } catch (error) {
        console.error("Error calling Gemini API:", error);
        return fileName.replace(/\.[^/.]+$/, "").trim() || "AI Name Generation Failed (Network Error)";
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

    const { improvisationId, storagePath, fileName, isImprovisation } = await req.json();

    if (!improvisationId || !storagePath || !fileName) {
      console.error('Missing required parameters:', { improvisationId, storagePath, fileName });
      return new Response(JSON.stringify({ error: 'Missing required parameters' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Starting file processing for ID: ${improvisationId} at path: ${storagePath}.`);

    const { data: imp, error: fetchError } = await supabase
        .from('improvisations')
        .select('generated_name, primary_genre, secondary_genre, analysis_data, is_improvisation, user_id')
        .eq('id', improvisationId)
        .single();

    if (fetchError || !imp) {
        console.error(`Failed to fetch improvisation data for ID: ${improvisationId}:`, fetchError);
        throw new Error('Failed to fetch improvisation data.');
    }

    if (imp.user_id !== user.id) {
        throw new Error('Unauthorized: you do not own this improvisation');
    }

    let generatedName = imp.generated_name;
    const isDefaultOrEmpty = !generatedName || generatedName === 'Untitled' || generatedName === fileName?.replace(/\.[^/.]+$/, "").trim();
    if (isDefaultOrEmpty) {
        console.log(`Generating AI name for improvisationId: ${improvisationId} from fileName: ${fileName}`);
        generatedName = await generateNameWithGemini(fileName);
        console.log(`Generated AI name: ${generatedName}`);
    } else {
        console.log(`Using existing generated_name: ${generatedName} for improvisationId: ${improvisationId}`);
    }

    const { error: updateError } = await supabase
      .from('improvisations')
      .update({
        status: 'completed',
        generated_name: generatedName,
      })
      .eq('id', improvisationId);

    if (updateError) {
      console.error(`Database update failed:`, updateError);
      return new Response(JSON.stringify({ error: 'Failed to update database' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`File processing completed for ID: ${improvisationId}. Name: ${generatedName}.`);

    const currentMood = imp.analysis_data?.mood || 'Ambient';
    triggerArtworkGeneration(supabase, improvisationId, generatedName, imp.primary_genre || 'Ambient', imp.secondary_genre || 'Ambient', currentMood);

    return new Response(JSON.stringify({ success: true, generatedName }), {
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
