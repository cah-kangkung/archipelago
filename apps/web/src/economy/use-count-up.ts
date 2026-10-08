import { useEffect, useRef, useState } from 'react'
import { easeOutCubic } from '../scene/model/camera-motion'
import { usePrefersReducedMotion } from '../scene/use-reduced-motion'

export const COUNT_UP_MS = 600

/**
 * The number to display for `value`: eases from whatever is on screen to `value` with DOM animation
 * frames (not the scene's loop). Snaps under reduced motion.
 */
export function useCountUp(value: number, durationMs = COUNT_UP_MS): number {
  const reduced = usePrefersReducedMotion()
  const [shown, setShown] = useState(value)
  const onScreen = useRef(value)

  useEffect(() => {
    const from = onScreen.current
    if (reduced || from === value) {
      onScreen.current = value
      setShown(value)
      return
    }
    const start = performance.now()
    let frame = requestAnimationFrame(function step() {
      const t = Math.min(1, (performance.now() - start) / durationMs)
      const next = t >= 1 ? value : Math.round(from + (value - from) * easeOutCubic(t))
      onScreen.current = next
      setShown(next)
      if (t < 1) frame = requestAnimationFrame(step)
    })
    return () => cancelAnimationFrame(frame)
  }, [value, reduced, durationMs])

  return shown
}
