import { useFrame, useThree } from '@react-three/fiber'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { foamMaterial, solidMaterial, splashMaterial } from './materials'
import {
  type AmbientLife,
  boatPose,
  foamOpacity,
  GULLS_PER_FLOCK,
  gullPose,
  type Pose,
  whalePose,
} from './model/ambient-life'
import type { Shore } from './model/sea-depth'
import { foamGeometry, seaGeometry } from './models/sea-props'
import { SEA_LEVEL } from './models/terrain-geometry'
import { clampDelta, FOAM_OPACITY, GULL_HEIGHT } from './tuning'
import { useStableShores } from './use-stable-shores'

const matrix = new THREE.Matrix4()

function place(mesh: THREE.InstancedMesh, i: number, pose: Pose, y: number) {
  matrix.makeRotationY(pose.heading).setPosition(pose.position.x, y, pose.position.z)
  mesh.setMatrixAt(i, matrix)
}

/**
 * Boats, gulls, the whale and coastline foam (spec 17.5). With `animate` (the `high` tier with
 * motion allowed) it moves on frames the sea's ticker already draws; otherwise it is posed once at
 * t = 0 and the whale and foam pulse are left out. Nothing here is tappable.
 */
export function AmbientLifeLayer({
  life,
  islands,
  animate,
}: {
  life: AmbientLife
  islands: readonly Shore[]
  animate: boolean
}) {
  const boats = useRef<THREE.InstancedMesh>(null)
  const gulls = useRef<THREE.InstancedMesh>(null)
  const whale = useRef<THREE.Mesh>(null)
  const splash = useRef<THREE.Mesh>(null)
  const time = useRef(0)
  const invalidate = useThree((s) => s.invalidate)
  // A refetch hands over equal but fresh islands; the foam only rebuilds when the layout changes.
  const shores = useStableShores(islands)
  const foam = useMemo(() => (shores.length > 0 ? foamGeometry(shores) : null), [shores])
  useEffect(() => () => foam?.dispose(), [foam])

  const pose = useCallback(
    (t: number) => {
      const b = boats.current
      if (b) {
        life.boats.forEach((boat, i) => {
          place(b, i, boatPose(boat, t), SEA_LEVEL)
        })
        b.instanceMatrix.needsUpdate = true
        b.computeBoundingSphere()
      }
      const g = gulls.current
      if (g) {
        life.flocks.forEach((flock, f) => {
          for (let k = 0; k < GULLS_PER_FLOCK; k++) {
            place(g, f * GULLS_PER_FLOCK + k, gullPose(flock, k, t), GULL_HEIGHT)
          }
        })
        g.instanceMatrix.needsUpdate = true
        g.computeBoundingSphere()
      }
      const w = whale.current
      const s = splash.current
      if (w && s && life.whale) {
        const p = whalePose(life.whale, t)
        w.visible = p.visible
        s.visible = p.visible
        w.position.set(life.whale.spot.x, SEA_LEVEL + p.y, life.whale.spot.z)
        w.rotation.set(0, life.whale.turn, p.pitch)
        s.scale.setScalar(0.5 + p.splash * 1.5)
        splashMaterial.opacity = 0.6 * (1 - p.splash)
      }
    },
    [life],
  )

  // Switching to `low` (or new life) snaps everything to its t = 0 pose.
  useLayoutEffect(() => {
    if (!animate) {
      time.current = 0
      foamMaterial.opacity = FOAM_OPACITY
    }
    pose(time.current)
    invalidate()
  }, [pose, animate, invalidate])

  useFrame((_, delta) => {
    if (!animate) return
    time.current += clampDelta(delta)
    pose(time.current)
    foamMaterial.opacity = foamOpacity(time.current)
  })

  const gullCount = life.flocks.length * GULLS_PER_FLOCK
  return (
    <>
      {foam && <mesh name="foam" geometry={foam} material={foamMaterial} />}
      {life.boats.length > 0 && (
        <instancedMesh
          key={`boats:${life.boats.length}`}
          ref={boats}
          name="boats"
          args={[seaGeometry('boat'), solidMaterial, life.boats.length]}
        />
      )}
      {gullCount > 0 && (
        <instancedMesh
          key={`gulls:${gullCount}`}
          ref={gulls}
          name="gulls"
          args={[seaGeometry('gull'), solidMaterial, gullCount]}
        />
      )}
      {animate && life.whale && (
        <>
          <mesh ref={whale} name="whale" geometry={seaGeometry('whale')} material={solidMaterial} />
          <mesh
            ref={splash}
            name="splash"
            geometry={seaGeometry('splash')}
            material={splashMaterial}
            position={[life.whale.spot.x, SEA_LEVEL + 0.05, life.whale.spot.z]}
          />
        </>
      )}
    </>
  )
}
