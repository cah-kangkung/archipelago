import { describe, expect, test } from 'vitest'
import * as tuning from './tuning'

describe('tuning', () => {
  test('carries the values shipped before 5b, unchanged', () => {
    expect(tuning.HEMISPHERE_INTENSITY).toBeCloseTo(Math.PI * 0.55)
    expect(tuning.DIRECTIONAL_INTENSITY).toBeCloseTo(Math.PI * 0.6)
    expect(tuning.SEA_WAVE_HEIGHT).toBe(0.05)
    expect(tuning.SEA_WAVE_SPEED).toBe(1)
    expect(tuning.JIB_TURN_SPEED).toBe(0.6)
    expect([tuning.FLY_MIN_MS, tuning.FLY_MAX_MS, tuning.SPRING_MS, tuning.FRAMING_MS]).toEqual([
      450, 900, 300, 250,
    ])
    expect([tuning.HOP_FILL, tuning.MS_PER_PX, tuning.PX_PER_DOUBLING]).toEqual([0.8, 0.5, 200])
    expect(tuning.BAND_SHARE).toBe(0.25)
    expect([tuning.INDICATOR_INSET, tuning.INDICATOR_SPACING, tuning.MARKER_SIZE_PX]).toEqual([
      28, 48, 44,
    ])
  })

  test('clampDelta caps a frame at 100ms', () => {
    expect(tuning.clampDelta(0.016)).toBe(0.016)
    expect(tuning.clampDelta(5)).toBe(0.1)
  })
})
