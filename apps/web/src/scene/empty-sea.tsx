import { Html } from '@react-three/drei'
import { useEffect, useMemo } from 'react'
import { UnchartedCard } from '../world/uncharted-card'
import { ghostMaterial } from './materials'
import { LAND_HEIGHT } from './model/hex-space'
import { UNCHARTED_SEED, UNCHARTED_SIZE } from './model/sea-depth'
import { islandTerrain, shallowsHexes } from './model/terrain'
import { islandGeometry } from './models/terrain-geometry'

/** Same as the labels': the HUD (z-20) and sheet stay above the card. */
const CARD_Z: [number, number] = [10, 0]

/** The empty world (spec 17.4): a still ghost island at the origin with the first-island prompt. */
export function EmptySea({ onCreate }: { onCreate?: () => void }) {
  const geometry = useMemo(() => {
    const tiles = islandTerrain(UNCHARTED_SEED, UNCHARTED_SIZE)
    return islandGeometry(tiles, shallowsHexes(tiles))
  }, [])
  useEffect(() => () => geometry.dispose(), [geometry])
  return (
    <group name="uncharted">
      <mesh name="uncharted-terrain" geometry={geometry} material={ghostMaterial} />
      <Html center zIndexRange={CARD_Z} position={[0, LAND_HEIGHT + 2, 0]}>
        <UnchartedCard onCreate={onCreate} />
      </Html>
    </group>
  )
}
