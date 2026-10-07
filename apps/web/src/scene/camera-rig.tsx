import { MapControls } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { type ComponentRef, useLayoutEffect, useRef } from 'react'
import type { Focus } from '../world/selectors'
import { cameraTarget, clampToBounds, focusKey, MAX_ZOOM_FACTOR } from './model/camera'
import type { SceneModel } from './model/scene-model'

/** The camera sits this far along the (1, 1, 1) diagonal from its target: true isometric. */
export const ISO_DISTANCE = 200

export function CameraRig({ model, focus }: { model: SceneModel; focus: Focus }) {
  const controls = useRef<ComponentRef<typeof MapControls>>(null)
  const camera = useThree((s) => s.camera)
  const invalidate = useThree((s) => s.invalidate)
  const target = cameraTarget(model, focus)
  const latest = useRef({ target, bounds: model.bounds })
  latest.current = { target, bounds: model.bounds }
  const key = focusKey(focus)

  // Snap only when the route changes: a world refetch must not yank a camera the user has panned.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the route key is the trigger
  useLayoutEffect(() => {
    const t = latest.current.target
    const c = controls.current
    if (c) {
      // Spend any momentum left from a fling now, before placing the camera: otherwise it carries
      // the camera past the snap, and spending it later would shift the camera off the diagonal.
      c.enableDamping = false
      c.update()
      c.enableDamping = true
    }
    camera.position.set(t.x + ISO_DISTANCE, ISO_DISTANCE, t.z + ISO_DISTANCE)
    camera.zoom = t.zoom
    camera.lookAt(t.x, 0, t.z)
    camera.updateProjectionMatrix()
    if (c) {
      c.target.set(t.x, 0, t.z)
      c.update()
    }
    invalidate()
  }, [key, camera, invalidate])

  // Hard bounds for 4a; 4b replaces them with soft, rubber-banded edges.
  const clamp = () => {
    const c = controls.current
    if (!c) return
    const { x, z } = clampToBounds(latest.current.bounds, c.target.x, c.target.z)
    const dx = x - c.target.x
    const dz = z - c.target.z
    if (dx === 0 && dz === 0) return
    c.target.x = x
    c.target.z = z
    camera.position.x += dx
    camera.position.z += dz
  }

  return (
    <MapControls
      ref={controls}
      makeDefault
      enableRotate={false}
      enableDamping
      screenSpacePanning={false}
      minZoom={target.zoom}
      maxZoom={target.zoom * MAX_ZOOM_FACTOR}
      onChange={clamp}
    />
  )
}
