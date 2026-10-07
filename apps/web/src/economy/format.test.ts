import { describe, expect, test } from 'vitest'
import { formatReversals, formatRewards } from './format'

describe('formatRewards', () => {
  test('lists each reward in order', () => {
    expect(
      formatRewards([
        { kind: 'task_reward', amount: 37, streakDays: null },
        { kind: 'milestone_bonus', amount: 40, streakDays: null },
        { kind: 'streak_bonus', amount: 20, streakDays: 3 },
      ]),
    ).toBe('+37 Supplies · Milestone bonus +40 · 3-day streak +20')
    expect(formatRewards([{ kind: 'daily_bonus', amount: 15, streakDays: null }])).toBe(
      'Daily bonus +15',
    )
  })

  test('nothing to say for no rewards', () => {
    expect(formatRewards([])).toBeNull()
  })
})

describe('formatReversals', () => {
  test('totals what was taken back', () => {
    expect(
      formatReversals([
        { kind: 'task_reward', amount: 10, streakDays: null },
        { kind: 'milestone_bonus', amount: 17, streakDays: null },
      ]),
    ).toBe('27 Supplies taken back')
    expect(formatReversals([])).toBeNull()
  })
})
