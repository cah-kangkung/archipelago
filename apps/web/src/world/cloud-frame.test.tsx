import { act, render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { scenePalette } from '../scene/model/palette'
import {
  CLOUD_FRAME_ALPHA,
  CLOUD_FRAME_DRIFT_S,
  CLOUD_FRAME_ISLAND_SCALE,
  CLOUD_FRAME_MS,
} from '../scene/tuning'
import { setReducedMotion } from '../test/viewport'
import { CloudFrame } from './cloud-frame'
import { cloudFrameState } from './cloud-frame-state'
import type { Focus } from './selectors'

const archipelago: Focus = { kind: 'archipelago' }
const island: Focus = { kind: 'island', projectId: 'p1' }
const district: Focus = { kind: 'district', projectId: 'p1', milestoneId: 'm1' }

const frame = () => screen.getByTestId('cloud-frame')
const wisps = () => screen.getByTestId('cloud-frame-wisps')

describe('cloudFrameState', () => {
  test('hidden on the archipelago, at the island scale so going in only fades', () => {
    expect(cloudFrameState(archipelago)).toEqual({ shown: false, scale: CLOUD_FRAME_ISLAND_SCALE })
  })

  test('pushed out on an island, drawn in for a district', () => {
    expect(cloudFrameState(island)).toEqual({ shown: true, scale: CLOUD_FRAME_ISLAND_SCALE })
    expect(cloudFrameState(district)).toEqual({ shown: true, scale: 1 })
  })
})

describe('CloudFrame', () => {
  test('is transparent on the archipelago and shown inside a layer', () => {
    const { rerender } = render(<CloudFrame focus={archipelago} coveredBottom={0} />)
    expect(frame().style.opacity).toBe('0')
    rerender(<CloudFrame focus={island} coveredBottom={0} />)
    expect(frame().style.opacity).toBe(String(CLOUD_FRAME_ALPHA))
    expect(frame().style.transform).toBe(`scale(${CLOUD_FRAME_ISLAND_SCALE})`)
    rerender(<CloudFrame focus={district} coveredBottom={0} />)
    expect(frame().style.opacity).toBe(String(CLOUD_FRAME_ALPHA))
    expect(frame().style.transform).toBe('scale(1)')
  })

  test('never catches taps and is hidden from assistive tech', () => {
    render(<CloudFrame focus={island} coveredBottom={0} />)
    expect(frame()).toHaveClass('pointer-events-none')
    expect(frame()).toHaveAttribute('aria-hidden', 'true')
  })

  test('frames only the canvas above the sheet, following it without easing', () => {
    const { rerender } = render(<CloudFrame focus={island} coveredBottom={120} />)
    expect(frame().style.bottom).toBe('120px')
    rerender(<CloudFrame focus={island} coveredBottom={300} />)
    expect(frame().style.bottom).toBe('300px')
    expect(frame().style.transition).toBe(
      `opacity ${CLOUD_FRAME_MS}ms ease-out, transform ${CLOUD_FRAME_MS}ms ease-out`,
    )
    expect(frame().style.transition).not.toContain('bottom')
  })

  test('drifts one tile per loop', () => {
    render(<CloudFrame focus={island} coveredBottom={0} />)
    expect(wisps().style.animation).toBe(`cloud-drift ${CLOUD_FRAME_DRIFT_S}s linear infinite`)
  })

  test('under reduced motion it neither eases nor drifts, even when switched on live', () => {
    render(<CloudFrame focus={island} coveredBottom={0} />)
    expect(wisps().style.animation).not.toBe('none')
    act(() => setReducedMotion(true))
    expect(frame().style.transition).toBe('none')
    expect(wisps().style.animation).toBe('none')
  })

  test('without a 2D canvas the wisps are the plain cloud colour', () => {
    render(<CloudFrame focus={island} coveredBottom={0} />)
    expect(wisps().style.backgroundImage).toBe('')
    expect(wisps().style.backgroundColor).not.toBe('')
    // jsdom reports colours as rgb(); compare against the palette hex.
    const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(scenePalette.cloud.slice(i, i + 2), 16))
    expect(wisps().style.backgroundColor).toBe(`rgb(${r}, ${g}, ${b})`)
  })
})
