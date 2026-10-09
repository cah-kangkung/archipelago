import ReactThreeTestRenderer from '@react-three/test-renderer'
import type * as THREE from 'three'
import { describe, expect, test } from 'vitest'
import { shoreOf } from '../test/shore'
import { SHALLOWS_REACH, worldToHex } from './model/hex-space'
import { Sea } from './sea'

const shore = shoreOf(5, 4)
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
      const edge = Math.min(
        ...shore.coast.map((c) => Math.hypot(position.getX(i) - c.x, position.getZ(i) - c.z)),
      )
      const gap = Math.abs(edge - SHALLOWS_REACH)
      if (gap < near.gap) near = { i, gap }
      if (d > far.d) far = { i, d }
    }
    const brightness = (i: number) => color.getX(i) + color.getY(i) + color.getZ(i)
    expect(brightness(near.i)).toBeGreaterThan(brightness(far.i))
  })

  test('over the land the sea takes the shallow colour', async () => {
    const geometry = (await seaMesh()).geometry
    const position = geometry.getAttribute('position')
    const color = geometry.getAttribute('color')
    const covered: number[] = []
    for (let i = 0; i < position.count; i++) {
      const h = worldToHex({ x: position.getX(i), z: position.getZ(i) })
      if (shore.cover.has(`${h.q},${h.r}`)) covered.push(i)
    }
    expect(covered.length).toBeGreaterThan(0)
    const shallow = covered[0] as number
    for (const i of covered) {
      expect(color.getX(i)).toBeCloseTo(color.getX(shallow))
      expect(color.getY(i)).toBeCloseTo(color.getY(shallow))
      expect(color.getZ(i)).toBeCloseTo(color.getZ(shallow))
    }
  })
})
