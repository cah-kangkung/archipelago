import { Canvas, useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import type { Focus } from '../world/selectors'
import { CameraRig, ISO_DISTANCE } from './camera-rig'
import { Labels } from './labels'
import { ARCHIPELAGO_ZOOM } from './model/camera'
import { scenePalette } from './model/palette'
import type { SceneModel } from './model/scene-model'
import { startTicker } from './ticker'
import { usePrefersReducedMotion } from './use-reduced-motion'
import { type SceneHandlers, WorldContents } from './world-contents'

export type WorldSceneProps = SceneHandlers & {
  model: SceneModel
  focus: Focus
  selectedTaskId: string | null
}

function AnimationTicker({ enabled }: { enabled: boolean }) {
  const invalidate = useThree((s) => s.invalidate)
  useEffect(() => (enabled ? startTicker(() => invalidate()) : undefined), [enabled, invalidate])
  return null
}

/** The 3D world. Renders on demand; the ticker adds frames only for sea and crane motion. */
export function WorldScene(props: WorldSceneProps) {
  const animate = !usePrefersReducedMotion()
  return (
    <Canvas
      frameloop="demand"
      dpr={[1, 2]}
      orthographic
      flat
      camera={{
        position: [ISO_DISTANCE, ISO_DISTANCE, ISO_DISTANCE],
        zoom: ARCHIPELAGO_ZOOM,
        near: 0.1,
        far: 2000,
      }}
      className="touch-none"
    >
      <color attach="background" args={[scenePalette.sea]} />
      <WorldContents {...props} animate={animate} />
      <Labels model={props.model} focus={props.focus} />
      <CameraRig model={props.model} focus={props.focus} />
      <AnimationTicker enabled={animate} />
    </Canvas>
  )
}
