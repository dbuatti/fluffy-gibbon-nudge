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

    const { prompt, improvisationId, width = 1024, height = 1024 } = await req.json();

    if (!prompt) {
      return new Response(JSON.stringify({ error: 'Missing prompt' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // @ts-expect-error - Deno
    const cfToken = Deno.env.get('CLOUDFLARE_API_TOKEN');
    // @ts-expect-error - Deno
    const cfAccountId = Deno.env.get('CLOUDFLARE_ACCOUNT_ID');

    if (!cfToken || !cfAccountId) {
      return new Response(JSON.stringify({
        error: 'Cloudflare Workers AI not configured. Set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in Supabase secrets.',
        configured: false,
      }), {
        status: 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Generating AI artwork with Cloudflare FLUX.1 Schnell: "${prompt.substring(0, 80)}..."`);

    // Call Cloudflare Workers AI - FLUX.1 Schnell
    const cfUrl = `https://api.cloudflare.com/client/v4/accounts/${cfAccountId}/ai/run/@cf/black-forest-labs/flux-1-schnell`;

    const cfResponse = await fetch(cfUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${cfToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: prompt,
        // @ts-expect-error - Deno
        num_steps: 4,
      }),
    });

    if (!cfResponse.ok) {
      const errBody = await cfResponse.json().catch(() => ({}));
      console.error('Cloudflare API Error:', errBody);
      return new Response(JSON.stringify({
        error: errBody.errors?.[0]?.message || `Cloudflare API error: HTTP ${cfResponse.status}`,
        configured: true,
      }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Cloudflare Workers AI returns image as binary (image/png) or JSON with base64
    const contentType = cfResponse.headers.get('content-type') || '';
    let base64Image: string | null = null;

    if (contentType.includes('image/')) {
      // Binary image response — convert to base64
      const arrayBuffer = await cfResponse.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      base64Image = btoa(binary);
    } else {
      // JSON response — try to extract base64 image
      const cfData = await cfResponse.json().catch(() => ({}));
      base64Image = cfData.result?.image || cfData.image || null;
      if (!base64Image) {
        console.error('Unexpected Cloudflare response:', JSON.stringify(cfData).substring(0, 500));
      }
    }

    if (!base64Image) {
      return new Response(JSON.stringify({
        error: 'No image returned from Cloudflare. The model may have returned an unexpected format.',
        configured: true,
        debug: contentType,
      }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // If improvisationId provided, save artwork_url reference
    if (improvisationId) {
      const { data: imp, error: fetchError } = await supabase
        .from('improvisations')
        .select('user_id')
        .eq('id', improvisationId)
        .single();

      if (!fetchError && imp && imp.user_id === user.id) {
        // Store the prompt
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