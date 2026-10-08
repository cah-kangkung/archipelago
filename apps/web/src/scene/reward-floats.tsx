import { Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import type * as THREE from 'three'
import type { RewardEvent } from '../rewards/reward-store'
import type { Focus } from '../world/selectors'
import { type FloatAnchor, floatAnchor, floatFrame } from './model/reward-motion'
import type { SceneModel } from './model/scene-model'
import { clampDelta } from './tuning'

/** Below the HUD (z-20), like the labels. */
const FLOAT_Z: [number, number] = [10, 0]
const pill =
  'pointer-events-none select-none whitespace-nowrap rounded-full bg-surface-primary px-2 py-0.5 text-sm font-semibold text-warning shadow'

/** One rising "+N" per amount of each live reward event (spec 16.2). */
export function RewardFloats({
  model,
  focus,
  events,
}: {
  model: SceneModel
  focus: Focus
  events: readonly RewardEvent[]
}) {
  return events.flatMap((event) => {
    const anchor = floatAnchor(model, focus, event.target)
    if (!anchor) return []
    return event.amounts.map((amount, line) => (
      // biome-ignore lint/suspicious/noArrayIndexKey: an event's amounts are fixed; the line is its identity
      <FloatLine key={`${event.id}:${line}`} anchor={anchor} amount={amount} line={line} />
    ))
  })
}

function FloatLine({
  anchor,
  amount,
  line,
}: {
  anchor: FloatAnchor
  amount: number
  line: number
}) {
  const group = useRef<THREE.Group>(null)
  const label = useRef<HTMLSpanElement>(null)
  const elapsed = useRef(0)
  // The first frame's delta is the idle gap before the ticker woke, not float time.
  const fresh = useRef(true)

  useFrame((_, delta) => {
    if (!fresh.current) elapsed.current += clampDelta(delta) * 1000
    fresh.current = false
    const f = floatFrame(elapsed.current, line)
    const g = group.current
    if (g) {
      g.position.y = anchor.y + f.rise
      g.visible = f.visible
    }
    if (label.current) label.current.style.opacity = String(f.opacity)
  })

  return (
    <group ref={group} name="float" position={[anchor.x, anchor.y, anchor.z]} visible={false}>
      <Html center zIndexRange={FLOAT_Z}>
        <span ref={label} className={pill} style={{ opacity: 0 }}>
          +{amount}
        </span>
      </Html>
    </group>
  )
}
