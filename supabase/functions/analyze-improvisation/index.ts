// @ts-ignore
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
// @ts-ignore
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Helper function to simulate analysis and generate a name
function generateName(): string {
    const names = [
        "The Melancholy Waltz",
        "Midnight Rhapsody",
        "Chromatic Dreamscape",
        "A Minor Ascent",
        "Rainy Day Blues",
        "Impromptu in C Sharp",
        "Echoes of Yesterday"
    ];
    const randomIndex = Math.floor(Math.random() * names.length);
    return names[randomIndex];
}

// Function to invoke the artwork generation function
async function triggerArtworkGeneration(supabaseClient: any, improvisationId: string, generatedName: string) {
    console.log(`Invoking generate-artwork for ID: ${improvisationId}`);
    
    // Note: In a real deployment, you might need to use the full URL for cross-function calls.
    // For simplicity in this environment, we assume direct invocation works.
    const { data, error } = await supabaseClient.functions.invoke('generate-artwork', {
        body: {
            improvisationId: improvisationId,
            generatedName: generatedName,
        },
    });

    if (error) {
        console.error('Error invoking generate-artwork:', error);
        // We don't fail the main analysis if artwork generation fails, just log it.
    } else {
        console.log('Artwork generation triggered successfully:', data);
    }
}


serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Create a Supabase client with the Service Role Key for privileged database access
    // This is necessary for the function to update records regardless of RLS policies.
    // @ts-ignore
    const supabase = createClient(
      // @ts-ignore
      Deno.env.get('SUPABASE_URL') ?? '',
      // @ts-ignore
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { improvisationId, storagePath } = await req.json();

    if (!improvisationId || !storagePath) {
      return new Response(JSON.stringify({ error: 'Missing improvisationId or storagePath' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Starting analysis for ID: ${improvisationId} at path: ${storagePath}`);

    // --- SIMULATE ANALYSIS PROCESS (5 seconds delay) ---
    await new Promise(resolve => setTimeout(resolve, 5000)); 

    const generatedName = generateName();

    // Update the database record with the generated name
    const { error: updateError } = await supabase
      .from('improvisations')
      .update({ 
        status: 'completed', 
        generated_name: generatedName,
        analysis_data: { simulated_key: 'C Major', simulated_tempo: 120 } // Placeholder analysis data
      })
      .eq('id', improvisationId);

    if (updateError) {
      console.error('Database update failed:', updateError);
      return new Response(JSON.stringify({ error: 'Failed to update database' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Analysis completed for ID: ${improvisationId}. Name: ${generatedName}`);
    
    // --- Trigger Artwork Generation (asynchronously) ---
    // We don't await this, so the client gets a fast response, and image generation runs in the background.
    triggerArtworkGeneration(supabase, improvisationId, generatedName);


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