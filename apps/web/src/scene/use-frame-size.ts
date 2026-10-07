import { useThree } from '@react-three/fiber'
import { type Frame, framedCover } from './model/screen'

/** The canvas size plus how much of it the phone sheet covers, and how much of that is framed. */
export function useFrameSize(covered: number): Frame {
  const size = useThree((s) => s.size)
  return {
    width: size.width,
    height: size.height,
    covered,
    framed: framedCover(covered, window.innerHeight),
  }
}
