import { MapControls } from '@react-three/drei'
import { type Camera, useFrame, useThree } from '@react-three/fiber'
import { type ComponentRef, useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import type { Focus } from '../world/selectors'
import { cameraTarget, clampToBounds, focusKey, MAX_ZOOM_FACTOR } from './model/camera'
import {
  bandedTarget,
  bandLimit,
  flyDuration,
  flyFrame,
  isOutside,
  SPRING_MS,
  springFrame,
} from './model/camera-motion'
import type { Point } from './model/hex-space'
import type { SceneModel } from './model/scene-model'
import type { View } from './model/screen'
import { useFrameSize } from './use-frame-size'

/** The camera sits this far along the (1, 1, 1) diagonal from its target: true isometric. */
export const ISO_DISTANCE = 200

type Controls = ComponentRef<typeof MapControls>
type Motion =
  | { kind: 'idle' }
  | { kind: 'fly'; from: View; to: View; elapsed: number; duration: number }
  | { kind: 'spring'; from: Point; to: Point; elapsed: number; duration: number }

const IDLE: Motion = { kind: 'idle' }

function viewOf(camera: Camera): View {
  return {
    x: camera.position.x - ISO_DISTANCE,
    z: camera.position.z - ISO_DISTANCE,
    zoom: camera.zoom,
  }
}

function place(camera: Camera, controls: Controls | null, v: View) {
  camera.position.set(v.x + ISO_DISTANCE, ISO_DISTANCE, v.z + ISO_DISTANCE)
  camera.lookAt(v.x, 0, v.z)
  if (camera.zoom !== v.zoom) {
    camera.zoom = v.zoom
    camera.updateProjectionMatrix()
  }
  controls?.target.set(v.x, 0, v.z)
}

export type CameraRigProps = {
  model: SceneModel
  focus: Focus
  /** Archipelago view centres this island (spec §14.2). */
  anchor?: string | null
  /** Canvas px hidden behind the phone sheet. */
  covered?: number
  /** False under reduced motion: every movement snaps. */
  animate?: boolean
}

export function CameraRig({
  model,
  focus,
  anchor = null,
  covered = 0,
  animate = true,
}: CameraRigProps) {
  const controls = useRef<Controls>(null)
  const camera = useThree((s) => s.camera)
  const invalidate = useThree((s) => s.invalidate)
  const frame = useFrameSize(covered)
  const target = cameraTarget(model, focus, anchor)
  const latest = useRef({ target, bounds: model.bounds, frame, animate })
  latest.current = { target, bounds: model.bounds, frame, animate }
  const motion = useRef<Motion>(IDLE)
  // `shown` is the target on screen; `raw` is where the drag would have put it without the band.
  const pan = useRef<{ raw: Point | null; shown: Point }>({
    raw: null,
    shown: { x: target.x, z: target.z },
  })
  const dragging = useRef(false)
  const quiet = useRef(false)
  const mounted = useRef(false)
  const key = focusKey(focus)

  const show = useCallback(
    (v: View) => {
      place(camera, controls.current, v)
      pan.current = { raw: null, shown: { x: v.x, z: v.z } }
    },
    [camera],
  )

  // Drop pan momentum left from a fling without moving the camera.
  const cancelMomentum = useCallback(() => {
    const c = controls.current
    if (!c) return
    const keep = viewOf(camera)
    quiet.current = true
    c.enableDamping = false
    c.update()
    c.enableDamping = true
    quiet.current = false
    show(keep)
  }, [camera, show])

  const setZoomLimits = useCallback((min: number, max: number) => {
    const c = controls.current
    if (!c) return
    c.minZoom = min
    c.maxZoom = max
  }, [])

  // A route change flies; the first framing after mount, and reduced motion, snap. A refetch keeps
  // the same key, so it never moves the camera.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the route key is the trigger
  useLayoutEffect(() => {
    const { target: to, animate: smooth } = latest.current
    cancelMomentum()
    const from = viewOf(camera)
    const duration = smooth && mounted.current ? flyDuration(from, to) : 0
    mounted.current = true
    if (duration === 0) {
      motion.current = IDLE
      show(to)
      setZoomLimits(to.zoom, to.zoom * MAX_ZOOM_FACTOR)
    } else {
      setZoomLimits(0, Infinity)
      motion.current = { kind: 'fly', from, to, elapsed: 0, duration }
    }
    invalidate()
  }, [key, camera, invalidate])

  // A refetch can shrink the world under a resting camera; one frame lets the spring check run.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the bounds are the trigger
  useEffect(() => {
    invalidate()
  }, [model.bounds, invalidate])

  useFrame((_, delta) => {
    const m = motion.current
    if (m.kind === 'fly') {
      m.elapsed += delta * 1000
      const t = Math.min(1, m.elapsed / m.duration)
      show(flyFrame(m.from, m.to, t, latest.current.frame))
      if (t < 1) {
        invalidate()
        return
      }
      motion.current = IDLE
      setZoomLimits(m.to.zoom, m.to.zoom * MAX_ZOOM_FACTOR)
      return
    }
    if (m.kind === 'spring') {
      m.elapsed += delta * 1000
      const t = Math.min(1, m.elapsed / m.duration)
      show({ ...springFrame(m.from, m.to, t), zoom: camera.zoom })
      if (t < 1) invalidate()
      else motion.current = IDLE
      return
    }
    // At rest past the edge (released there, flung there, or the world shrank): spring home.
    if (dragging.current) return
    const here = viewOf(camera)
    const { bounds, animate: smooth } = latest.current
    if (!isOutside(bounds, here)) return
    cancelMomentum()
    const to = clampToBounds(bounds, here.x, here.z)
    if (!smooth) {
      show({ ...to, zoom: here.zoom })
      return
    }
    motion.current = {
      kind: 'spring',
      from: { x: here.x, z: here.z },
      to,
      elapsed: 0,
      duration: SPRING_MS,
    }
    invalidate()
  })

  // Past the bounds a drag stretches with resistance instead of stopping dead.
  const onChange = useCallback(() => {
    const c = controls.current
    if (!c || quiet.current || motion.current.kind !== 'idle') return
    const { bounds, frame: f } = latest.current
    const { raw, shown } = pan.current
    const base = raw ?? shown
    const want = { x: base.x + c.target.x - shown.x, z: base.z + c.target.z - shown.z }
    const next = bandedTarget(bounds, want, bandLimit(f, camera.zoom))
    camera.position.x += next.x - c.target.x
    camera.position.z += next.z - c.target.z
    c.target.x = next.x
    c.target.z = next.z
    pan.current = { raw: want, shown: next }
  }, [camera])

  // A touch or wheel takes over from any flight or spring, right where the camera is.
  const onStart = useCallback(() => {
    dragging.current = true
    const m = motion.current
    if (m.kind === 'idle') return
    motion.current = IDLE
    const here = viewOf(camera)
    pan.current = { raw: null, shown: { x: here.x, z: here.z } }
    if (m.kind === 'fly') {
      setZoomLimits(
        Math.min(m.to.zoom, here.zoom),
        Math.max(m.to.zoom * MAX_ZOOM_FACTOR, here.zoom),
      )
    }
  }, [camera, setZoomLimits])

  const onEnd = useCallback(() => {
    dragging.current = false
    invalidate()
  }, [invalidate])

  return (
    <MapControls
      ref={controls}
      makeDefault
      enableRotate={false}
      enableDamping
      screenSpacePanning={false}
      onChange={onChange}
      onStart={onStart}
      onEnd={onEnd}
    />
  )
}
