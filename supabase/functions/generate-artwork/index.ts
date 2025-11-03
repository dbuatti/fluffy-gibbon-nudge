// @ts-ignore
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
// @ts-ignore
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Function to call Gemini API for image prompt generation
async function generateImagePromptWithGemini(generatedName: string, primaryGenre: string, secondaryGenre: string, mood: string): Promise<string> {
    // @ts-ignore
    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    if (!GEMINI_API_KEY) {
        console.error("GEMINI_API_KEY is not set for prompt generation.");
        return `A cinematic, abstract representation of ${generatedName} in the style of ${primaryGenre}. 3000x3000, no text.`; // Fallback
    }

    const prompt = `You are an expert visual artist designing album covers. The song title is "${generatedName}". The primary genre is ${primaryGenre} and the mood is ${mood}. Generate a single, highly descriptive, abstract, and evocative prompt suitable for an AI image generator (like Midjourney or DALL-E). The image must be square, high-resolution (3000x3000), and contain no text, logos, or human faces. Focus on color, texture, and lighting that reflects the ${mood} and ${primaryGenre} genres. The style should be cinematic, painterly, or digital art.
    
    Respond ONLY with the prompt text, nothing else.`;

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
            console.error("Gemini Prompt API Error:", errorBody);
            return `A cinematic, abstract representation of ${generatedName} in the style of ${primaryGenre}. 3000x3000, no text.`;
        }

        const data = await response.json();
        const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || `A cinematic, abstract representation of ${generatedName} in the style of ${primaryGenre}. 3000x3000, no text.`;
        
        // Clean up and return the prompt
        return generatedText.replace(/^["']|["']$/g, '');

    } catch (error) {
        console.error("Error calling Gemini Prompt API:", error);
        return `A cinematic, abstract representation of ${generatedName} in the style of ${primaryGenre}. 3000x3000, no text.`;
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

    const { improvisationId, generatedName, primaryGenre, secondaryGenre, mood } = await req.json();

    if (!improvisationId || !generatedName || !primaryGenre || !mood) {
      return new Response(JSON.stringify({ error: 'Missing required parameters for artwork generation' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Starting artwork prompt generation for ID: ${improvisationId} based on name: ${generatedName}`);

    // 1. Generate a detailed, artistic prompt using Gemini, incorporating musical context
    const imagePrompt = await generateImagePromptWithGemini(generatedName, primaryGenre, secondaryGenre || '', mood);
    console.log(`AI Generated Image Prompt: ${imagePrompt}`);

    // 2. Update the database record with the artwork prompt.
    //    Set artwork_url to null as we are no longer generating and uploading the image directly.
    const { error: updateError } = await supabase
      .from('improvisations')
      .update({ 
        artwork_prompt: imagePrompt,
        artwork_url: null, // Clear artwork_url as AI no longer uploads image
      })
      .eq('id', improvisationId);

    if (updateError) {
      console.error('Database update failed during artwork prompt generation:', updateError);
      return new Response(JSON.stringify({ error: 'Failed to update database with artwork prompt' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Artwork prompt generated and saved for ID: ${improvisationId}.`);

    return new Response(JSON.stringify({ success: true, artworkPrompt: imagePrompt, artworkUrl: null }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Artwork Prompt Generation Edge Function error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
})