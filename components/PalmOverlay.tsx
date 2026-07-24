// PalmOverlay — Skia-based annotation layer drawn over a palm photo.
//
// Accepts approximate normalized (0..1) coordinates from the analyzer and
// renders semi-transparent polylines for the four major palm lines (heart,
// head, life, fate) plus circles for the seven traditional mounts. The layer
// is meant to sit absolutely-positioned over an <Image> at the same dimensions.
//
// Design constraints:
//   - Coordinates are normalized 0..1 to decouple from the actual image pixel
//     size. The caller passes width/height so we can convert at draw time.
//   - Each feature accepts an optional `activeKey` so an interaction layer can
//     emphasize the line/mount whose section the user is currently reading.
//   - When coordinates are missing for a specific feature, we silently skip it
//     rather than drawing a placeholder — better to show "what we know" than
//     fabricate locations.
//   - Strokes are semi-transparent and color-coded per feature for legibility
//     without obscuring the underlying photo.

import { Canvas, Path, Skia, Circle, Group } from '@shopify/react-native-skia'
import type { PalmFeatures, MountKey, PalmLineKey } from '@/lib/palmFeatures'

export interface PalmOverlayProps {
  width: number
  height: number
  features: PalmFeatures | null
  // When set, the named line or mount renders at full opacity and thicker
  // stroke; everything else dims. Useful for "highlight Heart Line while user
  // reads the heart line section" interactions.
  activeKey?: PalmLineKey | MountKey | null
}

// Per-feature stroke/fill colors. Hex with alpha — kept readable over both
// light and dark palm photos without overwhelming the underlying detail.
const LINE_COLORS: Record<PalmLineKey, string> = {
  heart: '#FF5C7A',   // warm rose
  head:  '#4FB7FF',   // sky
  life:  '#7BD389',   // green
  fate:  '#C792EA',   // soft violet
}

const MOUNT_COLORS: Record<MountKey, string> = {
  jupiter: '#FFC93C',
  saturn:  '#8E9AAF',
  apollo:  '#FF8A5C',
  mercury: '#5BC0BE',
  venus:   '#E879A4',
  moon:    '#9AB3F5',
  mars:    '#D9534F',
}

// Stroke width tiers: a base value scaled by image size so the overlay feels
// proportional at 320px-wide thumbnails and 1080px-wide full views alike.
function strokeForSize(width: number, active: boolean): number {
  const base = Math.max(2, width * 0.008)
  return active ? base * 1.8 : base
}

function alphaForActive(isActive: boolean, anyActive: boolean): number {
  if (!anyActive) return 0.65
  return isActive ? 1.0 : 0.25
}

// Convert an array of normalized [x, y] points into a Skia Path.
function makeLinePath(points: Array<[number, number]>, w: number, h: number) {
  const p = Skia.Path.Make()
  if (points.length === 0) return p
  const [sx, sy] = points[0]
  p.moveTo(sx * w, sy * h)
  for (let i = 1; i < points.length; i++) {
    const [x, y] = points[i]
    p.lineTo(x * w, y * h)
  }
  return p
}

export function PalmOverlay({ width, height, features, activeKey }: PalmOverlayProps) {
  if (!features) return null

  const anyActive = activeKey != null

  return (
    <Canvas style={{ width, height, position: 'absolute', top: 0, left: 0 }}>
      {/* Lines */}
      <Group>
        {(['heart', 'head', 'life', 'fate'] as const).map((key) => {
          const pts = features.lines?.[key]
          if (!pts || pts.length < 2) return null
          const isActive = activeKey === key
          const path = makeLinePath(pts, width, height)
          return (
            <Path
              key={`line-${key}`}
              path={path}
              color={LINE_COLORS[key]}
              style="stroke"
              strokeWidth={strokeForSize(width, isActive)}
              strokeJoin="round"
              strokeCap="round"
              opacity={alphaForActive(isActive, anyActive)}
            />
          )
        })}
      </Group>

      {/* Mounts */}
      <Group>
        {(['jupiter', 'saturn', 'apollo', 'mercury', 'venus', 'moon', 'mars'] as const).map((key) => {
          const m = features.mounts?.[key]
          if (!m) return null
          const isActive = activeKey === key
          // Radius scales with prominence and image size; a "0.5 prominence"
          // mount on a 360-wide image renders at ~14px radius.
          const radius = Math.max(8, width * 0.04 * (0.5 + (m.prominence ?? 0.5)))
          return (
            <Group key={`mount-${key}`}>
              <Circle
                cx={m.x * width}
                cy={m.y * height}
                r={radius}
                color={MOUNT_COLORS[key]}
                style="stroke"
                strokeWidth={strokeForSize(width, isActive)}
                opacity={alphaForActive(isActive, anyActive)}
              />
              <Circle
                cx={m.x * width}
                cy={m.y * height}
                r={radius}
                color={MOUNT_COLORS[key]}
                opacity={alphaForActive(isActive, anyActive) * 0.12}
              />
            </Group>
          )
        })}
      </Group>
    </Canvas>
  )
}
