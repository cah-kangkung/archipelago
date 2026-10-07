import type { ThreeEvent } from '@react-three/fiber'

/** A press that travelled further than this (in screen pixels) was a pan, not a tap. */
export const TAP_SLOP_PX = 6

export function onTap<E>(handler: (event: ThreeEvent<E>) => void) {
  return (event: ThreeEvent<E>) => {
    if (event.delta > TAP_SLOP_PX) return
    event.stopPropagation()
    handler(event)
  }
}
