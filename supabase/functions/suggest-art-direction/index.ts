// @ts-expect-error - Deno
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
// @ts-expect-error - Deno
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

/**
 * AI art-direction suggestions: moods, palettes, style, texture, lighting,
 * composition and energy derived from the song's metadata.
 *
 * The client always has a deterministic local fallback, so this endpoint is
 * additive: when Gemini is unavailable it returns `suggestions: null` rather
 * than an error, and the UI simply keeps its local proposal.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Max-Age': '86400',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

const HEX = /^#[0-9a-f]{6}$/i
const ENERGIES = new Set(['still', 'gentle', 'flowing', 'turbulent'])

const strList = (v: unknown, max: number): string[] =>
  Array.isArray(v)
    ? [...new Set(v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).map((x) => x.trim()))].slice(0, max)
    : []

function sanitizeSuggestions(raw: any) {
  if (!raw || typeof raw !== 'object') return null
  const palettes = Array.isArray(raw.palettes)
    ? raw.palettes
        .map((p: any) => ({
          name: typeof p?.name === 'string' ? p.name.trim().slice(0, 40) : '',
          colors: Array.isArray(p?.colors)
            ? p.colors.filter((c: any) => typeof c === 'string' && HEX.test(c.trim())).map((c: string) => c.trim().toLowerCase()).slice(0, 6)
            : [],
        }))
        .filter((p: any) => p.name && p.colors.length >= 4)
        .slice(0, 3)
    : []

  const moods = strList(raw.moods, 8)
  const styles = strList(raw.styles, 5)
  const textures = strList(raw.textures, 5)
  const lighting = strList(raw.lighting, 5)
  const compositions = strList(raw.compositions, 5)
  const energies = strList(raw.energies, 4).map((e) => e.toLowerCase()).filter((e) => ENERGIES.has(e))

  if (!moods.length || !palettes.length || !styles.length) return null
  return {
    moods,
    palettes,
    styles,
    textures: textures.length ? textures : ['fine canvas grain'],
    lighting: lighting.length ? lighting : ['soft diffused light'],
    compositions: compositions.length ? compositions : ['a centred luminous core'],
    energies: energies.length ? energies : ['gentle', 'still', 'flowing', 'turbulent'],
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Missing authorization header')

    const body = await req.json().catch(() => ({}))
    if (!body.improvisationId) return json({ error: 'Missing improvisationId' }, 400)

    const supabase = createClient(
      // @ts-expect-error - Deno
      Deno.env.get('SUPABASE_URL') ?? '',
      // @ts-expect-error - Deno
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) throw new Error('Unauthorized')

    const { data: imp, error } = await supabase
      .from('improvisations')
      .select('*')
      .eq('id', body.improvisationId)
      .single()
    if (error || !imp) return json({ error: 'Improvisation not found' }, 404)
    if (imp.user_id !== user.id) return json({ error: 'Unauthorized' }, 403)

    // @ts-expect-error - Deno
    const key = Deno.env.get('GEMINI_API_KEY')
    if (!key) return json({ success: true, suggestions: null, reason: 'GEMINI_API_KEY not set' })

    const analysis = imp.analysis_data || {}
    const notes = (imp.notes || [])
      .map((n: any) => `${n?.title || ''}: ${n?.content || ''}`.trim())
      .filter(Boolean)
      .join(' | ')

    const instruction = `You are an art director designing abstract album covers. Suggest a palette of visual directions for this song.

SONG CLUES:
- Title: ${imp.generated_name || imp.original_name || 'Untitled'}
- Genre: ${[imp.primary_genre, imp.secondary_genre].filter(Boolean).join(' / ') || 'unknown'}
- Mood: ${analysis.mood || 'unknown'}
- Key: ${analysis.simulated_key || 'unknown'} · Tempo: ${analysis.simulated_tempo || 'unknown'} BPM
- Tags: ${(imp.user_tags || []).join(', ') || 'none'}
- Description: ${imp.description || 'none'}
- Notes: ${notes || 'none'}
- Themes: ${(imp.insight_themes || []).join(', ') || 'none'}
- Benefits: ${(imp.insight_benefits || []).join(', ') || 'none'}
- Audience: ${imp.insight_audience_level || 'unknown'}

Return ONLY JSON with this exact shape:
{
  "moods": ["8 single-word moods"],
  "palettes": [
    { "name": "short evocative name", "colors": ["#rrggbb", "#rrggbb", "#rrggbb", "#rrggbb", "#rrggbb"] }
  ],
  "styles": ["4 abstract art styles"],
  "textures": ["4 textures"],
  "lighting": ["4 lighting descriptions"],
  "compositions": ["4 abstract compositions"],
  "energies": ["still", "gentle", "flowing", "turbulent"]
}

Rules:
- Exactly 3 palettes, each a coherent 5-colour ramp with at least one dark and one light tone.
- Moods are single words (e.g. "contemplative", "luminous").
- Everything is non-representational: no objects, people, text, instruments or scenery.
- Use the musical clues, but do not repeat the title verbatim.`

    let suggestions = null
    let reason = ''
    try {
      const resp = await fetch(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
        {
          method: 'POST',
          headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: instruction }] }],
            generationConfig: { temperature: 1.0, responseMimeType: 'application/json' },
          }),
        },
      )
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}))
        reason = err.error?.message || `HTTP ${resp.status}`
      } else {
        const data = await resp.json()
        let text = (data.candidates?.[0]?.content?.parts || [])
          .map((p: any) => p?.text || '')
          .join('')
          .trim()
        text = text.replace(/```json\s*|```\s*/gi, '').trim()
        suggestions = sanitizeSuggestions(JSON.parse(text))
        if (!suggestions) reason = 'AI returned an unusable direction'
      }
    } catch (e: any) {
      reason = e.message || 'AI unavailable'
    }

    return json({ success: true, suggestions, reason: suggestions ? undefined : reason })
  } catch (error: any) {
    console.error('Edge Function error:', error)
    const status = error.message === 'Unauthorized' || error.message === 'Missing authorization header' ? 401 : 500
    return json({ error: error.message }, status)
  }
})
