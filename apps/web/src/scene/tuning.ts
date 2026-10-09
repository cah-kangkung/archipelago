import type { Relief } from '@archipelago/shared'

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

// Adaptive quality (spec 16.3).
/**
 * fps below / above which the monitor declines / inclines. drei's defaults (40 / 60) assume a
 * continuous loop; this scene draws at the 33ms ticker, so they would decline every device.
 */
export const QUALITY_MONITOR_BOUNDS: [lower: number, upper: number] = [22, 28]
/** Real tier changes (high↔low) after which the tier settles on `low` for the page load. */
export const QUALITY_FLIPFLOPS = 3

// Sea dressing (spec 17).
/** Sea plane segments per side; fewer segments make bigger facets. */
export const SEA_SEGMENTS = 96
/** World units from a shallows edge at which the sea reaches its deepest colour. */
export const SEA_DEEP_DISTANCE = 18
/** Side of one scatter cell, in world units; each cell holds at most one prop. */
export const SCATTER_CELL = 6
/** Chance that a cell holds a prop. */
export const SCATTER_FILL = 0.35
/** Share of each prop type among filled cells; sums to 1. */
export const SCATTER_WEIGHTS = { rock: 0.4, islet: 0.15, sandbar: 0.25, buoy: 0.2 } as const
/** Props keep at least this far from any shallows edge. */
export const SCATTER_CLEARANCE = 2
/** Props are scattered up to this far outside the islands' bounds. */
export const SCATTER_EXTENT = 30
export const SCATTER_MAX_PER_TYPE = 80
/** Half the width of open water kept clear along a sea route. */
export const LANE_HALF_WIDTH = 1.5
/** The shortest open-water lane a boat will sail. */
export const MIN_LANE = 3
/** How far outside the shallows a boat sails. */
export const BOAT_OFFSHORE = 0.8
/** Fog starts this far past the islands' farthest corner and is solid FOG_DEPTH later. */
export const FOG_MARGIN = 10
export const FOG_DEPTH = 60

/** Open water beyond the outermost island, in world units: enough to fill a desktop viewport at
 * archipelago zoom. The cloud deck's plane reaches as far. */
export const SEA_MARGIN = 250
/** Corner opacity of the CSS vignette. */
export const VIGNETTE_ALPHA = 0.25
/** World units per second. */
export const BOAT_SPEED = 1.2
export const GULL_SPEED = 2.5
export const GULL_HEIGHT = 3.2
/** Gull circle radius as a share of the island's extent. */
export const GULL_ORBIT = 0.6
/** Seconds between whale breaches, chosen per world from this range. */
export const WHALE_INTERVAL_S: readonly [min: number, max: number] = [25, 40]
export const WHALE_BREACH_S = 2.4
/** The whale surfaces at least this far from every shallows edge. */
export const WHALE_CLEARANCE = 6
export const FOAM_WIDTH = 0.5
export const FOAM_OPACITY = 0.45
export const FOAM_PULSE = 0.15
export const FOAM_PULSE_S = 4

// Island growth (spec 18).
/** Finished tasks at which an island reaches stages 1, 2, 3 and 4. */
export const GROWTH_THRESHOLDS = [3, 8, 15, 30] as const
/** Share of free interior hexes holding scenery, per stage 0–4. */
export const GROWTH_FILL = [0.05, 0.2, 0.4, 0.6, 0.75] as const
/** Shore hexes fill at this share of the interior rate. */
export const SHORE_FILL = 0.5
/** Hills rise in steps of this many world units. */
export const HILL_STEP = 0.15
/** Tallest hill above LAND_HEIGHT, per stage. */
export const HILL_MAX = [0.15, 0.3, 0.4, 0.5, 0.6] as const
/** Each relief profile's share of the stage's hill cap (spec 24.3). */
export const RELIEF_FACTOR: Readonly<Record<Relief, number>> = {
  flattened: 0.5,
  spherical: 1,
  conical: 1.5,
  cylindrical: 1,
}
/** World units across one hill of the noise lattice. */
export const HILL_SCALE = 4
/** Meadow share of interior grass, per stage. */
export const MEADOW_SHARE = [0.1, 0.15, 0.2, 0.3, 0.35] as const
/** Scenery type shares per zone; each zone sums to 1. */
export const SCENERY_WEIGHTS = {
  inland: { tree: 0.45, flowers: 0.25, grass: 0.3 },
  edge: { bush: 0.6, rock: 0.4 },
  shore: { rock: 0.4, reeds: 0.35, driftwood: 0.25 },
} as const
/** Pieces of a cluster sit at most this far from their hex centre. */
export const CLUSTER_OFFSET = 0.55
export const SCENERY_SCALE: readonly [min: number, max: number] = [0.8, 1.2]
export const GROW_IN_MS = 600

// Labels: outside the current layer they fade.
/** Labels whose anchor is outside the layer. */
export const SPOTLIGHT_LABEL_OPACITY = 0.6

// Cloud deck (spec 23): a cloud layer over the world with a hole the shape of the current layer.
/** The deck's opacity at full strength. */
export const CLOUD_DECK_ALPHA = 0.85
/** The deck's strength on an island: a veil, no hole (spec 23.8). */
export const CLOUD_VEIL = 0.65
/** The deck's strength on the archipelago: a lighter veil. */
export const CLOUD_ARCHIPELAGO_VEIL = 0.47
/** From the hole's edge to full cloud, in world units: two hexes. */
export const CLOUD_DECK_FEATHER = 2 * Math.sqrt(3)
/** World units per base noise cell of the clouds (spec 23.8). */
export const CLOUD_DECK_SCALE = 9
/** Noise octaves summed per fbm. */
export const CLOUD_DECK_OCTAVES = 5
/** How far, in noise cells, a coarser fbm bends the cloud shapes. */
export const CLOUD_DECK_WARP = 0.6
/** World units per noise cell of the slow density banks. */
export const CLOUD_DECK_BANK_SCALE = 60
/** How far the banks shift the threshold either way: thicker banks, thinner sky. */
export const CLOUD_DECK_BANK = 0.25
/** The width of a cloud's soft edge, in fbm units. */
export const CLOUD_DECK_SOFT = 0.18
/** Density threshold on an island and in a district: higher is sparser. */
export const CLOUD_THRESHOLD = 0.5
/** Density threshold on the archipelago: sparser than an island. */
export const CLOUD_ARCHIPELAGO_THRESHOLD = 0.58
/** The drift wraps here (world units), keeping the noise inputs small for float precision. */
export const CLOUD_DECK_DRIFT_WRAP = 4500
/** Drift speed along (1, 1), world units per second (`high` tier only). */
export const CLOUD_DECK_DRIFT = 0.2
/** The deck fading or its hole sliding between layers, in ms. */
export const CLOUD_MS = 600

/** The district ring's ribbon (spec 24.5): its width, its inset from the tile edge, its lift. */
export const DISTRICT_RING_WIDTH = 0.15
export const DISTRICT_RING_INSET = 0.05
export const DISTRICT_RING_LIFT = 0.02
