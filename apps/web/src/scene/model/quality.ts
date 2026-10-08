import { QUALITY_FLIPFLOPS } from '../tuning'

export type Quality = 'high' | 'low'
/**
 * `changes` counts real high↔low tier changes; once it reaches `QUALITY_FLIPFLOPS` the state is
 * `settled`: low for the rest of the page load.
 */
export type QualityState = { tier: Quality; settled: boolean; changes: number }
export type QualitySignal = 'decline' | 'incline'

export const START_QUALITY: QualityState = { tier: 'high', settled: false, changes: 0 }

/**
 * Settling is counted here rather than with drei's `flipflops`/`onFallback`: drei counts every
 * incline or decline call, so a healthy device repeatedly inclining at the ticker's 30fps would
 * fall back to low within seconds. Only a signal that actually changes the tier counts; any other
 * signal returns the same state object.
 */
export function nextQuality(state: QualityState, signal: QualitySignal): QualityState {
  if (state.settled) return state
  const tier: Quality = signal === 'decline' ? 'low' : 'high'
  if (tier === state.tier) return state
  const changes = state.changes + 1
  if (changes >= QUALITY_FLIPFLOPS) return { tier: 'low', settled: true, changes }
  return { tier, settled: false, changes }
}

export function qualityDpr(tier: Quality): number | [number, number] {
  return tier === 'high' ? [1, 2] : 1
}
