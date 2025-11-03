// @ts-ignore
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
// @ts-ignore
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Function to invoke the artwork generation function
async function triggerArtworkGeneration(supabaseClient: any, compositionId: string, generatedName: string, primaryGenre: string, secondaryGenre: string, mood: string) { // Updated parameter name
    console.log(`Invoking generate-artwork for ID: ${compositionId}`); // Updated parameter name
    
    // NOTE: We pass the current (potentially user-set) metadata to the artwork generator.
    const { data, error } = await supabaseClient.functions.invoke('generate-artwork', {
        body: {
            compositionId: compositionId, // Updated parameter name
            generatedName: generatedName,
            primaryGenre: primaryGenre,
            secondaryGenre: secondaryGenre,
            mood: mood,
        },
    });

    if (error) {
        console.error('Error invoking generate-artwork:', error);
    } else {
        console.log('Artwork generation triggered successfully:', data);
    }
}

// Function to call Gemini API for name generation (now based on file name/user input)
async function generateNameWithGemini(fileName: string): Promise<string> {
    // @ts-ignore
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
        
        // Clean up potential quotes or extra formatting from the AI response
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
    // @ts-ignore
    const supabase = createClient(
      // @ts-ignore
      Deno.env.get('SUPABASE_URL') ?? '',
      // @ts-ignore
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { compositionId, storagePath, fileName } = await req.json(); // Updated parameter name

    if (!compositionId || !storagePath || !fileName) {
      return new Response(JSON.stringify({ error: 'Missing required parameters' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Starting file processing for ID: ${compositionId} at path: ${storagePath}.`); // Updated parameter name

    // 1. Fetch existing record to get current metadata (like is_improvisation, genres, etc.)
    const { data: comp, error: fetchError } = await supabase // Renamed variable
        .from('compositions') // Updated table name
        .select('generated_name, primary_genre, secondary_genre, analysis_data, is_improvisation')
        .eq('id', compositionId) // Updated parameter name
        .single();

    if (fetchError || !comp) { // Updated variable
        console.error('Failed to fetch composition data:', fetchError);
        throw new Error('Failed to fetch composition data.');
    }

    // 2. Generate Name (if not already set by user during quick capture)
    let generatedName = comp.generated_name; // Updated variable
    if (!generatedName || generatedName.includes('Quick Capture')) {
        generatedName = await generateNameWithGemini(fileName);
    }
    
    // 3. Update the database record with the generated name and set status to completed
    // NOTE: We are NOT setting analysis_data, genres, or is_piano here.
    const { error: updateError } = await supabase
      .from('compositions') // Updated table name
      .update({ 
        status: 'completed', 
        generated_name: generatedName,
      })
      .eq('id', compositionId); // Updated parameter name

    if (updateError) {
      console.error('Database update failed:', updateError);
      return new Response(JSON.stringify({ error: 'Failed to update database' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`File processing completed for ID: ${compositionId}. Name: ${generatedName}`); // Updated parameter name
    
    // 4. Trigger Artwork Generation (asynchronously) using existing/default metadata
    // We use existing genres/moods, which might be null/default, but the function handles that.
    const currentMood = comp.analysis_data?.mood || 'Ambient'; // Updated variable
    triggerArtworkGeneration(supabase, compositionId, generatedName, comp.primary_genre || 'Ambient', comp.secondary_genre || 'Ambient', currentMood); // Updated variable


    return new Response(JSON.stringify({ success: true, generatedName }), {
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