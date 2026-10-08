import { useFrame, useThree } from '@react-three/fiber'
import { useLayoutEffect, useMemo } from 'react'
import * as THREE from 'three'
import { fogRange } from './model/horizon'
import { scenePalette } from './model/palette'
import type { Bounds } from './model/scene-model'

/**
 * Fades everything past the archipelago's far edge into the background (spec 17.3). It updates
 * on frames that render anyway and never asks for one.
 */
export function FogRig({ bounds }: { bounds: Bounds }) {
  const scene = useThree((s) => s.scene)
  const fog = useMemo(() => new THREE.Fog(scenePalette.seaDeep, 1, 2), [])
  useLayoutEffect(() => {
    scene.fog = fog
    return () => {
      scene.fog = null
    }
  }, [scene, fog])
  useFrame(({ camera }) => {
    const { near, far } = fogRange(camera.position, bounds)
    fog.near = near
    fog.far = far
  })
  return null
}
