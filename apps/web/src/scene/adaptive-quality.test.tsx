import { useThree } from '@react-three/fiber'
import ReactThreeTestRenderer from '@react-three/test-renderer'
import type * as THREE from 'three'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { AdaptiveQuality } from './adaptive-quality'
import { SEA_LEVEL } from './models/terrain-geometry'
import { Sea } from './sea'

const grab: { dpr?: number } = {}
function Grab() {
  grab.dpr = useThree((s) => s.viewport.dpr)
  return null
}

const original = window.devicePixelRatio
beforeEach(() =>
  Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 2 }),
)
afterEach(() =>
  Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: original }),
)

const bounds = { minX: -10, maxX: 10, minZ: -10, maxZ: 10 }
const heights = (sea: THREE.Mesh) => {
  const position = sea.geometry.getAttribute('position')
  return Array.from({ length: position.count }, (_, i) => position.getY(i))
}

describe('adaptive quality', () => {
  test('the high tier allows 2× DPR; the low tier draws at 1×', async () => {
    const quality = (tier: 'high' | 'low') => (
      <>
        <AdaptiveQuality tier={tier} monitoring={false} onSignal={() => {}} />
        <Grab />
      </>
    )
    const r = await ReactThreeTestRenderer.create(quality('high'))
    expect(grab.dpr).toBe(2)
    await r.update(quality('low'))
    expect(grab.dpr).toBe(1)
  })

  test('the sea waves on high and lies flat when the wave is turned off', async () => {
    const sea = (animate: boolean) => <Sea bounds={bounds} animate={animate} onTapSea={() => {}} />
    const r = await ReactThreeTestRenderer.create(sea(true))
    await r.advanceFrames(3, 0.1)
    const mesh = r.scene.findAll((n) => n.props.name === 'sea')[0]?.instance as THREE.Mesh
    expect(heights(mesh).some((y) => Math.abs(y - SEA_LEVEL) > 1e-3)).toBe(true)
    await r.update(sea(false))
    await r.advanceFrames(3, 0.1)
    // The positions are float32, so "flat" is sea level to float precision.
    expect(heights(mesh).every((y) => Math.abs(y - SEA_LEVEL) < 1e-6)).toBe(true)
  })
})
