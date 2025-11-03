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

// NEW: Function to call Nano Banana API for image generation
async function generateImageWithNanoBanana(prompt: string): Promise<string> {
    // @ts-ignore
    const NANO_BANANA_API_KEY = Deno.env.get('NANO_BANANA_API_KEY');
    // @ts-ignore
    const NANO_BANANA_API_URL = Deno.env.get('NANO_BANANA_API_URL');

    if (!NANO_BANANA_API_KEY || !NANO_BANANA_API_URL) {
        console.error("NANO_BANANA_API_KEY or NANO_BANANA_API_URL is not set.");
        throw new Error("Image generation API keys/URLs missing. Please configure NANO_BANANA_API_KEY and NANO_BANANA_API_URL.");
    }

    const url = NANO_BANANA_API_URL; // Placeholder for Nano Banana API endpoint
    
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${NANO_BANANA_API_KEY}`, // Assuming Bearer token auth
            },
            body: JSON.stringify({
                prompt: prompt,
                width: 3000, // Request 3000x3000 as per requirements
                height: 3000,
                // Add other parameters as required by Nano Banana API, e.g., style, negative_prompt
            }),
        });

        if (!response.ok) {
            const errorBody = await response.json();
            console.error("Nano Banana API Error:", errorBody);
            throw new Error(`Image generation failed (HTTP ${response.status}): ${JSON.stringify(errorBody)}`);
        }

        const data = await response.json();
        // Assuming the API returns a direct URL to the generated image
        const imageUrl = data.imageUrl || data.url; // Adjust based on actual API response structure
        
        if (!imageUrl) {
            throw new Error("Image URL not found in Nano Banana API response.");
        }
        return imageUrl;

    } catch (error) {
        console.error("Error calling Nano Banana API:", error);
        throw error;
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

    console.log(`Starting artwork generation for ID: ${improvisationId} based on name: ${generatedName}`);

    // 1. Generate a detailed, artistic prompt using Gemini, incorporating musical context
    const imagePrompt = await generateImagePromptWithGemini(generatedName, primaryGenre, secondaryGenre || '', mood);
    console.log(`AI Generated Image Prompt: ${imagePrompt}`);

    let finalArtworkUrl: string | null = null;
    try {
        // 2. Generate the image using Nano Banana
        const generatedImageUrl = await generateImageWithNanoBanana(imagePrompt);
        console.log(`Nano Banana Generated Image URL: ${generatedImageUrl}`);

        // 3. Fetch the generated image and upload to Supabase Storage
        const imageResponse = await fetch(generatedImageUrl);
        if (!imageResponse.ok) {
            throw new Error(`Failed to fetch generated image from ${generatedImageUrl}`);
        }
        const imageBlob = await imageResponse.blob();

        const filePath = `${improvisationId}/artwork_${Date.now()}.jpg`; // Store artwork under improvisation ID
        const bucketName = 'artwork'; // Use the new 'artwork' bucket

        const { data: uploadData, error: uploadError } = await supabase.storage
            .from(bucketName)
            .upload(filePath, imageBlob, {
                cacheControl: '3600',
                upsert: true, // Allow overwriting if same path
                contentType: 'image/jpeg', // Assuming JPEG output
            });

        if (uploadError) {
            console.error('Failed to upload generated artwork to storage:', uploadError);
            throw new Error('Failed to upload generated artwork.');
        }
        
        // Get public URL for the uploaded image
        const { data: publicUrlData } = supabase.storage.from(bucketName).getPublicUrl(filePath);
        finalArtworkUrl = publicUrlData.publicUrl;
        console.log(`Artwork uploaded to Supabase Storage: ${finalArtworkUrl}`);

    } catch (imageGenError) {
        console.error("Failed to generate or upload image:", imageGenError);
        // If image generation or upload fails, we still want to save the prompt
        // and indicate that artwork is missing by keeping artwork_url as null.
    }

    // 4. Update the database record with the artwork prompt and the new artwork_url
    const { error: updateError } = await supabase
      .from('improvisations')
      .update({ 
        artwork_prompt: imagePrompt,
        artwork_url: finalArtworkUrl, // Set the actual generated artwork URL or null if failed
      })
      .eq('id', improvisationId);

    if (updateError) {
      console.error('Database update failed during artwork generation:', updateError);
      return new Response(JSON.stringify({ error: 'Failed to update database with artwork details' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Artwork generated and saved for ID: ${improvisationId}.`);

    return new Response(JSON.stringify({ success: true, artworkPrompt: imagePrompt, artworkUrl: finalArtworkUrl }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Artwork Generation Edge Function error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
})