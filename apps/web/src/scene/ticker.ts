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
