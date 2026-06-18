import * as ImageManipulator from 'expo-image-manipulator'
import { useStore, type ReadingSection } from './store'
import { log } from './log'
import { getAccessToken } from './supabase'
import { parsePalmFeatures, schematicPalm } from './palmFeatures'

const PALM_ORACLE_URL = process.env.EXPO_PUBLIC_PALM_ORACLE_URL
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY

if (__DEV__) {
  if (!PALM_ORACLE_URL) {
    log.warn(
      '[palmReader] EXPO_PUBLIC_PALM_ORACLE_URL is missing from the environment. ' +
      'The reading feature will fail at runtime. Check .env and rebuild.'
    )
  }
  if (!SUPABASE_ANON_KEY) {
    log.warn(
      '[palmReader] EXPO_PUBLIC_SUPABASE_ANON_KEY is missing from the environment. ' +
      'The reading feature will fail at runtime. Check .env and rebuild.'
    )
  }
}

export interface ReadingResult {
  heart_line: string
  head_line: string
  life_line: string
  fate_line: string
  mounts: string
  overall: string
  raw: string
}

// Optimize image: resize to 1024px max, convert to jpeg, return base64
export async function optimizeImage(uri: string): Promise<string> {
  log.debug('[palmReader] Optimizing image:', uri)

  const manipulated = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 1024 } }],
    { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG, base64: true }
  )

  if (!manipulated.base64) {
    throw new Error('Image manipulation failed to produce base64')
  }

  log.debug('[palmReader] Image optimized, size:', Math.round(manipulated.base64.length / 1024), 'KB (base64)')
  return manipulated.base64
}

// Create a small thumbnail for local storage/history display
export async function createThumbnail(uri: string): Promise<string> {
  const manipulated = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 120 } }],
    { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true }
  )
  return manipulated.base64 ?? ''
}

// Section header markers we look for in the streamed response
const SECTION_MARKERS: { key: ReadingSection['key']; patterns: string[] }[] = [
  { key: 'heart_line', patterns: ['## Heart Line', '**Heart Line**', 'HEART LINE'] },
  { key: 'head_line', patterns: ['## Head Line', '**Head Line**', 'HEAD LINE'] },
  { key: 'life_line', patterns: ['## Life Line', '**Life Line**', 'LIFE LINE'] },
  { key: 'fate_line', patterns: ['## Fate Line', '**Fate Line**', 'FATE LINE'] },
  { key: 'mounts', patterns: ['## The Mounts', '**The Mounts**', 'THE MOUNTS', '## Mounts'] },
  { key: 'overall', patterns: ['## Overall', '**Overall', 'OVERALL READING', '## Summary'] },
]

function detectSection(text: string): ReadingSection['key'] | null {
  const upper = text.toUpperCase()
  for (const { key, patterns } of SECTION_MARKERS) {
    for (const p of patterns) {
      if (upper.includes(p.toUpperCase())) return key
    }
  }
  return null
}

function stripMarkdownHeaders(text: string): string {
  return text
    .replace(/^#{1,3}\s+/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .trim()
}

// Strip the feature-coordinate JSON block (and its `## Feature Coordinates`
// header, if present) from the response. The streaming path already skips it
// via a sentinel, but the post-stream reconciler needs the same treatment or
// it dumps the JSON into whatever section was last detected (usually overall).
function stripFeatureBlock(raw: string): string {
  const fenceIdx = raw.search(/```/)
  const headerIdx = raw.search(/^##\s*Feature Coordinates/m)
  const candidates = [fenceIdx, headerIdx].filter((i) => i >= 0)
  if (candidates.length === 0) return raw
  const cutAt = Math.min(...candidates)
  return raw.slice(0, cutAt)
}

// Parse raw reading text into structured sections
export function parseReadingIntoSections(raw: string): Omit<ReadingResult, 'raw'> {
  const result: Omit<ReadingResult, 'raw'> = {
    heart_line: '',
    head_line: '',
    life_line: '',
    fate_line: '',
    mounts: '',
    overall: '',
  }

  // Split by double-newline or section headers
  const lines = stripFeatureBlock(raw).split('\n')
  let currentSection: ReadingSection['key'] | null = null
  const sectionBuffers: Partial<Record<ReadingSection['key'], string[]>> = {}

  for (const line of lines) {
    const detected = detectSection(line)
    if (detected) {
      currentSection = detected
      if (!sectionBuffers[currentSection]) {
        sectionBuffers[currentSection] = []
      }
      continue
    }
    if (currentSection) {
      sectionBuffers[currentSection] = sectionBuffers[currentSection] ?? []
      sectionBuffers[currentSection]!.push(line)
    }
  }

  for (const key of Object.keys(result) as (keyof typeof result)[]) {
    const buf = sectionBuffers[key as ReadingSection['key']]
    if (buf && buf.length > 0) {
      result[key] = stripMarkdownHeaders(buf.join('\n').trim())
    }
  }

  return result
}

// Main streaming reading function
// Calls the palm-oracle edge function, streams the response,
// and updates the Zustand store sections in real time.
export async function readPalm(
  imageUri: string,
  userId: string,
  onProgress?: (sectionKey: ReadingSection['key'], chunk: string) => void
): Promise<ReadingResult> {
  const { setReadingStatus, setReadingError, updateSection } = useStore.getState()

  if (!PALM_ORACLE_URL || !SUPABASE_ANON_KEY) {
    const missing = !PALM_ORACLE_URL ? 'EXPO_PUBLIC_PALM_ORACLE_URL' : 'EXPO_PUBLIC_SUPABASE_ANON_KEY'
    log.warn('[palmReader] Missing env var:', missing)
    throw new Error('Reading service is not configured. Please reinstall or contact support.')
  }

  setReadingStatus('loading')

  let imageBase64: string
  try {
    imageBase64 = await optimizeImage(imageUri)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Image optimization failed'
    setReadingError(msg)
    setReadingStatus('error')
    throw new Error(msg)
  }

  // Match server-side limit at supabase/functions/palm-oracle/index.ts:90
  const MAX_IMAGE_BASE64_BYTES = 5_500_000
  if (imageBase64.length > MAX_IMAGE_BASE64_BYTES) {
    const msg = 'Your photo is too large. Please try again with a smaller image.'
    setReadingError(msg)
    setReadingStatus('error')
    throw new Error(msg)
  }

  setReadingStatus('streaming')

  const accessToken = await getAccessToken()
  const response = await fetch(PALM_ORACLE_URL, {
    method: 'POST',
    // RN-specific: opt into response.body streaming on Android (off by default)
    // @ts-ignore — reactNative is RN-only fetch option, not in fetch types
    reactNative: { textStreaming: true },
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'apikey': SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ imageBase64, userId }),
  })

  if (!response.ok) {
    let serverCode: string | undefined
    let serverError: string | undefined
    try {
      const ct = response.headers.get('content-type') ?? ''
      if (ct.includes('application/json')) {
        const errBody = await response.json()
        serverCode = errBody?.code
        serverError = errBody?.error
      } else {
        serverError = await response.text()
      }
    } catch {
      // body parse failed — fall through with undefineds
    }

    let userMessage: string
    switch (response.status) {
      case 413:
        userMessage = 'Your photo is too large. Please try again with a smaller image.'
        break
      case 402:
        userMessage = 'You\'ve used your free readings. Upgrade to premium for unlimited.'
        break
      case 502:
      case 503:
      case 504:
        userMessage = 'The reading service is temporarily unavailable. Please try again in a moment.'
        break
      default:
        userMessage = 'Something went wrong reading your palm. Please try again.'
    }

    log.warn(
      '[palmReader] Palm Oracle error',
      response.status,
      serverCode ?? '(no code)',
      serverError ?? '(no body)'
    )

    setReadingError(userMessage)
    setReadingStatus('error')
    throw new Error(userMessage)
  }

  let rawAccumulated = ''
  let currentSection: ReadingSection['key'] | null = null
  let sectionBuffer = ''

  const flushSection = (key: ReadingSection['key'], content: string) => {
    const cleaned = stripMarkdownHeaders(content.trim())
    if (cleaned) {
      updateSection(key, { content: cleaned, isStreaming: false, isComplete: true })
      onProgress?.(key, cleaned)
    }
  }

  const processLine = (line: string) => {
    // Sentinel: once we see the Feature Coordinates marker or the start of a
    // JSON code fence, stop appending to any displayed section. The JSON
    // block at the tail of the response is parsed from rawAccumulated, but
    // never shown to the user.
    if (line.startsWith('## Feature Coordinates') || line.trimStart().startsWith('```')) {
      if (currentSection && sectionBuffer.trim()) {
        flushSection(currentSection, sectionBuffer)
        sectionBuffer = ''
      }
      currentSection = null
      return
    }

    const detected = detectSection(line)
    if (detected) {
      if (currentSection && sectionBuffer.trim()) {
        flushSection(currentSection, sectionBuffer)
        sectionBuffer = ''
      }
      currentSection = detected
      updateSection(currentSection, { isStreaming: true, isComplete: false })
    } else if (currentSection) {
      sectionBuffer += line + '\n'
      const partial = stripMarkdownHeaders(sectionBuffer.trim())
      if (partial) {
        updateSection(currentSection, { content: partial, isStreaming: true })
      }
    }
  }

  if (!response.body) {
    // Some Android networks / RN 0.76 textStreaming opt-in return null body with 200 OK.
    // Fall back to non-streaming: read the full text once, process as a single batch.
    log.warn('[palmReader] response.body null — falling back to text()')
    const fullText = await response.text()
    if (!fullText) {
      const msg = 'Something went wrong reading your palm. Please try again.'
      setReadingError(msg)
      setReadingStatus('error')
      throw new Error('[palmReader] Empty response body')
    }
    rawAccumulated = fullText
    for (const line of fullText.split('\n')) processLine(line)
  } else {
    const reader = response.body.getReader()
    const decoder = new TextDecoder('utf-8')

    // Streaming reads arrive in arbitrary byte chunks; they almost never align
    // to newline boundaries. If a section header like "## Overall Reading"
    // straddles a chunk boundary, splitting each chunk on '\n' breaks the
    // header into two non-matching fragments and the section is never detected
    // (content gets misrouted into the previous section). Buffer partial lines
    // across iterations so processLine only ever sees complete lines.
    let leftover = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const chunk = decoder.decode(value, { stream: true })
      rawAccumulated += chunk

      const combined = leftover + chunk
      const lines = combined.split('\n')
      leftover = lines.pop() ?? ''
      for (const line of lines) processLine(line)
    }

    if (leftover) processLine(leftover)
  }

  // Flush last section
  if (currentSection && sectionBuffer.trim()) {
    flushSection(currentSection, sectionBuffer)
  }

  // Parse the full accumulated response into structured result.
  const parsed = parseReadingIntoSections(rawAccumulated)

  // Reconciliation: backfill any store sections the streaming detector missed.
  // The post-stream parser sees the full text and is authoritative; the
  // streaming path can drop a section if its header straddled a chunk boundary
  // (defense-in-depth on top of the leftover-buffering fix above).
  for (const key of ['heart_line', 'head_line', 'life_line', 'fate_line', 'mounts', 'overall'] as const) {
    const text = parsed[key]
    if (text && text.trim()) {
      updateSection(key, { content: text, isStreaming: false, isComplete: true })
    }
  }

  // Parse the structured feature-coordinate block at the tail of the response.
  // Falls back to a schematic right-hand layout if the analyzer omitted coords
  // or emitted unparseable JSON.
  const setFeatures = useStore.getState().setFeatures
  try {
    const features = parsePalmFeatures(rawAccumulated) ?? schematicPalm()
    setFeatures(features)
  } catch (err) {
    log.warn('[palmReader] feature parse failed; using schematic:', err)
    setFeatures(schematicPalm())
  }

  const result: ReadingResult = { ...parsed, raw: rawAccumulated }

  setReadingStatus('complete')
  return result
}
