import { useThree } from '@react-three/fiber'
import ReactThreeTestRenderer from '@react-three/test-renderer'
import { describe, expect, test, vi } from 'vitest'
import { CanvasLeave } from './canvas-leave'

let canvas: HTMLElement | null = null
function Probe() {
  canvas = useThree((s) => s.gl.domElement)
  return null
}

describe('CanvasLeave', () => {
  test('a DOM pointerleave on the canvas calls back; unmounting stops listening', async () => {
    const onLeave = vi.fn()
    const r = await ReactThreeTestRenderer.create(
      <>
        <Probe />
        <CanvasLeave onLeave={onLeave} />
      </>,
    )
    canvas?.dispatchEvent(new Event('pointerleave'))
    expect(onLeave).toHaveBeenCalledTimes(1)
    await r.unmount()
    canvas?.dispatchEvent(new Event('pointerleave'))
    expect(onLeave).toHaveBeenCalledTimes(1)
  })
})
