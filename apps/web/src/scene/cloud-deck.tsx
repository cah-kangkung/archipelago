import { useFrame, useThree } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import type { Mesh } from 'three'
import type { Focus } from '../world/selectors'
import {
  CLOUD_DECK_RENDER_ORDER,
  cloudDeckMaterial,
  writeDeck,
  writeDrift,
} from './cloud-deck-material'
import {
  DECK_OFF,
  type Deck,
  deckAt,
  deckFor,
  deckHole,
  deckLeg,
  driftStep,
  sameDeck,
} from './model/cloud-deck'
import { LAND_HEIGHT } from './model/hex-space'
import type { SceneModel } from './model/scene-model'
import { areaKey } from './model/spotlight'
import { CLOUD_MS, clampDelta, SEA_MARGIN } from './tuning'

const noRaycast = () => null

/**
 * The cloud deck (spec 23.7): one plane over the world, a veil on the archipelago and island layers
 * and a hole in a district. It opens, closes and slides with the route; a refetch with the same
 * hole is still. Drifts while `drifting`.
 */
export function CloudDeck({
  model,
  focus,
  animate,
  drifting,
  onRunning,
}: {
  model: SceneModel
  focus: Focus
  animate: boolean
  /** The `high` tier's sea wave is on, so frames already tick. */
  drifting: boolean
  /** A fade or slide started (true) or ended (false); keeps the ticker running for it. */
  onRunning?: (running: boolean) => void
}) {
  const invalidate = useThree((s) => s.invalidate)
  const hole = deckHole(model, focus)
  const key = areaKey(hole)
  const target = useRef(deckFor(hole))
  target.current = deckFor(hole)
  const shown = useRef<Deck>(DECK_OFF)
  const mesh = useRef<Mesh>(null)
  const mounted = useRef(false)
  const leg = useRef<{ from: Deck; to: Deck; elapsed: number; fresh: boolean } | null>(null)
  const running = useRef(onRunning)
  running.current = onRunning
  const along = useRef(0)

  const show = (d: Deck) => {
    shown.current = d
    writeDeck(d)
    // A deck with no strength shows nothing: skip its full-screen blended pass.
    if (mesh.current) mesh.current.visible = d.strength > 0
  }

  // The uniforms are module-level and outlive a remount: start from no drift.
  useLayoutEffect(() => {
    writeDrift(0)
  }, [])

  // biome-ignore lint/correctness/useExhaustiveDependencies: the hole's value is the trigger
  useLayoutEffect(() => {
    const { from, to } = deckLeg(shown.current, target.current)
    const wasRunning = leg.current !== null
    // The first mount shows its deck at once, like the camera's first framing.
    const instant = !mounted.current || !animate || sameDeck(from, to)
    mounted.current = true
    if (instant) {
      leg.current = null
      show(to)
      if (wasRunning) running.current?.(false)
    } else {
      leg.current = { from, to, elapsed: 0, fresh: true }
      show(from)
      if (!wasRunning) running.current?.(true)
    }
    invalidate()
  }, [key, animate, invalidate])

  // Unmounting mid-leg releases the ticker demand.
  useLayoutEffect(
    () => () => {
      if (leg.current) running.current?.(false)
    },
    [],
  )

  useFrame((_, delta) => {
    if (drifting) {
      along.current = driftStep(along.current, clampDelta(delta))
      writeDrift(along.current)
    }
    const l = leg.current
    if (!l) return
    // The leg began between frames: its first frame's delta spans the idle gap, so it doesn't count.
    if (!l.fresh) l.elapsed += clampDelta(delta) * 1000
    l.fresh = false
    const t = Math.min(1, l.elapsed / CLOUD_MS)
    show(deckAt(l.from, l.to, t))
    if (t < 1) {
      invalidate()
      return
    }
    leg.current = null
    running.current?.(false)
  })

  const plane = useMemo(() => {
    const b = model.bounds
    const m = SEA_MARGIN
    return {
      x: (b.minX + b.maxX) / 2,
      z: (b.minZ + b.maxZ) / 2,
      width: b.maxX - b.minX + 2 * m,
      depth: b.maxZ - b.minZ + 2 * m,
    }
  }, [model.bounds])

  return (
    <mesh
      ref={mesh}
      position={[plane.x, LAND_HEIGHT, plane.z]}
      rotation-x={-Math.PI / 2}
      renderOrder={CLOUD_DECK_RENDER_ORDER}
      frustumCulled={false}
      raycast={noRaycast}
      material={cloudDeckMaterial}
    >
      <planeGeometry args={[plane.width, plane.depth]} />
    </mesh>
  )
}
