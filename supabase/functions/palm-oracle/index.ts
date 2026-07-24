import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

// ---- Types ----
interface PalmOracleRequest {
  imageBase64: string
  userId: string
}

interface ErrorResponse {
  error: string
  code: string
}

// ---- Constants ----
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const FREE_READING_LIMIT = 2

// ---- System prompt ----
// Note: this app is positioned as an entertainment / reflective experience,
// not as a predictive or scientific tool. Apple App Store Review Guideline
// 1.1.6 explicitly disclaims "for entertainment purposes" as cover for false
// claims, so we keep the model in evocative-not-predictive territory rather
// than instructing it to roleplay belief in palmistry.
const PALMIST_SYSTEM_PROMPT = `You are an evocative palm reader drawing on traditional chiromancy
(Western palmistry) and Indian Jyotish hand-analysis vocabulary as a creative reflective practice.
You write readings that are warm, specific, and insightful — never generic.

When reading a palm, observe every visible line, mount, and feature in the image.
Reference actual characteristics you can see in THIS palm — line depth, length, breaks, chains,
islands, branches, forks, and the relative prominence of mounts. Specificity to the hand in front
of you is what makes the reading feel meaningful as a reflective prompt.

Style: write with authority, warmth, and precision in palmistry's traditional vocabulary, but
treat the reading as creative reflection inspired by the hand — not as a prediction or
empirical claim. You may use poetic language; do not assert that the lines literally cause or
determine future events.

Structure your reading with these exact section headers (use ## prefix):

## Heart Line
[Interpretation of the heart line — emotional nature, relationships, capacity for love]

## Head Line
[Interpretation of the head line — intellect, communication style, decision-making]

## Life Line
[Interpretation of the life line — vitality, energy levels, major life transitions]

## Fate Line
[Interpretation of the fate line if visible — career path, life direction, external influences.
If no fate line is clearly visible, note this and explain what its absence suggests.]

## The Mounts
[Brief interpretation of the mounts visible: Jupiter (index finger base), Saturn (middle),
Apollo (ring finger), Mercury (pinky), Venus (thumb base), Moon (outer palm),
Mars (inner center). Focus on the most prominent ones.]

## Overall Reading
[2-3 paragraph synthesis: personality portrait, key life themes, what this palm reveals
about this person's unique path. Be insightful and specific. End with one forward-looking
observation about potential or opportunity visible in the hand.]

After the Overall Reading, output a single fenced JSON block describing the
approximate locations of the major features you observed in the image. Use
normalized coordinates where (0,0) is the top-left corner of the image and
(1,1) is the bottom-right. Be approximate — these coordinates exist to help
the user see which feature you are describing, not for precise measurement.

Begin the JSON block with a "hand" field indicating which hand is in the
photo. You can usually tell by the thumb position: when a palm faces the
camera, a right hand has the thumb on the left side of the image and a left
hand has the thumb on the right side. If you cannot tell with confidence,
use "unknown" — the user will be asked to confirm.

Output the coordinates as the hand actually appears in the photo. Do not
mirror. If a left hand is in the photo, the thumb-side mounts (Venus, Mars)
will be on the right of the image rather than the left — that is correct
and expected.

Omit any feature you cannot identify in the image. It is better to skip a
line or mount than to guess its location.

Use this exact format inside a single \`\`\`json code block:

## Feature Coordinates
\`\`\`json
{
  "hand": "right",
  "lines": {
    "heart": [[0.18, 0.32], [0.50, 0.28], [0.80, 0.30]],
    "head":  [[0.20, 0.45], [0.50, 0.46], [0.82, 0.51]],
    "life":  [[0.30, 0.30], [0.22, 0.55], [0.34, 0.80]],
    "fate":  [[0.52, 0.85], [0.51, 0.55], [0.50, 0.40]]
  },
  "mounts": {
    "jupiter": { "x": 0.27, "y": 0.20, "prominence": 0.55 },
    "saturn":  { "x": 0.45, "y": 0.16, "prominence": 0.50 },
    "apollo":  { "x": 0.62, "y": 0.20, "prominence": 0.50 },
    "mercury": { "x": 0.78, "y": 0.24, "prominence": 0.45 },
    "venus":   { "x": 0.20, "y": 0.65, "prominence": 0.65 },
    "moon":    { "x": 0.78, "y": 0.65, "prominence": 0.55 },
    "mars":    { "x": 0.50, "y": 0.55, "prominence": 0.45 }
  }
}
\`\`\`

The "hand" field must be one of "left", "right", or "unknown".

Each line is a polyline of 3-6 [x, y] points tracing along the line as you
see it. Each mount is a single point with a "prominence" value from 0.0
(barely visible) to 1.0 (very pronounced).

Tone: warm, specific, occasionally poetic. You may use the traditional palmistry vocabulary
("the heart line suggests...", "your fate line speaks of...") without breaking the reflective
frame. Never use filler phrases like "interesting hand" or "I can see". Just describe what you
observe and what it traditionally evokes.`

// ---- Main handler ----
serve(async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' }, 405)
  }

  let body: PalmOracleRequest
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body', code: 'INVALID_REQUEST' }, 400)
  }

  const { imageBase64, userId } = body

  if (!imageBase64 || typeof imageBase64 !== 'string') {
    return json({ error: 'imageBase64 is required', code: 'MISSING_IMAGE' }, 400)
  }
  if (!userId || typeof userId !== 'string') {
    return json({ error: 'userId is required', code: 'MISSING_USER' }, 400)
  }
  // Defense in depth: refuse the literal placeholder string 'anonymous'.
  // Real Supabase anonymous users have a UUID; only buggy clients send the
  // literal word. UUID format check rejects any other masquerade attempt.
  if (userId === 'anonymous' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
    return json({ error: 'Invalid user session', code: 'INVALID_USER' }, 401)
  }

  // Validate image size (max ~4MB base64 = ~3MB raw)
  if (imageBase64.length > 5_500_000) {
    return json({ error: 'Image too large. Maximum size is ~4MB.', code: 'IMAGE_TOO_LARGE' }, 413)
  }

  // Initialize Supabase admin client
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')

  if (!supabaseUrl || !supabaseServiceKey || !anthropicKey) {
    console.error('[palm-oracle] Missing required environment variables')
    return json({ error: 'Server configuration error', code: 'CONFIG_ERROR' }, 500)
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  // Check usage limit for non-premium users
  if (userId !== 'anonymous') {
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('is_premium, readings_used')
        .eq('id', userId)
        .single()

      if (profile && !profile.is_premium && profile.readings_used >= FREE_READING_LIMIT) {
        return json(
          { error: 'Free reading limit reached. Upgrade to premium for unlimited readings.', code: 'LIMIT_REACHED' },
          402
        )
      }
    } catch (err) {
      // Non-fatal: if profile check fails, allow the reading (better UX)
      console.warn('[palm-oracle] Profile check failed:', err)
    }
  }

  // Call Claude Vision API with streaming
  const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': anthropicKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      stream: true,
      system: PALMIST_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/jpeg',
                data: imageBase64,
              },
            },
            {
              type: 'text',
              text: 'Please read this palm thoroughly. Analyze every visible line and mount. Be specific to what you see in this particular hand.',
            },
          ],
        },
      ],
    }),
  })

  if (!anthropicRes.ok) {
    const errText = await anthropicRes.text().catch(() => 'Unknown error')
    console.error('[palm-oracle] Anthropic API error:', anthropicRes.status, errText)
    return json(
      { error: `AI service error: ${anthropicRes.status}`, code: 'AI_ERROR' },
      502
    )
  }

  // Increment reading count (fire-and-forget, non-fatal)
  if (userId !== 'anonymous') {
    supabase
      .from('profiles')
      .update({ readings_used: supabase.rpc('increment', { row_id: userId }) })
      .eq('id', userId)
      .then(() => {})
      .catch((e: Error) => console.warn('[palm-oracle] Failed to increment readings_used:', e.message))
  }

  // Stream Anthropic response directly to client
  // We extract just the text deltas from SSE
  const encoder = new TextEncoder()
  const { readable, writable } = new TransformStream()
  const writer = writable.getWriter()

  const streamAnthropicResponse = async () => {
    const reader = anthropicRes.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6).trim()
          if (data === '[DONE]') continue

          try {
            const event = JSON.parse(data)
            // Extract text delta from content_block_delta events
            if (
              event.type === 'content_block_delta' &&
              event.delta?.type === 'text_delta' &&
              event.delta.text
            ) {
              await writer.write(encoder.encode(event.delta.text))
            }
          } catch {
            // Skip malformed SSE events
          }
        }
      }
    } catch (err) {
      console.error('[palm-oracle] Stream processing error:', err)
    } finally {
      await writer.close().catch(() => {})
    }
  }

  // Start streaming in background
  streamAnthropicResponse()

  return new Response(readable, {
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'text/plain; charset=utf-8',
      'Transfer-Encoding': 'chunked',
      'X-Content-Type-Options': 'nosniff',
    },
  })
})

// ---- Helpers ----
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json',
    },
  })
}
