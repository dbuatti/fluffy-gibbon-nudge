// @ts-ignore
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
// @ts-ignore
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Function to call Gemini API for prompt generation
async function generatePromptWithGemini(): Promise<string> {
    // @ts-ignore
    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    if (!GEMINI_API_KEY) {
        console.error("GEMINI_API_KEY is not set.");
        return "AI Key Missing: Compose a piece about silence.";
    }

    const prompt = `You are a creative writing and music coach. Generate a single, short, evocative, and inspiring prompt for a musician's daily improvisation session. The prompt should focus on a mood, a specific image, a color, or a short abstract concept.
    
    Example: "The sound of a forgotten memory."
    Example: "A slow, deliberate piece in the key of F minor."
    
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
                    temperature: 1.0,
                }
            }),
        });

        if (!response.ok) {
            const errorBody = await response.json();
            console.error("Gemini API Error:", errorBody);
            return `AI Prompt Failed (HTTP ${response.status})`;
        }

        const data = await response.json();
        const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "Compose a piece about the color blue.";
        
        // Clean up and return the prompt
        return generatedText.replace(/^["']|["']$/g, '');

    } catch (error) {
        console.error("Error calling Gemini API:", error);
        return "AI Prompt Failed (Network Error)";
    }
}


serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // We don't need to fetch user data for a public prompt, but we run the AI generation.
    const generatedPrompt = await generatePromptWithGemini();

    return new Response(JSON.stringify({ success: true, prompt: generatedPrompt }), {
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