import { useRef } from 'react'
import type { Shore } from './model/sea-depth'

export const shoreKey = (shores: readonly Shore[]) =>
  shores.map((s) => `${s.origin.x},${s.origin.z},${s.radius},${s.size}`).join(';')

/** The same array while the layout is unchanged, so a refetch does not redo layout-derived work. */
export function useStableShores<T extends Shore>(
  shores: readonly T[],
  key: (shores: readonly T[]) => string = shoreKey,
): readonly T[] {
  const ref = useRef(shores)
  if (key(ref.current) !== key(shores)) ref.current = shores
  return ref.current
}
