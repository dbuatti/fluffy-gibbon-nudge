// @ts-expect-error - Deno
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Max-Age': '86400',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Missing authorization header');

    const { theme } = await req.json().catch(() => ({}));

    // @ts-expect-error - Deno
    const geminiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiKey) {
      return new Response(JSON.stringify({
        error: 'Gemini API key not configured.',
        configured: false,
      }), {
        status: 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const themeInstruction = theme
      ? `The theme/mood is: "${theme}".`
      : 'Choose a random calming, atmospheric theme.';

    const prompt = `You are an expert at writing prompts for AI image generators (like Midjourney, DALL-E, FLUX). Generate a single, detailed prompt for an abstract album cover artwork.

${themeInstruction}

The prompt should describe:
- Abstract, atmospheric artwork (no recognizable objects, people, or text)
- Soft flowing shapes, gradients, or textures
- Calming, contemplative mood
- Color palette (specific colors)
- Lighting and atmosphere
- Texture (canvas, watercolour, oil painting, etc.)
- Overall feeling (dreamlike, serene, melancholic, etc.)

Style: minimalist, impressionistic, ethereal. Square format (1:1). No text, no people, no instruments.

Respond ONLY with the prompt text, nothing else. Keep it under 100 words.`;

    const geminiUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

    const geminiResponse = await fetch(geminiUrl, {
      method: 'POST',
      headers: {
        'x-goog-api-key': geminiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.9,
        },
      }),
    });

    if (!geminiResponse.ok) {
      const errBody = await geminiResponse.json().catch(() => ({}));
      return new Response(JSON.stringify({
        error: errBody.error?.message || `Gemini API error: HTTP ${geminiResponse.status}`,
      }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const geminiData = await geminiResponse.json();
    const generatedPrompt = geminiData.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';

    if (!generatedPrompt) {
      return new Response(JSON.stringify({ error: 'No prompt generated' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      prompt: generatedPrompt.replace(/^["']|["']$/g, ''),
    }), {
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