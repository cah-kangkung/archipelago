import { useThree } from '@react-three/fiber'
import { useEffect } from 'react'

/** Calls `onLeave` when the pointer leaves the canvas element; renders nothing. */
export function CanvasLeave({ onLeave }: { onLeave: () => void }) {
  const element = useThree((s) => s.gl.domElement)
  useEffect(() => {
    element.addEventListener('pointerleave', onLeave)
    return () => element.removeEventListener('pointerleave', onLeave)
  }, [element, onLeave])
  return null
}
