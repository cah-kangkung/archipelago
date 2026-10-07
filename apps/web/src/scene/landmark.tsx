import { ghostMaterial, solidMaterial } from './materials'
import { LAND_HEIGHT } from './model/hex-space'
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
      position={[district.position.x, LAND_HEIGHT, district.position.z]}
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
