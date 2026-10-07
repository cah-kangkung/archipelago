import type { RewardDto } from '@archipelago/shared'

function describe(reward: RewardDto): string {
  switch (reward.kind) {
    case 'task_reward':
      return `+${reward.amount} Supplies`
    case 'milestone_bonus':
      return `Milestone bonus +${reward.amount}`
    case 'streak_bonus':
      return `${reward.streakDays}-day streak +${reward.amount}`
    case 'daily_bonus':
      return `Daily bonus +${reward.amount}`
  }
}

export function formatRewards(rewards: RewardDto[]): string | null {
  return rewards.length === 0 ? null : rewards.map(describe).join(' · ')
}

export function formatReversals(reversals: RewardDto[]): string | null {
  const total = reversals.reduce((sum, r) => sum + r.amount, 0)
  return total === 0 ? null : `${total} Supplies taken back`
}
