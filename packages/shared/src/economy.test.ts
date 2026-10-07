import { describe, expect, test } from 'bun:test'
import {
  addDays,
  currentStreak,
  DAILY_BONUS,
  economySnapshot,
  emptyEconomy,
  localDate,
  milestoneBonus,
  nextStreakBonus,
  runEndingOn,
  streakWindowIntact,
  taskReward,
} from './economy'

const days = (...list: string[]) => new Set(list)

describe('taskReward', () => {
  test('base rewards by size without a due date', () => {
    expect(taskReward('S', null, '2026-10-07')).toBe(10)
    expect(taskReward('M', null, '2026-10-07')).toBe(25)
    expect(taskReward('L', null, '2026-10-07')).toBe(60)
  })

  test('on or before the due date pays ×1.5, floored', () => {
    expect(taskReward('S', '2026-10-07', '2026-10-07')).toBe(15)
    expect(taskReward('M', '2026-10-07', '2026-10-01')).toBe(37)
    expect(taskReward('L', '2026-10-07', '2026-10-07')).toBe(90)
  })

  test('after the due date pays base', () => {
    expect(taskReward('M', '2026-10-07', '2026-10-08')).toBe(25)
  })
})

describe('milestoneBonus', () => {
  test('half the summed base rewards, floored', () => {
    expect(milestoneBonus(['M', 'S'])).toBe(17)
    expect(milestoneBonus(['M', 'M', 'S'])).toBe(30)
    expect(milestoneBonus(['L'])).toBe(30)
    expect(milestoneBonus([])).toBe(0)
  })
})

describe('localDate / addDays', () => {
  test('uses the given timezone, not UTC', () => {
    const instant = new Date('2026-10-06T18:00:00Z')
    expect(localDate(instant, 'Asia/Jakarta')).toBe('2026-10-07')
    expect(localDate(instant, 'UTC')).toBe('2026-10-06')
    expect(localDate(instant, 'America/Los_Angeles')).toBe('2026-10-06')
  })

  test('addDays crosses months and years', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31')
    expect(addDays('2026-10-07', 0)).toBe('2026-10-07')
  })
})

describe('streak math', () => {
  test('runEndingOn walks back over consecutive days', () => {
    const set = days('2026-10-03', '2026-10-05', '2026-10-06', '2026-10-07')
    expect(runEndingOn(set, '2026-10-07')).toEqual({ start: '2026-10-05', length: 3 })
    expect(runEndingOn(set, '2026-10-03')).toEqual({ start: '2026-10-03', length: 1 })
    expect(runEndingOn(set, '2026-10-04')).toBeNull()
  })

  test('currentStreak counts today, else the run ending yesterday, else 0', () => {
    expect(currentStreak(days('2026-10-06', '2026-10-07'), '2026-10-07')).toEqual({
      days: 2,
      activeToday: true,
    })
    expect(currentStreak(days('2026-10-05', '2026-10-06'), '2026-10-07')).toEqual({
      days: 2,
      activeToday: false,
    })
    expect(currentStreak(days('2026-10-05'), '2026-10-07')).toEqual({
      days: 0,
      activeToday: false,
    })
  })

  test('nextStreakBonus is the first threshold above the streak', () => {
    expect(nextStreakBonus(0)).toEqual({ days: 3, amount: 20 })
    expect(nextStreakBonus(3)).toEqual({ days: 7, amount: 50 })
    expect(nextStreakBonus(29)).toEqual({ days: 30, amount: 200 })
    expect(nextStreakBonus(30)).toBeNull()
  })

  test('streakWindowIntact needs every day in the window', () => {
    const set = days('2026-10-01', '2026-10-02', '2026-10-03')
    expect(streakWindowIntact(set, '2026-10-01', 3)).toBe(true)
    expect(streakWindowIntact(set, '2026-10-01', 4)).toBe(false)
    expect(streakWindowIntact(days('2026-10-01', '2026-10-03'), '2026-10-01', 3)).toBe(false)
  })
})

describe('economySnapshot', () => {
  test('assembles balance, streak, next bonus and daily state', () => {
    const snapshot = economySnapshot({
      balance: 42,
      days: days('2026-10-06', '2026-10-07'),
      today: '2026-10-07',
      claimedToday: true,
    })
    expect(snapshot).toEqual({
      balance: 42,
      streak: { days: 2, activeToday: true, next: { days: 3, amount: 20 } },
      daily: { amount: DAILY_BONUS, claimedToday: true },
    })
  })

  test('emptyEconomy is a new user', () => {
    expect(emptyEconomy()).toEqual({
      balance: 0,
      streak: { days: 0, activeToday: false, next: { days: 3, amount: 20 } },
      daily: { amount: 15, claimedToday: false },
    })
  })

  test('localDate stays correct when zones are interleaved and reused', () => {
    const instant = new Date('2026-10-07T20:00:00Z')
    const results = [
      localDate(instant, 'UTC'),
      localDate(instant, 'Asia/Jakarta'),
      localDate(instant, 'UTC'),
      localDate(instant, 'Asia/Jakarta'),
    ]
    expect(results).toEqual(['2026-10-07', '2026-10-08', '2026-10-07', '2026-10-08'])
  })
})
