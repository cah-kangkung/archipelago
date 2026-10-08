import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import type { Quality } from './model/quality'
import type { PerfStore } from './perf-store'

/** Samples each rendered frame for the `?perf` overlay: fps over the last second, draw stats. */
export function PerfProbe({ store, tier }: { store: PerfStore; tier: Quality }) {
  const frames = useRef<number[]>([])
  useFrame(({ gl, viewport }) => {
    const now = performance.now()
    const recent = frames.current
    recent.push(now)
    while ((recent[0] ?? now) <= now - 1000) recent.shift()
    // info.render is reset at the start of each render, so this is the previous frame's count.
    store.set({
      fps: recent.length,
      calls: gl.info.render.calls,
      triangles: gl.info.render.triangles,
      dpr: viewport.dpr,
      tier,
    })
  })
  return null
}
