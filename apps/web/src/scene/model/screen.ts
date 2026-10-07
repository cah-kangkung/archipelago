/** A camera view: the ground point it looks at and its orthographic zoom (pixels per world unit). */
export type View = { x: number; z: number; zoom: number }

/**
 * The canvas in CSS pixels. `covered` is how much of its bottom the phone sheet hides; `framed` is
 * the part of that cover the camera centres around (capped, see `framedCover`).
 */
export type Frame = { width: number; height: number; covered: number; framed: number }

const SQRT2 = Math.SQRT2
const SQRT6 = Math.sqrt(6)

/** Screen offset in px (x right, y down) of a ground offset under the isometric camera. */
export function toScreen(dx: number, dz: number, zoom: number): { sx: number; sy: number } {
  return { sx: (zoom * (dx - dz)) / SQRT2, sy: (zoom * (dx + dz)) / SQRT6 }
}

/** The ground offset that lands at screen offset (sx, sy). */
export function fromScreen(sx: number, sy: number, zoom: number): { dx: number; dz: number } {
  const diff = (sx * SQRT2) / zoom
  const sum = (sy * SQRT6) / zoom
  return { dx: (sum + diff) / 2, dz: (sum - diff) / 2 }
}

/** At most this share of the window height of sheet cover is framed around (spec §14.3). */
export const MAX_FRAMED_SHARE = 0.5

export function framedCover(covered: number, windowHeight: number): number {
  return Math.max(0, Math.min(covered, windowHeight * MAX_FRAMED_SHARE))
}

/** Where the look-at point lands on the canvas: the middle of the framed area. */
export function viewCentre(frame: Frame): { x: number; y: number } {
  return { x: frame.width / 2, y: (frame.height - frame.framed) / 2 }
}

/** The part of the canvas the sheet does not cover. */
export function visibleSize(frame: Frame): { width: number; height: number } {
  return { width: frame.width, height: Math.max(0, frame.height - frame.covered) }
}
