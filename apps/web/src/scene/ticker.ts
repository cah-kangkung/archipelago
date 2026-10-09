/** About 30fps: enough for the sea and cranes, half the cost of the display rate. */
export const TICK_MS = 33

const documentVisible = () => document.visibilityState === 'visible'

/** Requests a frame every tick while the page is visible; returns a stop function. */
export function startTicker(invalidate: () => void, isVisible = documentVisible): () => void {
  const id = setInterval(() => {
    if (isVisible()) invalidate()
  }, TICK_MS)
  return () => clearInterval(id)
}

export type TickerDemand = {
  /** False under prefers-reduced-motion. */
  animate: boolean
  /** The sea wave is on (`high` tier). */
  seaWave: boolean
  /** A crane is in the scene (a `doing` task). */
  cranes: boolean
  /** A reward event is alive. */
  effects: boolean
  /** A camera flight or spring is running. */
  camera: boolean
  /** Boats, gulls or a whale are moving (`high` tier, spec 17.5). */
  life: boolean
  /** New scenery is growing in after a stage rise (`high` tier, spec 18.5). */
  growth: boolean
  /** The cloud deck is fading or its hole sliding between layers (spec 23.3). */
  clouds: boolean
}

/** The ticker runs only while something moves (spec 16.4); otherwise frames come on change. */
export function tickerWanted(d: TickerDemand): boolean {
  return (
    d.animate && (d.seaWave || d.cranes || d.effects || d.camera || d.life || d.growth || d.clouds)
  )
}
