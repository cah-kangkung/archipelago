import { ghostMaterial, solidMaterial } from './materials'
import type { SceneDistrict } from './model/scene-model'
import { solidSegments } from './model/state'
import { landmarkSegments } from './models/landmarks'
import { onTap } from './tap'

export function Landmark({ district, onOpen }: { district: SceneDistrict; onOpen?: () => void }) {
  const segments = landmarkSegments(district.type)
  const solid = solidSegments(district.progress, segments.length)
  return (
    <group
      name={`landmark:${district.milestoneId}`}
      position={[district.position.x, district.position.y, district.position.z]}
      onClick={onOpen ? onTap<MouseEvent>(onOpen) : undefined}
    >
      {segments.map((geometry, i) => (
        <mesh
          key={geometry.uuid}
          geometry={geometry}
          material={i < solid ? solidMaterial : ghostMaterial}
        />
      ))}
    </group>
  )
}
