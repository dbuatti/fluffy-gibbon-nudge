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

    // Try multiple models and methods for image generation
    const modelsToTry = [
      { model: 'gemini-2.0-flash-exp', method: 'generateContent' },
      { model: 'gemini-2.5-flash-preview-05-20', method: 'generateContent' },
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
            parameters: { sampleCount: 1 },
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
      return new Response(JSON.stringify({
        error: 'No image returned from Gemini. The API key may not have access to image generation models. Try Cloudflare mode instead, or create a new API key at https://aistudio.google.com/apikey',
        configured: true,
        debug: errors.join('; '),
        availableModels: availableModels,
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