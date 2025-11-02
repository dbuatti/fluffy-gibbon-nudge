// @ts-ignore
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
// @ts-ignore
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Placeholder function to simulate generating an image URL
function generatePlaceholderImageUrl(name: string): string {
    // In a real application, this would call an external AI service (e.g., DALL-E)
    // and return the URL of the generated image stored in a bucket.
    
    // Using a high-resolution placeholder image that meets the 1600x1600 requirement.
    const seed = name.replace(/\s/g, '');
    return `https://picsum.photos/seed/${seed}/1600/1600`;
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

    const { improvisationId, generatedName } = await req.json();

    if (!improvisationId || !generatedName) {
      return new Response(JSON.stringify({ error: 'Missing required parameters' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Starting artwork generation for ID: ${improvisationId} based on name: ${generatedName}`);

    // Simulate image generation time
    await new Promise(resolve => setTimeout(resolve, 3000)); 

    const artworkUrl = generatePlaceholderImageUrl(generatedName);

    // Update the database record with the artwork URL
    const { error } = await supabase
      .from('improvisations')
      .update({ 
        artwork_url: artworkUrl,
      })
      .eq('id', improvisationId);

    if (error) {
      console.error('Database update failed during artwork generation:', error);
      return new Response(JSON.stringify({ error: 'Failed to update database with artwork URL' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Artwork generated and saved for ID: ${improvisationId}. URL: ${artworkUrl}`);

    return new Response(JSON.stringify({ success: true, artworkUrl }), {
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