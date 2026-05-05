import * as ImageManipulator from 'expo-image-manipulator'
import { useStore, type ReadingSection } from './store'

const PALM_ORACLE_URL = process.env.EXPO_PUBLIC_PALM_ORACLE_URL
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY

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
  console.log('[palmReader] Optimizing image:', uri)

  const manipulated = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 1024 } }],
    { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG, base64: true }
  )

  if (!manipulated.base64) {
    throw new Error('Image manipulation failed to produce base64')
  }

  console.log('[palmReader] Image optimized, size:', Math.round(manipulated.base64.length / 1024), 'KB (base64)')
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
  const lines = raw.split('\n')
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

  if (!PALM_ORACLE_URL) {
    throw new Error('EXPO_PUBLIC_PALM_ORACLE_URL is not set')
  }
  if (!SUPABASE_ANON_KEY) {
    throw new Error('EXPO_PUBLIC_SUPABASE_ANON_KEY is not set')
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

  setReadingStatus('streaming')

  const response = await fetch(PALM_ORACLE_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'apikey': SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ imageBase64, userId }),
  })

  if (!response.ok) {
    const errText = await response.text().catch(() => 'Unknown error')
    const msg = `Palm Oracle returned ${response.status}: ${errText}`
    setReadingError(msg)
    setReadingStatus('error')
    throw new Error(msg)
  }

  if (!response.body) {
    throw new Error('No response body for streaming')
  }

  // Read the streaming response
  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8')
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

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    const chunk = decoder.decode(value, { stream: true })
    rawAccumulated += chunk

    // Process chunk line by line to detect section boundaries
    const lines = chunk.split('\n')
    for (const line of lines) {
      const detected = detectSection(line)
      if (detected) {
        // Flush previous section
        if (currentSection && sectionBuffer.trim()) {
          flushSection(currentSection, sectionBuffer)
          sectionBuffer = ''
        }
        currentSection = detected
        updateSection(currentSection, { isStreaming: true, isComplete: false })
      } else if (currentSection) {
        sectionBuffer += line + '\n'
        // Stream partial content to store for live UI
        const partial = stripMarkdownHeaders(sectionBuffer.trim())
        if (partial) {
          updateSection(currentSection, { content: partial, isStreaming: true })
        }
      }
    }
  }

  // Flush last section
  if (currentSection && sectionBuffer.trim()) {
    flushSection(currentSection, sectionBuffer)
  }

  // Parse the full accumulated response into structured result
  const parsed = parseReadingIntoSections(rawAccumulated)
  const result: ReadingResult = { ...parsed, raw: rawAccumulated }

  setReadingStatus('complete')
  return result
}
