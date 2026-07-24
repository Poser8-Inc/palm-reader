// palmFeatures — types + tolerant parser for the analyzer's structured
// coordinate output.
//
// The analyzer (Claude Vision via the palm-oracle edge function) returns a
// prose reading followed by a single fenced JSON block describing approximate
// positions of the major palm features in normalized 0..1 image coordinates.
// We parse that block at the end of streaming, validate generously, and clamp
// out-of-range values to keep the UI safe even if the model hallucinates a
// negative coordinate or skips a key.
//
// The output is consumed by the PalmOverlay Skia component and is also
// persisted to Supabase as a JSON column on the reading row.

export type PalmLineKey = 'heart' | 'head' | 'life' | 'fate'

export type MountKey =
  | 'jupiter'
  | 'saturn'
  | 'apollo'
  | 'mercury'
  | 'venus'
  | 'moon'
  | 'mars'

export interface MountFeature {
  x: number          // 0..1 normalized to image width
  y: number          // 0..1 normalized to image height
  prominence: number // 0..1, drives the rendered circle radius
}

export type HandSide = 'left' | 'right' | 'unknown'

export interface PalmFeatures {
  // Source flag so the UI can distinguish "the AI gave us actual coords for
  // this image" from "we fell back to a generic schematic palm layout".
  source: 'analyzer' | 'schematic_fallback'
  // Which hand the analyzer believes is in the photo. The UI shows two round
  // L/R selectors pre-populated from this value; the user can override.
  hand: HandSide
  lines: Partial<Record<PalmLineKey, Array<[number, number]>>>
  mounts: Partial<Record<MountKey, MountFeature>>
}

// Mirror all x-coordinates around 0.5 to flip the overlay horizontally.
// Used when the user overrides the analyzer's hand detection.
export function mirrorFeatures(f: PalmFeatures): PalmFeatures {
  const lines: PalmFeatures['lines'] = {}
  for (const [k, pts] of Object.entries(f.lines)) {
    if (pts) lines[k as PalmLineKey] = pts.map(([x, y]) => [1 - x, y])
  }
  const mounts: PalmFeatures['mounts'] = {}
  for (const [k, m] of Object.entries(f.mounts)) {
    if (m) mounts[k as MountKey] = { ...m, x: 1 - m.x }
  }
  return {
    ...f,
    hand: f.hand === 'left' ? 'right' : f.hand === 'right' ? 'left' : 'unknown',
    lines,
    mounts,
  }
}

// ─── Parser ─────────────────────────────────────────────────────────────

// Extract the first fenced ```json ... ``` block from `text`, return its body
// or null if none found. Tolerates leading "json" on the same line or on the
// next line, and trailing whitespace.
function extractJsonBlock(text: string): string | null {
  const fenced = /```\s*json\s*([\s\S]*?)```/i.exec(text)
  if (fenced) return fenced[1].trim()
  // Some models drop the language tag — accept the first bare fenced block too,
  // but only if it looks like JSON (starts with { after whitespace).
  const bare = /```\s*([\s\S]*?)```/.exec(text)
  if (bare && /^\s*\{/.test(bare[1])) return bare[1].trim()
  return null
}

function clamp01(n: unknown): number | null {
  if (typeof n !== 'number' || !Number.isFinite(n)) return null
  return Math.max(0, Math.min(1, n))
}

// Validate + coerce a single line's polyline points; drops invalid entries
// rather than throwing. A line with fewer than 2 valid points is rejected.
function parseLinePoints(raw: unknown): Array<[number, number]> | null {
  if (!Array.isArray(raw)) return null
  const out: Array<[number, number]> = []
  for (const item of raw) {
    if (!Array.isArray(item) || item.length < 2) continue
    const x = clamp01(item[0])
    const y = clamp01(item[1])
    if (x === null || y === null) continue
    out.push([x, y])
  }
  return out.length >= 2 ? out : null
}

function parseMount(raw: unknown): MountFeature | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  const x = clamp01(obj.x)
  const y = clamp01(obj.y)
  if (x === null || y === null) return null
  const prominence = clamp01(obj.prominence) ?? 0.5
  return { x, y, prominence }
}

// Parse the analyzer's full raw text into a PalmFeatures object. Returns null
// if no coordinate block was emitted at all — callers can use that as the
// trigger to fall back to the schematic.
export function parsePalmFeatures(rawText: string): PalmFeatures | null {
  const body = extractJsonBlock(rawText)
  if (!body) return null

  let parsed: any
  try {
    parsed = JSON.parse(body)
  } catch {
    return null
  }

  const lines: Partial<Record<PalmLineKey, Array<[number, number]>>> = {}
  const linesIn = parsed?.lines
  if (linesIn && typeof linesIn === 'object') {
    for (const key of ['heart', 'head', 'life', 'fate'] as const) {
      const pts = parseLinePoints(linesIn[key])
      if (pts) lines[key] = pts
    }
  }

  const mounts: Partial<Record<MountKey, MountFeature>> = {}
  const mountsIn = parsed?.mounts
  if (mountsIn && typeof mountsIn === 'object') {
    for (const key of ['jupiter', 'saturn', 'apollo', 'mercury', 'venus', 'moon', 'mars'] as const) {
      const m = parseMount(mountsIn[key])
      if (m) mounts[key] = m
    }
  }

  // Reject completely empty payloads — better to fall back to schematic than
  // render an empty overlay.
  if (Object.keys(lines).length === 0 && Object.keys(mounts).length === 0) {
    return null
  }

  // Hand detection: trust the model when it returns a valid value; default
  // to 'unknown' otherwise (UI surfaces the L/R selector to confirm).
  const handRaw = typeof parsed?.hand === 'string' ? parsed.hand.toLowerCase() : null
  const hand: HandSide =
    handRaw === 'left' || handRaw === 'right' ? handRaw : 'unknown'

  return { source: 'analyzer', hand, lines, mounts }
}

// ─── Schematic fallback ──────────────────────────────────────────────────

// Idealized palm-line geometry used when the analyzer didn't return coords.
// Approximates a right-hand palm in portrait orientation, palm-up: thumb on
// left edge, fingers at top. Heart/head/life arcs hand-drawn; mounts placed
// at conventional positions. Numbers are deliberately conservative so the
// overlay is suggestive rather than presumptive.
const SCHEMATIC_RIGHT_HAND: PalmFeatures = {
  source: 'schematic_fallback',
  hand: 'unknown',
  lines: {
    // Heart line — across upper palm, curves slightly upward toward fingers
    heart: [
      [0.18, 0.32],
      [0.32, 0.30],
      [0.50, 0.28],
      [0.66, 0.27],
      [0.80, 0.28],
    ],
    // Head line — slightly below heart, gentle downward slope
    head: [
      [0.20, 0.45],
      [0.36, 0.45],
      [0.54, 0.46],
      [0.70, 0.48],
      [0.82, 0.51],
    ],
    // Life line — curves around the thumb mound
    life: [
      [0.30, 0.30],
      [0.24, 0.42],
      [0.22, 0.55],
      [0.26, 0.68],
      [0.34, 0.80],
    ],
    // Fate line — vertical from wrist up through center palm
    fate: [
      [0.52, 0.85],
      [0.52, 0.70],
      [0.51, 0.55],
      [0.50, 0.40],
    ],
  },
  mounts: {
    jupiter: { x: 0.27, y: 0.20, prominence: 0.55 },
    saturn:  { x: 0.45, y: 0.16, prominence: 0.50 },
    apollo:  { x: 0.62, y: 0.20, prominence: 0.50 },
    mercury: { x: 0.78, y: 0.24, prominence: 0.45 },
    venus:   { x: 0.20, y: 0.65, prominence: 0.65 },
    moon:    { x: 0.78, y: 0.65, prominence: 0.55 },
    mars:    { x: 0.50, y: 0.55, prominence: 0.45 },
  },
}

// Get a generic schematic to render when the analyzer didn't return coords.
// Today this returns a right-hand layout regardless of which hand was photographed.
// Future: detect left/right via the analyzer and pick a mirrored schematic.
export function schematicPalm(): PalmFeatures {
  return SCHEMATIC_RIGHT_HAND
}
