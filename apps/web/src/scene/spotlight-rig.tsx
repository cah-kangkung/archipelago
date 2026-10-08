import { useFrame, useThree } from '@react-three/fiber'
import { useCallback, useLayoutEffect, useRef } from 'react'
import * as THREE from 'three'
import type { Focus } from '../world/selectors'
import { layerArea } from './model/camera'
import { scenePalette } from './model/palette'
import type { SceneModel } from './model/scene-model'
import {
  areaKey,
  dimHex,
  SPOTLIGHT_OFF,
  type Spotlight,
  sameSpotlight,
  spotlightAt,
  spotlightFor,
  spotlightLeg,
} from './model/spotlight'
import { writeSpotlight } from './spotlight-material'
import { clampDelta, SPOTLIGHT_MS } from './tuning'

/** Fades and slides the spotlight with the route (spec 20.3); a refetch with the same area is still. */
export function SpotlightRig({
  model,
  focus,
  animate,
  onRunning,
}: {
  model: SceneModel
  focus: Focus
  animate: boolean
  /** A fade or slide started (true) or ended (false); keeps the ticker running for it. */
  onRunning?: (running: boolean) => void
}) {
  const invalidate = useThree((s) => s.invalidate)
  const scene = useThree((s) => s.scene)
  const area = layerArea(model, focus)
  const key = areaKey(area)
  const target = useRef(spotlightFor(area))
  target.current = spotlightFor(area)
  const shown = useRef<Spotlight>(SPOTLIGHT_OFF)
  const leg = useRef<{ from: Spotlight; to: Spotlight; elapsed: number } | null>(null)
  const running = useRef(onRunning)
  running.current = onRunning

  const show = useCallback(
    (s: Spotlight) => {
      shown.current = s
      writeSpotlight(s)
      // The clear colour shows past the sea mesh: dim it with the sea so no seam appears.
      if (scene.background instanceof THREE.Color) {
        scene.background.set(dimHex(scenePalette.seaDeep, s.area ? s.strength : 0))
      }
    },
    [scene],
  )

  // biome-ignore lint/correctness/useExhaustiveDependencies: the area's value is the trigger
  useLayoutEffect(() => {
    const { from, to } = spotlightLeg(shown.current, target.current)
    const wasRunning = leg.current !== null
    if (!animate || sameSpotlight(from, to)) {
      leg.current = null
      show(to)
      if (wasRunning) running.current?.(false)
    } else {
      leg.current = { from, to, elapsed: 0 }
      show(from)
      if (!wasRunning) running.current?.(true)
    }
    invalidate()
  }, [key, animate, show, invalidate])

  useFrame((_, delta) => {
    const l = leg.current
    if (!l) return
    l.elapsed += clampDelta(delta) * 1000
    const t = Math.min(1, l.elapsed / SPOTLIGHT_MS)
    show(spotlightAt(l.from, l.to, t))
    if (t < 1) {
      invalidate()
      return
    }
    leg.current = null
    running.current?.(false)
  })

  return null
}
