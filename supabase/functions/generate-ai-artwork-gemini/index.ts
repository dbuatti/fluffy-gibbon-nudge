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

    const { prompt, improvisationId } = await req.json();

    if (!prompt) {
      return new Response(JSON.stringify({ error: 'Missing prompt' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

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

    console.log(`Generating AI artwork with Gemini: "${prompt.substring(0, 80)}..."`);

    // Try to list available models for debugging
    let availableModels = '';
    try {
      const listUrl = 'https://generativelanguage.googleapis.com/v1beta/models';
      const listResp = await fetch(listUrl, {
        method: 'GET',
        headers: { 'x-goog-api-key': geminiKey },
      });
      if (listResp.ok) {
        const listData = await listResp.json();
        availableModels = (listData.models || []).map((m: any) => m.name).join(', ');
        console.log('Available models:', availableModels);
      } else {
        const errBody = await listResp.json().catch(() => ({}));
        console.log('Could not list models:', listResp.status, errBody.error?.message || '');
      }
    } catch (e: any) {
      console.log('Could not list models:', e.message);
    }

    // Model names change often. Try the current image-capable models first
    // (Nano Banana / Imagen 4), then fall back through older names.
    const modelsToTry = [
      { model: 'gemini-2.5-flash-image', method: 'generateContent' },
      { model: 'gemini-2.5-flash-image-preview', method: 'generateContent' },
      { model: 'gemini-2.0-flash-exp-image-generation', method: 'generateContent' },
      { model: 'imagen-4.0-generate-001', method: 'predict' },
      { model: 'imagen-3.0-generate-002', method: 'predict' },
    ];

    let base64Image: string | null = null;
    let usedModel = '';
    const errors: string[] = [];

    for (const { model, method } of modelsToTry) {
      try {
        let geminiUrl: string;
        let requestBody: any;

        if (method === 'predict') {
          geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:predict`;
          requestBody = {
            instances: [{ prompt: prompt }],
            parameters: {
              sampleCount: 1,
              aspectRatio: '1:1',
              personGeneration: 'dont_allow',
            },
          };
        } else {
          geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
          requestBody = {
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
              responseModalities: ['TEXT', 'IMAGE'],
            },
          };
        }

        console.log(`Trying Gemini model: ${model} (${method})`);

        const resp = await fetch(geminiUrl, {
          method: 'POST',
          headers: {
            'x-goog-api-key': geminiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        });

        if (!resp.ok) {
          const errBody = await resp.json().catch(() => ({}));
          const errMsg = errBody.error?.message || `HTTP ${resp.status}`;
          errors.push(`${model}: ${errMsg}`);
          console.log(`Model ${model} failed: ${errMsg}`);
          continue;
        }

        const data = await resp.json();

        if (method === 'predict') {
          const predictions = data.predictions || [];
          if (predictions.length > 0 && predictions[0].bytesBase64Encoded) {
            base64Image = predictions[0].bytesBase64Encoded;
            usedModel = model;
            break;
          }
        } else {
          const parts = data.candidates?.[0]?.content?.parts || [];
          for (const part of parts) {
            if (part.inlineData?.data) {
              base64Image = part.inlineData.data;
              usedModel = model;
              break;
            }
            if (part.inline_data?.data) {
              base64Image = part.inline_data.data;
              usedModel = model;
              break;
            }
          }
          if (base64Image) break;
        }
      } catch (e: any) {
        errors.push(`${model}: ${e.message}`);
        console.log(`Model ${model} exception: ${e.message}`);
      }
    }

    if (!base64Image) {
      console.error('Gemini no image. Errors:', errors);
      const quotaHit = errors.some((e) => /quota|429|billing|exceeded/i.test(e));
      const error = quotaHit
        ? 'Gemini image generation is unavailable for this API key: the image-model quota is exhausted or billing is not enabled. Cloudflare (FLUX) still works. To use Gemini, enable Imagen / Nano Banana billing on the Google AI Studio project, or paste a fresh key with image quota into Supabase secrets as GEMINI_API_KEY.'
        : 'Gemini image generation is not available for this API key. Cloudflare (FLUX) still works. Check that Imagen / Nano Banana is enabled for the key at https://aistudio.google.com/apikey, then update the GEMINI_API_KEY secret.';
      return new Response(JSON.stringify({
        error,
        configured: true,
        reason: quotaHit ? 'quota' : 'unavailable',
        debug: errors.join('; ').slice(0, 800),
        availableModels: availableModels.split(',').slice(0, 12).join(','),
      }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Using Gemini model: ${usedModel}`);

    if (improvisationId) {
      const { data: imp, error: fetchError } = await supabase
        .from('improvisations')
        .select('user_id')
        .eq('id', improvisationId)
        .single();

      if (!fetchError && imp && imp.user_id === user.id) {
        await supabase
          .from('improvisations')
          .update({ artwork_prompt: prompt })
          .eq('id', improvisationId);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      image: base64Image,
      format: 'png',
    }), {
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