/**
 * Every value worth tuning on a real device (spec 16.5), with the values shipped in 4a–5a.
 * Three-free: the app shell imports the marker look from here.
 */

// Lights. Lambert divides by π; ×π lets a top face lit by both lights read near its token (§13.3).
export const HEMISPHERE_INTENSITY = Math.PI * 0.55
export const DIRECTIONAL_INTENSITY = Math.PI * 0.6

// Sea and cranes.
export const SEA_WAVE_HEIGHT = 0.05
/** How fast the wave pattern moves: 1 = one radian of phase per second. */
export const SEA_WAVE_SPEED = 1
/** Crane jib turn, radians per second. */
export const JIB_TURN_SPEED = 0.6

// Camera (spec §14).
export const FLY_MIN_MS = 450
export const FLY_MAX_MS = 900
export const SPRING_MS = 300
export const FRAMING_MS = 250
/** At the widest point of a hop, both endpoints sit inside this share of the visible area. */
export const HOP_FILL = 0.8
/** Flight time per pixel of on-screen travel, and the travel one zoom doubling counts as. */
export const MS_PER_PX = 0.5
export const PX_PER_DOUBLING = 200
/** The rubber band stretches at most this share of the visible short side. */
export const BAND_SHARE = 0.25

// Edge markers (spec §14.4).
export const INDICATOR_INSET = 28
export const INDICATOR_SPACING = 48
export const MARKER_SIZE_PX = 44
export const MARKER_LOOK = {
  overdue: { button: 'bg-error text-text-on-brand', arrow: 'border-l-error', words: 'overdue' },
  'due-soon': {
    button: 'bg-warning text-text-primary',
    arrow: 'border-l-warning',
    words: 'due soon',
  },
} as const

// Frames.
/** The longest step any animation takes in one frame, in seconds (spec 16.4). */
export const MAX_FRAME_DELTA = 0.1
export const clampDelta = (delta: number): number => Math.min(delta, MAX_FRAME_DELTA)

// Reward effects (spec 16.2).
export const POP_MS = 400
/** Ease-out-back overshoot constant that peaks the pop at 1.15. */
export const POP_BACK = 2.1645
export const FLOAT_RISE = 1.2
export const FLOAT_MS = 1400
export const FLOAT_STAGGER_MS = 150
/** Where a float starts, in world units above the land: over a structure, or over an island. */
export const FLOAT_ABOVE_STRUCTURE = 1.4
/** Clear of the island name label (drawn at 1.6). */
export const FLOAT_ABOVE_ISLAND = 2.4
