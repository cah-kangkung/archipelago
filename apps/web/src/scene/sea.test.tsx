import ReactThreeTestRenderer from '@react-three/test-renderer'
import type * as THREE from 'three'
import { describe, expect, test } from 'vitest'
import { shallowsRadius } from './model/hex-space'
import { Sea } from './sea'

const shore = { origin: { x: 0, z: 0 }, radius: 4 }
const bounds = { minX: -8, maxX: 8, minZ: -8, maxZ: 8 }

async function seaMesh() {
  const r = await ReactThreeTestRenderer.create(
    <Sea bounds={bounds} islands={[shore]} animate={false} onTapSea={() => {}} />,
  )
  return r.scene.find((n) => n.props.name === 'sea').instance as THREE.Mesh
}

describe('Sea', () => {
  test('is flat-shaded with vertex colours', async () => {
    const material = (await seaMesh()).material as THREE.MeshLambertMaterial
    expect(material.flatShading).toBe(true)
    expect(material.vertexColors).toBe(true)
  })

  test('is lighter at the shallows than far out', async () => {
    const geometry = (await seaMesh()).geometry
    const position = geometry.getAttribute('position')
    const color = geometry.getAttribute('color')
    let near = { i: 0, gap: Infinity }
    let far = { i: 0, d: -Infinity }
    for (let i = 0; i < position.count; i++) {
      const d = Math.hypot(position.getX(i), position.getZ(i))
      const gap = Math.abs(d - shallowsRadius(4))
      if (gap < near.gap) near = { i, gap }
      if (d > far.d) far = { i, d }
    }
    const brightness = (i: number) => color.getX(i) + color.getY(i) + color.getZ(i)
    expect(brightness(near.i)).toBeGreaterThan(brightness(far.i))
  })
})
