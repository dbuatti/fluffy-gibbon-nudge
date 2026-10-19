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

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

interface Direction {
  moods?: string[]
  palette?: { name?: string; colors?: string[] }
  style?: string
  texture?: string
  lighting?: string
  composition?: string
  energy?: string
}

function cleanDirection(raw: Direction | undefined): Required<{
  moods: string[]
  palette: { name: string; colors: string[] }
  style: string
  texture: string
  lighting: string
  composition: string
  energy: string
}> {
  const moods = (raw?.moods || []).filter((m) => typeof m === 'string' && m.trim()).map((m) => m.trim()).slice(0, 4)
  const colors = (raw?.palette?.colors || [])
    .filter((c) => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c.trim()))
    .slice(0, 6)
  return {
    moods: moods.length ? moods : ['contemplative', 'serene'],
    palette: {
      name: (raw?.palette?.name || 'Soft tonal').trim(),
      colors: colors.length ? colors : ['#EFEAF7', '#D6CCEB', '#B3A3D9', '#7E6BA8', '#3B3350'],
    },
    style: (raw?.style || 'wet-on-wet watercolour').trim(),
    texture: (raw?.texture || 'cold-pressed watercolour paper').trim(),
    lighting: (raw?.lighting || 'soft diffused light').trim(),
    composition: (raw?.composition || 'a centred luminous core').trim(),
    energy: (raw?.energy || 'gentle').trim(),
  }
}

function colorName(hex: string): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return 'tonal shade'
  const n = parseInt(m[1], 16)
  const r = ((n >> 16) & 255) / 255
  const g = ((n >> 8) & 255) / 255
  const b = (n & 255) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1))
  let h = 0
  if (d !== 0) {
    if (max === r) h = 60 * (((g - b) / d) % 6)
    else if (max === g) h = 60 * ((b - r) / d + 2)
    else h = 60 * ((r - g) / d + 4)
  }
  if (h < 0) h += 360
  if (s < 0.1) {
    if (l > 0.92) return 'pearl white'
    if (l < 0.1) return 'near-black'
    return l > 0.62 ? 'soft grey' : 'deep charcoal'
  }
  let base: string
  if (h < 15 || h >= 345) base = 'rose red'
  else if (h < 35) base = 'warm coral'
  else if (h < 50) base = 'amber'
  else if (h < 70) base = 'gold'
  else if (h < 90) base = 'olive'
  else if (h < 150) base = 'sage green'
  else if (h < 175) base = 'teal'
  else if (h < 200) base = 'sea blue'
  else if (h < 230) base = 'slate blue'
  else if (h < 255) base = 'indigo'
  else if (h < 285) base = 'violet'
  else if (h < 320) base = 'plum'
  else base = 'dusty rose'
  const prefix = l > 0.8 ? 'pale ' : l < 0.26 ? 'deep ' : s < 0.32 ? 'muted ' : ''
  return prefix + base
}

/** Keep only atmosphere words — nouns like "piano" would be painted literally. */
const LITERAL_BLOCKLIST = /piano|guitar|drum|violin|cello|sax|voice|vocal|singer|instrument|song|track|album|music/i

function themesOf(imp: Record<string, any>): string[] {
  const raw = [...(imp.insight_themes || []), ...(imp.user_tags || [])]
  const out: string[] = []
  for (const item of raw) {
    if (typeof item !== 'string') continue
    const t = item.replace(/^#/, '').replace(/[_-]+/g, ' ').trim().toLowerCase()
    if (t.length > 2 && t.length < 32 && !LITERAL_BLOCKLIST.test(t) && !out.includes(t)) out.push(t)
  }
  return out.slice(0, 4)
}

function metadataBlock(imp: Record<string, any>, notes: string): string {
  const analysis = imp.analysis_data || {}
  const lines = [
    `- Genre: ${[imp.primary_genre, imp.secondary_genre].filter(Boolean).join(' / ') || 'unknown'}`,
    `- Mood: ${analysis.mood || 'unknown'}`,
    `- Key: ${analysis.simulated_key || 'unknown'} · Tempo: ${analysis.simulated_tempo || 'unknown'} BPM`,
    `- User tags: ${(imp.user_tags || []).join(', ') || 'none'}`,
    `- Insight Timer themes: ${(imp.insight_themes || []).join(', ') || 'none'}`,
    `- Benefits: ${(imp.insight_benefits || []).join(', ') || 'none'}`,
    `- Intended audience: ${imp.insight_audience_level || 'unknown'}`,
    `- Description: ${imp.description || 'none'}`,
    `- Creative notes: ${notes || 'none'}`,
  ]
  return lines.join('\n')
}

function fallbackPrompt(
  direction: ReturnType<typeof cleanDirection>,
  imp: Record<string, any> | null,
  mode: string,
): string {
  const colors = direction.palette.colors
    .map((hex) => `${colorName(hex)} (${hex})`)
    .join(', ')
  // Positively-worded forms. These models have no negative prompt, so softness
  // is requested, never merely forbidden.
  const forms: Record<string, string> = {
    still: 'a quiet near-monochrome field, one or two soft breaths of colour, generous empty space',
    gentle: 'slow overlapping translucent washes and soft-edged organic blooms drifting into one another',
    flowing: 'long sweeping ribbons of wet colour, pigment bleeding and pooling as it travels, layered translucency',
    turbulent: 'churning wet colour colliding and marbling, blooms bursting and softening, dense layered depth',
  }
  const themes = imp ? themesOf(imp) : []
  const analysis = imp?.analysis_data || {}
  const kind = imp?.primary_genre ? String(imp.primary_genre).toLowerCase() : ''
  const detail = [
    analysis.simulated_key ? `in ${analysis.simulated_key}` : '',
    analysis.simulated_tempo ? `at ${analysis.simulated_tempo} BPM` : '',
  ].filter(Boolean).join(' ')
  const article = kind && /^[aeiou]/i.test(kind) ? 'an' : 'a'
  const subject = kind ? `${article} ${kind} piece` : 'the piece'
  const atmosphere = mode === 'metadata' && (kind || detail || themes.length)
    ? ` Translating the atmosphere of ${subject}${detail ? ` ${detail}` : ''}${themes.length ? `, shaped by ${themes.join(', ')},` : ''} into pure colour, light and texture.`
    : ''

  return [
    `Abstract album cover, square 1:1, painted as a ${direction.style}.`,
    `Mood: ${direction.moods.join(', ')}; ${direction.energy} energy.`,
    `Palette: ${direction.palette.name} — ${colors}.`,
    `Form: ${forms[direction.energy] || forms.gentle}.`,
    `Composition: ${direction.composition}, with generous crop-safe margins.`,
    `Surface: ${direction.texture}.`,
    `Light: ${direction.lighting}.`,
    atmosphere.trim(),
    'Absolutely no hard edges, no crisp lines, no geometric shapes — every boundary dissolving rather than drawn, wet bleeding colour with no crisp outlines.',
    'Strictly non-representational: no text, letters, numbers, logos, watermarks, signatures, borders, people, faces, hands, instruments, or recognizable objects.',
    'Hand-painted feel, gallery-quality, ultra-detailed, high resolution, 3000×3000.',
  ].filter(Boolean).join(' ')
}

/** Legacy theme-only prompt (Generative Art Studio uses this). */
async function themePrompt(key: string, theme?: string): Promise<string> {
  const themeInstruction = theme
    ? `The theme/mood is: "${theme}".`
    : 'Choose a random calming, atmospheric theme.'

  const prompt = `You are an expert at writing prompts for AI image generators (like Midjourney, DALL-E, FLUX). Generate a single, detailed prompt for an abstract album cover artwork.

${themeInstruction}

The prompt should describe:
- Abstract, atmospheric artwork (no recognizable objects, people, or text)
- A real physical painting medium, named explicitly (wet-on-wet watercolour, loose ink-and-wash, soft pastel) and how it behaves
- Soft, bleeding, feathered edges — pigment pooling, washes running into one another
- Calming, contemplative mood
- Color palette (specific colors)
- Lighting and atmosphere
- Overall feeling (dreamlike, serene, melancholic, etc.)

Style: painterly and impressionistic, hand-made, minimalist, ethereal. Square format (1:1). No hard edges, no crisp lines, no geometric shapes, no vector flatness. No text, no people, no instruments.

Respond ONLY with the prompt text, nothing else. Keep it under 100 words.`

  const text = await callGemini(key, prompt, 0.9)
  return sanitize(text) || 'A soft, abstract field of muted watercolour, wet pigment bleeding into cold-pressed paper, gentle gradients and hazy light, no hard edges. Square 1:1, no text, no objects.'
}

async function callGemini(key: string, prompt: string, temperature: number): Promise<string> {
  const models = ['gemini-2.5-flash', 'gemini-2.0-flash']
  let lastError = ''
  for (const model of models) {
    try {
      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: 'POST',
          headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { temperature },
          }),
        },
      )
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}))
        lastError = err.error?.message || `HTTP ${resp.status}`
        console.error(`Gemini ${model} failed: ${lastError}`)
        continue
      }
      const data = await resp.json()
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
      if (text.trim()) return text.trim()
      lastError = 'empty response'
    } catch (e: any) {
      lastError = e.message
      console.error(`Gemini ${model} exception:`, e)
    }
  }
  throw new Error(lastError || 'Gemini unavailable')
}

function sanitize(text: string): string {
  return text
    .replace(/```[a-z]*\n?/gi, '')
    .replace(/```/g, '')
    .replace(/^["'“”]+|["'“”]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Missing authorization header')

    const body = await req.json().catch(() => ({}))
    // @ts-expect-error - Deno
    const geminiKey = Deno.env.get('GEMINI_API_KEY')

    // ---------------------------------------------------------------------
    // Legacy mode: { theme } → one creative prompt, no song attached.
    // ---------------------------------------------------------------------
    if (!body.improvisationId) {
      if (!geminiKey) {
        return json({
          error: 'Gemini API key not configured.',
          configured: false,
        }, 503)
      }
      const prompt = await themePrompt(geminiKey, typeof body.theme === 'string' ? body.theme : undefined)
      return json({ success: true, prompt, source: 'gemini' })
    }

    const supabase = createClient(
      // @ts-expect-error - Deno
      Deno.env.get('SUPABASE_URL') ?? '',
      // @ts-expect-error - Deno
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) throw new Error('Unauthorized')

    const { data: imp, error: fetchError } = await supabase
      .from('improvisations')
      .select('*')
      .eq('id', body.improvisationId)
      .single()
    if (fetchError || !imp) return json({ error: 'Improvisation not found' }, 404)
    if (imp.user_id !== user.id) return json({ error: 'Unauthorized' }, 403)

    const mode = body.mode === 'generic' ? 'generic' : 'metadata'
    const direction = cleanDirection(body.direction)

    const notes = (imp.notes || [])
      .map((n: any) => `${n?.title || ''} ${n?.content || ''}`.trim())
      .filter(Boolean)
      .join(' ')

    const cluesUsed = mode === 'generic'
      ? []
      : [
          imp.primary_genre && 'genre',
          imp.secondary_genre && 'secondary genre',
          imp.analysis_data?.mood && 'mood',
          imp.analysis_data?.simulated_key && 'key',
          imp.analysis_data?.simulated_tempo && 'tempo',
          imp.user_tags?.length && `${imp.user_tags.length} tags`,
          imp.description && 'description',
          notes && 'creative notes',
          imp.insight_themes?.length && `${imp.insight_themes.length} themes`,
          imp.insight_benefits?.length && `${imp.insight_benefits.length} benefits`,
          imp.insight_audience_level && 'audience',
        ].filter(Boolean) as string[]

    if (!geminiKey) {
      const prompt = fallbackPrompt(direction, mode === 'metadata' ? imp : null, mode)
      await supabase.from('improvisations').update({ artwork_prompt: prompt }).eq('id', imp.id)
      return json({ success: true, prompt, source: 'fallback', cluesUsed, reason: 'GEMINI_API_KEY not set' })
    }

    const spec = `\n\nAlways describe the medium positively — these models have no negative prompt, so softness must be asked for (wet bleeding, feathered edges, pigment pooling), never merely forbidden. Never describe a hard-edged or geometric result unless the selected style is explicitly hard-edge.`;
  const instruction = `You are a senior art director writing a single image-generation prompt for a square abstract album cover.

SELECTED DIRECTION (honour every line):
- Moods: ${direction.moods.join(', ')}
- Palette: ${direction.palette.name} — ${direction.palette.colors.map((c) => `${colorName(c)} ${c}`).join(', ')}
- Medium / style: ${direction.style}
- Composition: ${direction.composition}
- Surface / texture: ${direction.texture}
- Lighting: ${direction.lighting}
- Energy: ${direction.energy}

${mode === 'metadata' ? `SONG CLUES (translate these into atmosphere; never name the song, the artist, or any object):\n${metadataBlock(imp, notes)}` : 'No song clues for this one: make a self-contained, original abstract direction that matches the selected palette and moods.'}

HARD RULES:
- Purely abstract and non-representational. No recognizable objects, people, faces, hands, instruments, landscapes, buildings, ships, plants or animals.
- No text, letters, numbers, logos, watermarks or signatures.
- Translate emotion into colour, light, texture, composition and movement.
- Name the physical medium and how it behaves (e.g. "wet-on-wet watercolour, pigment pooling, feathered edges, cold-pressed paper"). Material words matter more than adjectives.
- Square 1:1, centred subject with crop-safe margins, ultra-detailed, high resolution.
- 80–120 words, one paragraph, no preamble, no quotation marks, no bullet points.${spec}`

    let prompt = ''
    let source = 'gemini'
    try {
      prompt = sanitize(await callGemini(geminiKey, instruction, 0.85))
    } catch (e: any) {
      console.error('Prompt generation failed, using fallback:', e)
      prompt = fallbackPrompt(direction, mode === 'metadata' ? imp : null, mode)
      source = 'fallback'
    }

    if (!prompt || prompt.length < 40) {
      prompt = fallbackPrompt(direction, mode === 'metadata' ? imp : null, mode)
      source = 'fallback'
    }

    // Models sometimes drop the safety line — enforce it rather than trust it.
    if (source === 'gemini' && !/no text|non-representational|no recognizable/i.test(prompt)) {
      prompt = `${prompt.replace(/\s+$/, '')} Strictly non-representational: no text, letters, logos, watermarks, people, faces, hands, instruments, or recognizable objects.`
    }

    await supabase.from('improvisations').update({ artwork_prompt: prompt }).eq('id', imp.id)

    return json({ success: true, prompt, source, cluesUsed })
  } catch (error: any) {
    console.error('Edge Function error:', error)
    const status = error.message === 'Unauthorized' || error.message === 'Missing authorization header' ? 401 : 500
    return json({ error: error.message }, status)
  }
})
