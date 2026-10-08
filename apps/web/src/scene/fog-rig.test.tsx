import { type Camera, useThree } from '@react-three/fiber'
import ReactThreeTestRenderer from '@react-three/test-renderer'
import * as THREE from 'three'
import { describe, expect, test } from 'vitest'
import { FogRig } from './fog-rig'
import { fogRange } from './model/horizon'
import { scenePalette } from './model/palette'

const bounds = { minX: -20, maxX: 30, minZ: -10, maxZ: 25 }

describe('FogRig', () => {
  test('sets a sea-deep fog that follows the camera across a pan', async () => {
    const seen: { camera?: Camera } = {}
    function Probe() {
      seen.camera = useThree((s) => s.camera)
      return null
    }
    const r = await ReactThreeTestRenderer.create(
      <>
        <Probe />
        <FogRig bounds={bounds} />
      </>,
    )
    const cam = seen.camera
    if (!cam) throw new Error('no camera')
    cam.position.set(200, 200, 200)
    await r.advanceFrames(1, 0.016)
    const fog = (r.scene.instance as THREE.Scene).fog
    expect(fog).toBeInstanceOf(THREE.Fog)
    const f = fog as THREE.Fog
    expect(`#${f.color.getHexString()}`).toBe(scenePalette.seaDeep)
    expect(f.near).toBeCloseTo(fogRange(cam.position, bounds).near)
    cam.position.set(240, 200, 180)
    await r.advanceFrames(1, 0.016)
    expect(f.near).toBeCloseTo(fogRange(cam.position, bounds).near)
    expect(f.far).toBeCloseTo(fogRange(cam.position, bounds).far)
  })
})
