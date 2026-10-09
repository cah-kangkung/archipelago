import { flushSync, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Focus } from '../world/selectors'
import {
  DISTRICT_RING_RENDER_ORDER,
  districtRingMaterial,
  districtRingUniforms,
} from './district-ring-material'
import { type RingTarget, ringLeg, ringTarget } from './model/district-ring'
import type { SceneModel } from './model/scene-model'
import { ringGeometry } from './models/district-ring-geometry'
import { CLOUD_MS, clampDelta } from './tuning'

const noRaycast = () => null

const write = (reveal: number, opacity: number) => {
  districtRingUniforms.uReveal.value = reveal
  districtRingUniforms.uOpacity.value = opacity
}

/** Keeps the shown ring's object while its district and tiles are unchanged. */
const same = (a: RingTarget | null, b: RingTarget | null) =>
  a?.district === b?.district && a?.key === b?.key

/**
 * The district ring (spec 24.5): a gold ribbon along the outer edges of the focused district's
 * tiles. Entering a district draws it on over CLOUD_MS, leaving fades it out, district to
 * district swaps at once; a refetch that changes the tiles redraws it in place.
 */
export function DistrictRing({
  model,
  focus,
  animate,
  onRunning,
}: {
  model: SceneModel
  focus: Focus
  animate: boolean
  /** A draw-on or fade started (true) or ended (false); keeps the ticker running for it. */
  onRunning?: (running: boolean) => void
}) {
  const invalidate = useThree((s) => s.invalidate)
  const target = ringTarget(model, focus)
  const latest = useRef(target)
  latest.current = target
  const [shown, setShown] = useState<RingTarget | null>(() => ringTarget(model, focus))
  const district = useRef<string | null>(null)
  const mounted = useRef(false)
  const leg = useRef<{
    kind: 'draw' | 'fade'
    from: number
    elapsed: number
    fresh: boolean
  } | null>(null)
  const running = useRef(onRunning)
  running.current = onRunning

  const show = (next: RingTarget | null) => setShown((s) => (same(s, next) ? s : next))
  const begin = (kind: 'draw' | 'fade', from: number) => {
    const was = leg.current !== null
    leg.current = { kind, from, elapsed: 0, fresh: true }
    if (!was) running.current?.(true)
  }
  const stop = () => {
    if (!leg.current) return
    leg.current = null
    running.current?.(false)
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: the district and its tiles' key are the trigger
  useLayoutEffect(() => {
    const next = latest.current
    const move = ringLeg(district.current, next?.district ?? null)
    district.current = next?.district ?? null
    // The first mount shows its ring at once, like the camera's first framing.
    const instant = !mounted.current || !animate
    mounted.current = true
    if (instant || move === 'swap') {
      stop()
      show(next)
      write(1, 1)
    } else if (move === 'draw') {
      show(next)
      write(0, 1)
      begin('draw', 0)
    } else if (move === 'fade') {
      begin('fade', districtRingUniforms.uOpacity.value)
    } else {
      // Same district, new tiles or heights: redraw in place.
      show(next)
    }
    invalidate()
  }, [target?.district, target?.key, animate, invalidate])

  // Unmounting mid-leg releases the ticker demand.
  useLayoutEffect(
    () => () => {
      if (leg.current) running.current?.(false)
    },
    [],
  )

  useFrame((_, delta) => {
    const l = leg.current
    if (!l) return
    // The leg began between frames: its first frame's delta spans the idle gap, so it doesn't count.
    if (!l.fresh) l.elapsed += clampDelta(delta) * 1000
    l.fresh = false
    const t = Math.min(1, l.elapsed / CLOUD_MS)
    if (l.kind === 'draw') write(t, 1)
    else write(districtRingUniforms.uReveal.value, l.from * (1 - t))
    if (t < 1) {
      invalidate()
      return
    }
    leg.current = null
    running.current?.(false)
    if (l.kind === 'fade') {
      // Committed in the frame, so the ribbon is gone the moment the fade ends.
      flushSync(() => setShown(null))
      write(1, 1)
    }
  })

  const geometry = useMemo(() => (shown ? ringGeometry(shown.loops) : null), [shown])
  useEffect(() => () => geometry?.dispose(), [geometry])

  if (!shown || !geometry) return null
  return (
    <mesh
      name="district-ring"
      geometry={geometry}
      material={districtRingMaterial}
      position={[shown.origin.x, 0, shown.origin.z]}
      renderOrder={DISTRICT_RING_RENDER_ORDER}
      frustumCulled={false}
      raycast={noRaycast}
    />
  )
}
