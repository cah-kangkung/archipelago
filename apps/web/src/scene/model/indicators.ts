import { type Frame, toScreen, type View, viewCentre, visibleSize } from './screen'

export type Urgency = 'overdue' | 'due-soon'
export type IslandUrgency = { projectId: string; name: string; urgency: Urgency; count: number }
/** An urgent island placed in the world: its origin and how far its shore reaches. */
export type UrgentIsland = IslandUrgency & { x: number; z: number; extent: number }
/** A marker's centre in canvas px and the direction (radians, clockwise from right) it points. */
export type EdgeIndicator = IslandUrgency & { left: number; top: number; angle: number }

export const INDICATOR_INSET = 28
export const INDICATOR_SPACING = 48

type Rect = { left: number; top: number; right: number; bottom: number }
type Placed = { island: UrgentIsland; target: { x: number; y: number }; s: number }

/** Distance clockwise around `rect` from its top-left corner to a point on its border. */
function toPerimeter(rect: Rect, x: number, y: number): number {
  const w = rect.right - rect.left
  const h = rect.bottom - rect.top
  if (y <= rect.top) return x - rect.left
  if (x >= rect.right) return w + (y - rect.top)
  if (y >= rect.bottom) return w + h + (rect.right - x)
  return 2 * w + h + (rect.bottom - y)
}

function fromPerimeter(rect: Rect, s: number): { x: number; y: number } {
  const w = rect.right - rect.left
  const h = rect.bottom - rect.top
  const around = 2 * (w + h)
  const d = ((s % around) + around) % around
  if (d <= w) return { x: rect.left + d, y: rect.top }
  if (d <= w + h) return { x: rect.right, y: rect.top + (d - w) }
  if (d <= 2 * w + h) return { x: rect.right - (d - w - h), y: rect.bottom }
  return { x: rect.left, y: rect.bottom - (d - 2 * w - h) }
}

/**
 * Markers for urgent islands that lie wholly outside the visible canvas: each sits where a ray from
 * the middle of the visible area toward its island meets the inset border (spec §14.4).
 */
export function edgeIndicators(
  islands: readonly UrgentIsland[],
  view: View,
  frame: Frame,
): EdgeIndicator[] {
  const visible = visibleSize(frame)
  const centre = viewCentre(frame)
  const eye = { x: visible.width / 2, y: visible.height / 2 }
  const rect: Rect = {
    left: INDICATOR_INSET,
    top: INDICATOR_INSET,
    right: visible.width - INDICATOR_INSET,
    bottom: visible.height - INDICATOR_INSET,
  }
  if (rect.right <= rect.left || rect.bottom <= rect.top) return []

  const placed: Placed[] = []
  for (const island of islands) {
    const { sx, sy } = toScreen(island.x - view.x, island.z - view.z, view.zoom)
    const target = { x: centre.x + sx, y: centre.y + sy }
    // A ground disc of radius `extent` projects to an ellipse with these semi-axes.
    const rx = island.extent * view.zoom
    const ry = rx / Math.sqrt(3)
    const offscreen =
      target.x + rx < 0 ||
      target.x - rx > visible.width ||
      target.y + ry < 0 ||
      target.y - ry > visible.height
    if (!offscreen) continue
    const dx = target.x - eye.x
    const dy = target.y - eye.y
    const tx = dx > 0 ? (rect.right - eye.x) / dx : dx < 0 ? (rect.left - eye.x) / dx : Infinity
    const ty = dy > 0 ? (rect.bottom - eye.y) / dy : dy < 0 ? (rect.top - eye.y) / dy : Infinity
    const t = Math.min(tx, ty)
    const x = Math.min(rect.right, Math.max(rect.left, eye.x + dx * t))
    const y = Math.min(rect.bottom, Math.max(rect.top, eye.y + dy * t))
    placed.push({ island, target, s: toPerimeter(rect, x, y) })
  }

  placed.sort((a, b) => a.s - b.s)
  for (let i = 1; i < placed.length; i++) {
    const prev = placed[i - 1]
    const cur = placed[i]
    if (prev && cur && cur.s - prev.s < INDICATOR_SPACING) cur.s = prev.s + INDICATOR_SPACING
  }

  return placed.map(({ island, target, s }) => {
    const at = fromPerimeter(rect, s)
    const angle = Math.atan2(target.y - at.y, target.x - at.x)
    return {
      projectId: island.projectId,
      name: island.name,
      urgency: island.urgency,
      count: island.count,
      left: Math.round(at.x),
      top: Math.round(at.y),
      angle: Math.round(angle * 100) / 100,
    }
  })
}
