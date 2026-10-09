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
import { clampDelta, DISTRICT_RING_FADE_MS } from './tuning'

const noRaycast = () => null

const write = (opacity: number) => {
  districtRingUniforms.uOpacity.value = opacity
}

/** Keeps the shown ring's object while its district and tiles are unchanged. */
const same = (a: RingTarget | null, b: RingTarget | null) =>
  a?.district === b?.district && a?.key === b?.key

/**
 * The district ring (spec 24.5): a gold ribbon along the outer edges of a district's tiles, for
 * the focused district or the one hovered on the island view. It fades in over
 * DISTRICT_RING_FADE_MS when it appears and out when it goes; district to district swaps at once,
 * and tapping a hovered district keeps the ring untouched. A refetch that changes the tiles
 * redraws it in place.
 */
export function DistrictRing({
  model,
  focus,
  hovered = null,
  animate,
  onRunning,
}: {
  model: SceneModel
  focus: Focus
  /** The milestone pointed at on the island view; ignored in any other view. */
  hovered?: string | null
  animate: boolean
  /** A fade started (true) or ended (false); keeps the ticker running for it. */
  onRunning?: (running: boolean) => void
}) {
  const invalidate = useThree((s) => s.invalidate)
  const target = useMemo(() => ringTarget(model, focus, hovered), [model, focus, hovered])
  const latest = useRef(target)
  latest.current = target
  const [shown, setShown] = useState<RingTarget | null>(() => target)
  const district = useRef<string | null>(null)
  const mounted = useRef(false)
  const leg = useRef<{
    kind: 'in' | 'out'
    from: number
    elapsed: number
    fresh: boolean
  } | null>(null)
  const running = useRef(onRunning)
  running.current = onRunning

  const show = (next: RingTarget | null) => setShown((s) => (same(s, next) ? s : next))
  const begin = (kind: 'in' | 'out', from: number) => {
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
      write(1)
    } else if (move === 'in') {
      // A fade-out still running (the pointer came back) is picked up where it is.
      const from = leg.current ? districtRingUniforms.uOpacity.value : 0
      show(next)
      write(from)
      begin('in', from)
    } else if (move === 'out') {
      begin('out', districtRingUniforms.uOpacity.value)
    } else {
      // Same district, new tiles or heights: redraw in place.
      show(next)
    }
    invalidate()
  }, [target?.district, target?.key, animate, invalidate])

  // Unmounting mid-leg releases the ticker demand.
  useLayoutEffect(
    () => () => {
      if (!leg.current) return
      running.current?.(false)
      write(1)
    },
    [],
  )

  useFrame((_, delta) => {
    const l = leg.current
    if (!l) return
    // The leg began between frames: its first frame's delta spans the idle gap, so it doesn't count.
    if (!l.fresh) l.elapsed += clampDelta(delta) * 1000
    l.fresh = false
    const t = Math.min(1, l.elapsed / DISTRICT_RING_FADE_MS)
    write(l.kind === 'in' ? l.from + (1 - l.from) * t : l.from * (1 - t))
    if (t < 1) {
      invalidate()
      return
    }
    leg.current = null
    running.current?.(false)
    if (l.kind === 'out') {
      // Committed in the frame, so the ribbon is gone the moment the fade ends.
      flushSync(() => setShown(null))
      write(1)
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
