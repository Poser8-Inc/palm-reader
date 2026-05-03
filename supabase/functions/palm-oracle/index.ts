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
const PALMIST_SYSTEM_PROMPT = `You are an expert palmist with 40 years of experience reading palms.
You combine traditional chiromancy (Western palmistry) with insights from Indian Jyotish hand analysis.
You are warm, specific, and insightful — never generic.

When reading a palm, analyze every visible line, mount, and feature in the image.
Be specific to what you actually see in THIS palm — reference actual characteristics like line depth,
length, breaks, chains, islands, branches, forks, and the relative prominence of mounts.

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

Tone: warm, specific, occasionally poetic. Avoid disclaimers about palmistry being non-scientific.
Write as if you genuinely believe and practice this art. Never use filler phrases like
"interesting hand" or "I can see". Just describe what you observe and what it means.`

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
