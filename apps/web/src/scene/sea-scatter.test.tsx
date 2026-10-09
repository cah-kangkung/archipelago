import ReactThreeTestRenderer from '@react-three/test-renderer'
import type * as THREE from 'three'
import { describe, expect, test } from 'vitest'
import { shoreOf } from '../test/shore'
import type { SceneModel } from './model/scene-model'
import { SeaScatter } from './sea-scatter'

const island = (size: number): SceneModel['islands'][number] =>
  ({
    projectId: 'p0',
    slot: { q: 0, r: 0 },
    ...shoreOf(5, size),
  }) as SceneModel['islands'][number]
const model = (size: number): Pick<SceneModel, 'islands' | 'bounds'> => ({
  islands: [island(size)],
  bounds: { minX: -8, maxX: 8, minZ: -8, maxZ: 8 },
})

function matrixVersions(r: Awaited<ReturnType<typeof ReactThreeTestRenderer.create>>) {
  return r.scene
    .findAll((n) => String(n.props.name).startsWith('scatter:'))
    .map((n) => (n.instance as THREE.InstancedMesh).instanceMatrix.version)
}

function matrixData(r: Awaited<ReturnType<typeof ReactThreeTestRenderer.create>>) {
  return r.scene
    .findAll((n) => String(n.props.name).startsWith('scatter:'))
    .map((n) => Array.from((n.instance as THREE.InstancedMesh).instanceMatrix.array))
}

describe('SeaScatter', () => {
  test('a fresh but equal model leaves the instance matrices untouched; a new layout rewrites them', async () => {
    const r = await ReactThreeTestRenderer.create(<SeaScatter model={model(4)} />)
    const before = matrixVersions(r)
    const placed = matrixData(r)
    expect(before.length).toBeGreaterThan(0)
    await r.update(<SeaScatter model={model(4)} />)
    expect(matrixVersions(r)).toEqual(before)
    await r.update(<SeaScatter model={model(6)} />)
    expect(matrixData(r)).not.toEqual(placed)
  })
})
