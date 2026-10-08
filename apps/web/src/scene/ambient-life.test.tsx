import ReactThreeTestRenderer from '@react-three/test-renderer'
import * as THREE from 'three'
import { describe, expect, test } from 'vitest'
import { AmbientLifeLayer } from './ambient-life'
import { foamMaterial } from './materials'
import { type AmbientLife, boatPose } from './model/ambient-life'

type Renderer = Awaited<ReturnType<typeof ReactThreeTestRenderer.create>>

const shore = { origin: { x: 0, z: 0 }, radius: 4 }
const loop = { kind: 'loop' as const, key: 'loop|p0', center: { x: 0, z: 0 }, radius: 11 }
const life: AmbientLife = {
  boats: [
    { route: loop, phase: 0.1 },
    { route: loop, phase: 0.6 },
  ],
  flocks: [{ projectId: 'p0', center: { x: 0, z: 0 }, radius: 4.8, phase: 0.2 }],
  whale: { spot: { x: 30, z: 0 }, turn: 0, interval: 30, phase: 0 },
}

const named = (r: Renderer, name: string) => r.scene.findAll((n) => n.props.name === name)
function matrices(r: Renderer, name: string): number[][] {
  const [node] = named(r, name)
  if (!node) throw new Error(`no ${name}`)
  const mesh = node.instance as THREE.InstancedMesh
  const m = new THREE.Matrix4()
  return Array.from({ length: mesh.count }, (_, i) => {
    mesh.getMatrixAt(i, m)
    return [...m.elements]
  })
}
const count = (r: Renderer, name: string) =>
  ((named(r, name)[0]?.instance ?? { count: -1 }) as THREE.InstancedMesh).count
const make = (animate: boolean, l: AmbientLife = life) =>
  ReactThreeTestRenderer.create(<AmbientLifeLayer life={l} islands={[shore]} animate={animate} />)

function foamGeometryOf(r: Renderer) {
  const [node] = named(r, 'foam')
  if (!node) throw new Error('no foam')
  return (node.instance as THREE.Mesh).geometry
}

describe('AmbientLifeLayer', () => {
  test('one instanced mesh per kind, sized to the life, none of it tappable', async () => {
    const r = await make(true)
    expect(count(r, 'boats')).toBe(2)
    expect(count(r, 'gulls')).toBe(3)
    for (const name of ['boats', 'gulls', 'whale', 'splash', 'foam']) {
      for (const n of named(r, name)) expect(n.props.onClick).toBeUndefined()
    }
  })

  test('on high, boats and gulls move from frame to frame', async () => {
    const r = await make(true)
    await r.advanceFrames(1, 0.1)
    const boats = matrices(r, 'boats')
    const gulls = matrices(r, 'gulls')
    await r.advanceFrames(2, 0.1)
    expect(matrices(r, 'boats')).not.toEqual(boats)
    expect(matrices(r, 'gulls')).not.toEqual(gulls)
  })

  test('on low, everything holds its t=0 pose; the whale is gone and the foam is still', async () => {
    const r = await make(false)
    const boats = matrices(r, 'boats')
    const gulls = matrices(r, 'gulls')
    await r.advanceFrames(5, 0.1)
    expect(matrices(r, 'boats')).toEqual(boats)
    expect(matrices(r, 'gulls')).toEqual(gulls)
    const first = life.boats[0]
    if (!first) throw new Error('no boat')
    const p = boatPose(first, 0).position
    expect(boats[0]?.[12]).toBeCloseTo(p.x)
    expect(boats[0]?.[14]).toBeCloseTo(p.z)
    expect(named(r, 'whale')).toHaveLength(0)
    expect(named(r, 'splash')).toHaveLength(0)
    expect(named(r, 'foam')).toHaveLength(1)
    expect(foamMaterial.opacity).toBeCloseTo(0.45)
  })

  test('dropping to low mid-voyage snaps back to the t=0 pose and stops', async () => {
    const r = await make(false)
    const still = matrices(r, 'boats')
    await r.update(<AmbientLifeLayer life={life} islands={[shore]} animate />)
    await r.advanceFrames(4, 0.1)
    expect(matrices(r, 'boats')).not.toEqual(still)
    await r.update(<AmbientLifeLayer life={life} islands={[shore]} animate={false} />)
    expect(matrices(r, 'boats')).toEqual(still)
    await r.advanceFrames(4, 0.1)
    expect(matrices(r, 'boats')).toEqual(still)
  })

  test('no life draws only the foam; no islands draw nothing', async () => {
    const none: AmbientLife = { boats: [], flocks: [], whale: null }
    const r = await make(true, none)
    for (const name of ['boats', 'gulls', 'whale']) expect(named(r, name)).toHaveLength(0)
    expect(named(r, 'foam')).toHaveLength(1)
    const empty = await ReactThreeTestRenderer.create(
      <AmbientLifeLayer life={none} islands={[]} animate />,
    )
    expect(empty.scene.findAll((n) => n.props.name === 'foam')).toHaveLength(0)
  })

  test('a rerender with fresh but equal islands keeps the same foam geometry', async () => {
    const r = await ReactThreeTestRenderer.create(
      <AmbientLifeLayer life={life} islands={[{ ...shore }]} animate />,
    )
    const geometry = foamGeometryOf(r)
    await r.update(<AmbientLifeLayer life={life} islands={[{ ...shore }]} animate />)
    expect(foamGeometryOf(r)).toBe(geometry)
    await r.update(<AmbientLifeLayer life={life} islands={[{ ...shore, radius: 5 }]} animate />)
    expect(foamGeometryOf(r)).not.toBe(geometry)
  })
})
