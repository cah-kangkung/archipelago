import { useFrame, useThree } from '@react-three/fiber'
import { useLayoutEffect, useRef } from 'react'
import { easeOutCubic, FRAMING_MS } from './model/camera-motion'
import { framedCover } from './model/screen'
import { clampDelta } from './tuning'

/**
 * Shifts the projection up by half the framed sheet cover, so the look-at point sits in the middle
 * of the part of the canvas the sheet leaves visible (spec §14.3).
 */
export function Framing({ covered, animate }: { covered: number; animate: boolean }) {
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  const invalidate = useThree((s) => s.invalidate)
  const goal = framedCover(covered, window.innerHeight)
  const ease = useRef({ from: goal, to: goal, shown: goal, elapsed: 0 })
  const applied = useRef('')

  useLayoutEffect(() => {
    const e = ease.current
    if (e.to === goal) return
    ease.current = { from: e.shown, to: goal, shown: animate ? e.shown : goal, elapsed: 0 }
    invalidate()
  }, [goal, animate, invalidate])

  useFrame((_, delta) => {
    const e = ease.current
    if (e.shown !== e.to) {
      e.elapsed += clampDelta(delta) * 1000
      const t = Math.min(1, e.elapsed / FRAMING_MS)
      e.shown = t >= 1 ? e.to : e.from + (e.to - e.from) * easeOutCubic(t)
      if (t < 1) invalidate()
    }
    // A resize resets the frustum, so the offset is re-applied whenever the size changes too.
    const key = `${e.shown}:${size.width}:${size.height}`
    if (key === applied.current) return
    applied.current = key
    if (e.shown > 0) {
      camera.setViewOffset(size.width, size.height, 0, e.shown / 2, size.width, size.height)
    } else {
      camera.clearViewOffset()
    }
    camera.updateProjectionMatrix()
  })

  return null
}
