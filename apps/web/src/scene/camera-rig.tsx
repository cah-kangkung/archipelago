import { MapControls } from '@react-three/drei'
import { type Camera, useFrame, useThree } from '@react-three/fiber'
import { type ComponentRef, useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import type { Focus } from '../world/selectors'
import { cameraTarget, clampToBounds, focusBounds, focusKey, MAX_ZOOM_FACTOR } from './model/camera'
import {
  bandedTarget,
  bandLimit,
  flyDuration,
  flyFrame,
  isOutside,
  SPRING_MS,
  springFrame,
  unbandedTarget,
} from './model/camera-motion'
import type { Point } from './model/hex-space'
import type { SceneModel } from './model/scene-model'
import { type Frame, type View, visibleSize } from './model/screen'
import { clampDelta } from './tuning'
import { useFrameSize } from './use-frame-size'

/** The camera sits this far along the (1, 1, 1) diagonal from its target: true isometric. */
export const ISO_DISTANCE = 200

type Controls = ComponentRef<typeof MapControls>
type Motion =
  | { kind: 'idle' }
  | {
      kind: 'fly'
      from: View
      to: View
      elapsed: number
      duration: number
      frame: Frame
      /** Not yet stepped: its first delta is the idle gap before the flight, not flight time. */
      fresh: boolean
    }
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
  /** Canvas px the HUD covers at the top; the fitted zoom leaves it clear (spec 19.1). */
  hudInset?: number
  /** False under reduced motion: every movement snaps. */
  animate?: boolean
  /** Called when a flight or spring starts (true) or ends (false). */
  onMotion?: (moving: boolean) => void
}

export function CameraRig({
  model,
  focus,
  anchor = null,
  covered = 0,
  hudInset = 0,
  animate = true,
  onMotion,
}: CameraRigProps) {
  const controls = useRef<Controls>(null)
  const camera = useThree((s) => s.camera)
  const invalidate = useThree((s) => s.invalidate)
  const frame = useFrameSize(covered)
  const room = visibleSize(frame)
  const target = cameraTarget(model, focus, anchor, {
    width: room.width,
    height: Math.max(0, room.height - hudInset),
  })
  // Pans stay inside the current layer: the whole world, one island or one district.
  const bounds = focusBounds(model, focus)
  const latest = useRef({ target, bounds, frame, animate })
  latest.current = { target, bounds, frame, animate }
  const motion = useRef<Motion>(IDLE)
  const onMotionRef = useRef(onMotion)
  onMotionRef.current = onMotion
  // Every motion change goes through here, so the ticker hears when the camera starts and stops.
  const setMotion = useCallback((next: Motion) => {
    const was = motion.current.kind !== 'idle'
    motion.current = next
    const is = next.kind !== 'idle'
    if (was !== is) onMotionRef.current?.(is)
  }, [])
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
    const { target: to, animate: smooth, frame: startFrame } = latest.current
    cancelMomentum()
    const from = viewOf(camera)
    const duration = smooth && mounted.current ? flyDuration(from, to) : 0
    mounted.current = true
    if (duration === 0) {
      setMotion(IDLE)
      show(to)
      setZoomLimits(to.zoom, to.zoom * MAX_ZOOM_FACTOR)
    } else {
      setZoomLimits(0, Infinity)
      setMotion({ kind: 'fly', from, to, elapsed: 0, duration, frame: startFrame, fresh: true })
    }
    invalidate()
  }, [key, camera, invalidate])

  // A refetch can shrink the area under a resting camera; one frame lets the spring check run.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the bounds are the trigger
  useEffect(() => {
    invalidate()
  }, [bounds.minX, bounds.maxX, bounds.minZ, bounds.maxZ, invalidate])

  // At rest, a new fit (window resize, sheet detent) moves the zoom-out limit with it, and a camera
  // left zoomed out past it comes in to the limit.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the fitted zoom is the trigger
  useEffect(() => {
    if (!mounted.current || motion.current.kind !== 'idle') return
    setZoomLimits(target.zoom, target.zoom * MAX_ZOOM_FACTOR)
    if (camera.zoom < target.zoom) {
      show({ ...viewOf(camera), zoom: target.zoom })
      invalidate()
    }
  }, [target.zoom])

  useFrame((_, delta) => {
    const step = clampDelta(delta) * 1000
    const m = motion.current
    if (m.kind === 'fly') {
      if (!m.fresh) m.elapsed += step
      m.fresh = false
      const t = Math.min(1, m.elapsed / m.duration)
      show(flyFrame(m.from, m.to, t, m.frame))
      if (t < 1) {
        invalidate()
        return
      }
      setMotion(IDLE)
      // The fit may have changed in the air (the HUD wraps): land on the latest one.
      const fitted = latest.current.target.zoom
      setZoomLimits(fitted, fitted * MAX_ZOOM_FACTOR)
      if (camera.zoom < fitted) {
        show({ ...viewOf(camera), zoom: fitted })
        invalidate()
      }
      return
    }
    // A spring starts inside a frame, so its first step already gets a fresh delta.
    if (m.kind === 'spring') {
      m.elapsed += step
      const t = Math.min(1, m.elapsed / m.duration)
      show({ ...springFrame(m.from, m.to, t), zoom: camera.zoom })
      if (t < 1) invalidate()
      else setMotion(IDLE)
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
    setMotion({
      kind: 'spring',
      from: { x: here.x, z: here.z },
      to,
      elapsed: 0,
      duration: SPRING_MS,
    })
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
    setMotion(IDLE)
    const here = viewOf(camera)
    // Keep the stretch: the shown point may be banded, so the raw drag is its inverse.
    const { bounds, frame: f } = latest.current
    const shown = { x: here.x, z: here.z }
    pan.current = {
      raw: unbandedTarget(bounds, shown, bandLimit(f, camera.zoom)),
      shown,
    }
    if (m.kind === 'fly') {
      setZoomLimits(
        Math.min(m.to.zoom, here.zoom),
        Math.max(m.to.zoom * MAX_ZOOM_FACTOR, here.zoom),
      )
    }
  }, [camera, setZoomLimits, setMotion])

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
