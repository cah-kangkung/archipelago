import { useFrame, useThree } from '@react-three/fiber'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { Focus } from '../world/selectors'
import { cloudMaterial } from './materials'
import {
  type CloudFrame,
  type CloudLeg,
  legDone,
  legFrames,
  nextLeg,
  restFrames,
  stillFrames,
} from './model/cloud-motion'
import { type CloudPuff, cloudArea, cloudRing } from './model/clouds'
import type { SceneModel } from './model/scene-model'
import { areaKey } from './model/spotlight'
import { cloudGeometry } from './models/cloud'
import { CLOUD_MAX, clampDelta } from './tuning'

/** Two capped rings share the mesh during a switch. */
const CAPACITY = CLOUD_MAX * 2
const matrix = new THREE.Matrix4()
const at = new THREE.Vector3()
const size = new THREE.Vector3()
const turn = new THREE.Quaternion()
const UP = new THREE.Vector3(0, 1, 0)
const noRaycast = () => {}

/** The cloud ring round the current island or district (spec 21); one draw call. */
export function CloudLayer({
  model,
  focus,
  animate,
  drifting,
  onRunning,
}: {
  model: SceneModel
  focus: Focus
  /** False under reduced motion: rings swap at once and never drift. */
  animate: boolean
  /** The `high` tier: resting puffs sway and bob. */
  drifting: boolean
  /** A gather or part started (true) or ended (false); keeps the ticker running for it. */
  onRunning?: (running: boolean) => void
}) {
  const invalidate = useThree((s) => s.invalidate)
  const area = cloudArea(model, focus)
  const key = area ? `${areaKey(area.area)}#${area.inset}#${area.seed}` : 'none'
  // biome-ignore lint/correctness/useExhaustiveDependencies: the key is the cloud area's value
  const ring = useMemo(() => (area ? cloudRing(area) : []), [key])
  const mesh = useRef<THREE.InstancedMesh>(null)
  // null until the first layout effect: a first mount shows its ring at once, like the camera.
  const shown = useRef<CloudPuff[] | null>(null)
  const leg = useRef<(CloudLeg & { fresh: boolean }) | null>(null)
  const time = useRef(0)
  const report = useRef(onRunning)
  report.current = onRunning

  const write = useCallback((frames: readonly CloudFrame[]) => {
    const m = mesh.current
    if (!m) return
    frames.forEach((f, i) => {
      at.set(f.x, f.y, f.z)
      turn.setFromAxisAngle(UP, f.turn)
      size.setScalar(f.scale)
      m.setMatrixAt(i, matrix.compose(at, turn, size))
    })
    m.count = frames.length
    m.instanceMatrix.needsUpdate = true
  }, [])

  useLayoutEffect(() => {
    const running = leg.current !== null
    time.current = 0
    if (shown.current === null || !animate) {
      // First mount, or reduced motion: show the ring as it is (empty on the archipelago).
      leg.current = null
      shown.current = ring
      write(stillFrames(ring))
      if (running) report.current?.(false)
      invalidate()
      return
    }
    // Reduced motion turned off with nothing to change, or a refetch with the same cloud area.
    if (!running && shown.current === ring) return
    leg.current = { ...nextLeg(leg.current, shown.current, ring, CAPACITY), fresh: true }
    shown.current = ring
    write(legFrames(leg.current))
    if (!running) report.current?.(true)
    invalidate()
  }, [ring, animate, write, invalidate])

  useEffect(
    () => () => {
      if (leg.current) report.current?.(false)
    },
    [],
  )

  useFrame((_, delta) => {
    const step = clampDelta(delta)
    const l = leg.current
    if (l) {
      if (!l.fresh) l.elapsed += step * 1000
      l.fresh = false
      write(legFrames(l))
      if (!legDone(l)) {
        invalidate()
        return
      }
      leg.current = null
      time.current = 0
      report.current?.(false)
      return
    }
    const resting = shown.current ?? []
    if (!drifting || !animate || resting.length === 0) return
    time.current += step
    write(restFrames(resting, time.current))
  })

  return (
    <instancedMesh
      ref={mesh}
      name="clouds"
      args={[cloudGeometry(), cloudMaterial, CAPACITY]}
      raycast={noRaycast}
      // The puffs spread far from the mesh's origin; its default bounds would cull them.
      frustumCulled={false}
    />
  )
}
