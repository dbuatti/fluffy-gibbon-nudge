// @ts-ignore
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
// @ts-ignore
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const GENRES = [
    "Afrobeat", "Afropop", "Alternative", "Big Band", "Blues", "Children's Music", 
    "Christian/Gospel", "Classical", "Comedy", "Country", "Dance", "Electronic", 
    "Fitness & Workout", "Folk", "French Pop", "German Folk", "German Pop", 
    "Hip Hop/Rap", "Holiday", "J-Pop", "Jazz", "K-Pop", "Latin", "Latin Urban", 
    "Metal", "New Age", "Pop", "Punk", "R&B/Soul", "Reggae", "Rock", 
    "Singer/Songwriter", "Soundtrack", "Spoken Word", "Vocal", "World"
];

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
    
    const { data, error } = await supabaseClient.functions.invoke('generate-artwork', {
        body: {
            improvisationId: improvisationId,
            generatedName: generatedName,
        },
    });

    if (error) {
        console.error('Error invoking generate-artwork:', error);
    } else {
        console.log('Artwork generation triggered successfully:', data);
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
    
    // --- SIMULATED ANALYSIS RESULTS ---
    const isPiano = true; // Assume success for simulation
    
    // Randomly select primary genre
    const primaryGenreIndex = Math.floor(Math.random() * GENRES.length);
    const primaryGenre = GENRES[primaryGenreIndex];
    
    // Randomly select secondary genre (must be different from primary)
    let secondaryGenreIndex = Math.floor(Math.random() * GENRES.length);
    while (secondaryGenreIndex === primaryGenreIndex) {
        secondaryGenreIndex = Math.floor(Math.random() * GENRES.length);
    }
    const secondaryGenre = GENRES[secondaryGenreIndex];

    const analysisData = { 
        simulated_key: 'C Major', 
        simulated_tempo: 120,
        instrument_confidence: 0.98,
        mood: 'Melancholy'
    };

    // Update the database record with the generated name and analysis data
    const { error: updateError } = await supabase
      .from('improvisations')
      .update({ 
        status: 'completed', 
        generated_name: generatedName,
        is_piano: isPiano,
        primary_genre: primaryGenre,
        secondary_genre: secondaryGenre,
        analysis_data: analysisData
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