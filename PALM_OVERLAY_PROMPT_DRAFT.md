# Palm Reader — Overlay Feature Integration Plan

Status: drafted while vc=11 (summary bug fix) builds. Ships as **vc=12** after Kris reviews.

## What changes

Three new files (already written):

- `components/PalmOverlay.tsx` — Skia-based annotation layer. Renders semi-transparent polylines for the four major lines (heart/head/life/fate) and circles for the seven mounts (jupiter/saturn/apollo/mercury/venus/moon/mars), positioned in normalized 0..1 coords over the user's image.
- `lib/palmFeatures.ts` — types + tolerant parser. Extracts a fenced JSON block from the analyzer's response, validates and clamps values, and falls back to `schematicPalm()` (a hand-drawn right-hand geometry) when no coords were returned.
- *This doc* — the prompt change that makes the analyzer emit coords.

One edge function edit (proposed below, not yet applied):

- `supabase/functions/palm-oracle/index.ts` — append a coordinate-output section to `PALMIST_SYSTEM_PROMPT`.

One screen edit (proposed, not yet applied):

- `app/reading.tsx` — wrap the existing `<Image>` of the palm in a `<View>` with `<PalmOverlay>` overlayed at the same dimensions. Pull `features` from store. Optionally use `activeKey` to highlight a feature when its section is being read.

## Proposed system prompt addition

Append this to `PALMIST_SYSTEM_PROMPT` immediately before the closing tone-and-style paragraph:

```
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

Use this exact format inside a single ```json code block:

## Feature Coordinates
```json
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
```

The "hand" field must be one of "left", "right", or "unknown".

Each line is a polyline of 3-6 [x, y] points tracing along the line as you
see it. Each mount is a single point with a "prominence" value from 0.0
(barely visible) to 1.0 (very pronounced) — this controls how prominently
the mount is rendered in the overlay.
```

## Hand selector UI (post-capture)

Below the captured palm thumbnail on the reading screen, render a hand
selector with two round buttons positioned at the **extreme left and right
edges** of a horizontal strip. The spatial position itself is the affordance —
"L" on the far left of the screen means left hand, "R" on the far right means
right hand. No chance of confusion.

- Pre-select based on the analyzer's `hand` field. Unknown → neither
  selected, prompt the user to choose before the overlay renders.
- Tapping the unselected option mirrors the overlay coordinates around the
  vertical centerline (mount.x → 1-mount.x, polyline points flipped). The
  prose reading does not change — only the visual overlay.
- The selected side has a filled circle + label color matching the active
  feature scheme; the unselected side is a hollow ring.
- The full half-screen on each side is the tap target so it is easy to hit
  one-handed.
- Persist the user's choice on the reading row in Supabase so subsequent
  views of the same reading render with the corrected orientation.

## Why this format

- **Fenced JSON block** at the very end of the response — does not disrupt the
  streaming prose UX. The user reads the Overall Reading section, then the
  parser silently picks up the coordinate block once streaming completes.
- **Normalized 0..1 coords** — decouples from image pixel dimensions; the same
  reading renders correctly on a 320px thumbnail and a 1080px full view.
- **Polylines, not single points, for lines** — the major palm lines curve
  significantly; one point per line would be unusable. 3-6 points produces a
  visibly correct trace without requiring high model precision.
- **"omit any feature you cannot identify"** — explicitly licenses the model
  to skip rather than fabricate, which keeps the overlay honest. The parser
  drops missing keys cleanly.
- **Schematic fallback** in `palmFeatures.ts` — if the model skips the JSON
  entirely or emits garbage, the UI renders a conventional right-hand palm
  layout so users see *something* useful. The PalmFeatures.source flag tells
  the UI which it is — we could subtly label "approximate landmarks" when on
  the schematic.

## What I need from you

1. Read the prompt addition. Refine the wording — your call on tone and
   precision. (I tried to mirror the existing prompt's "warm, specific" voice
   while being technical where the JSON spec requires it.)
2. Confirm the visual treatment in `PalmOverlay.tsx` — colors, opacity,
   stroke weights. Easy to tune.
3. After your sign-off: I'll bake the prompt into the edge function, wire
   `<PalmOverlay>` into `app/reading.tsx`, parse coords from the stream in
   `lib/palmReader.ts`, add a `feature_coords` column to the Supabase readings
   table, ship as vc=12.
