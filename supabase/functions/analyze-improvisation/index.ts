// @ts-ignore
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
// @ts-ignore
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const PIANO_GENRES = [
    "Classical", "Jazz", "New Age", "Folk", "Soundtrack", "Vocal", "Alternative", "Blues", "R&B/Soul", "Pop", "Singer/Songwriter"
];

const OTHER_GENRES = [
    "Afrobeat", "Afropop", "Big Band", "Children's Music", "Christian/Gospel", "Comedy", 
    "Country", "Dance", "Electronic", "Fitness & Workout", "Folk", "French Pop", "German Folk", 
    "German Pop", "Hip Hop/Rap", "Holiday", "J-Pop", "K-Pop", "Latin", "Latin Urban", 
    "Metal", "Punk", "Reggae", "Rock", "Spoken Word", "World"
];

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

// Function to call Gemini API for name generation
async function generateNameWithGemini(analysisData: any, isImprovisation: boolean, isPiano: boolean, primaryGenre: string, secondaryGenre: string): Promise<string> {
    // @ts-ignore
    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    if (!GEMINI_API_KEY) {
        console.error("GEMINI_API_KEY is not set.");
        return "AI Name Generation Failed (Key Missing)";
    }

    const prompt = `You are an expert music analyst and poet. Based on the following analysis of an audio track, generate a single, evocative, and unique title for the piece. 
    The piece is classified as a ${isPiano ? 'Piano' : 'Non-Piano'} ${isImprovisation ? 'Improvisation' : 'Composition'}.
    Primary Genre: ${primaryGenre}. Secondary Genre: ${secondaryGenre}.
    Technical Data: Key=${analysisData.simulated_key}, Tempo=${analysisData.simulated_tempo}, Mood=${analysisData.mood}.
    
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
            return `AI Name Generation Failed (HTTP ${response.status})`;
        }

        const data = await response.json();
        const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "Untitled AI Piece";
        
        // Clean up potential quotes or extra formatting from the AI response
        return generatedText.replace(/^["']|["']$/g, '');

    } catch (error) {
        console.error("Error calling Gemini API:", error);
        return "AI Name Generation Failed (Network Error)";
    }
}

// Function to intelligently select genres based on simulated mood and tempo
function selectIntelligentGenres(isPiano: boolean, mood: string, tempo: number): { primary: string, secondary: string } {
    const availableGenres = isPiano ? PIANO_GENRES : OTHER_GENRES;
    let primaryGenre = 'Alternative';
    let secondaryGenre = 'Folk';

    // Simple mapping logic based on simulated features
    if (isPiano) {
        if (mood === 'Melancholy' && tempo < 130) {
            primaryGenre = 'Classical';
            secondaryGenre = 'New Age';
        } else if (mood === 'Energetic' && tempo >= 130) {
            primaryGenre = 'Jazz';
            secondaryGenre = 'Pop';
        } else if (mood === 'Neutral') {
            primaryGenre = 'Singer/Songwriter';
            secondaryGenre = 'Folk';
        }
    } else {
        if (mood === 'Energetic' && tempo >= 130) {
            primaryGenre = 'Dance';
            secondaryGenre = 'Electronic';
        } else if (mood === 'Melancholy') {
            primaryGenre = 'R&B/Soul';
            secondaryGenre = 'Blues';
        }
    }

    // Ensure selected genres are actually in the available list (fallback to random if not found)
    if (!availableGenres.includes(primaryGenre)) {
        primaryGenre = availableGenres[Math.floor(Math.random() * availableGenres.length)];
    }
    
    // Select secondary genre randomly from the remaining list, ensuring it's not the primary
    let secondaryOptions = availableGenres.filter(g => g !== primaryGenre);
    if (secondaryOptions.length > 0) {
        secondaryGenre = secondaryOptions[Math.floor(Math.random() * secondaryOptions.length)];
    } else {
        secondaryGenre = primaryGenre; // Should not happen with these lists
    }

    return { primary: primaryGenre, secondary: secondaryGenre };
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

    const { improvisationId, storagePath, isImprovisation } = await req.json();

    if (!improvisationId || !storagePath) {
      return new Response(JSON.stringify({ error: 'Missing improvisationId or storagePath' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Starting analysis for ID: ${improvisationId} at path: ${storagePath}. Is Improv: ${isImprovisation}`);

    // --- SIMULATE AUDIO FEATURE EXTRACTION (5 seconds delay) ---
    await new Promise(resolve => setTimeout(resolve, 5000)); 

    let isPiano;
    if (isImprovisation) {
        // If user says it's an improvisation, strongly bias towards it being a piano piece (95% chance)
        isPiano = Math.random() < 0.95;
    } else {
        // If user says it's a composition, use the standard 80% chance
        isPiano = Math.random() < 0.8; 
    }
    
    // --- SIMULATED ANALYSIS RESULTS ---
    const simulatedTempo = isPiano ? 120 : 140;
    const simulatedMood = isPiano ? 'Melancholy' : 'Energetic';

    const { primary: primaryGenre, secondary: secondaryGenre } = selectIntelligentGenres(isPiano, simulatedMood, simulatedTempo);

    const analysisData = { 
        simulated_key: isPiano ? 'C Major' : 'A Minor', 
        simulated_tempo: simulatedTempo,
        instrument_confidence: isPiano ? 0.98 : 0.25,
        mood: simulatedMood,
        user_declared_improv: isImprovisation
    };

    // --- AI NAME GENERATION ---
    const generatedName = await generateNameWithGemini(analysisData, isImprovisation, isPiano, primaryGenre, secondaryGenre);

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