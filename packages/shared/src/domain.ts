export const TASK_PRIORITIES = ['low', 'med', 'high'] as const
export type TaskPriority = (typeof TASK_PRIORITIES)[number]

export const TASK_SIZES = ['S', 'M', 'L'] as const
export type TaskSize = (typeof TASK_SIZES)[number]

export const TASK_STATUSES = ['todo', 'doing', 'done'] as const
export type TaskStatus = (typeof TASK_STATUSES)[number]

export const LEDGER_KINDS = [
  'task_reward',
  'milestone_bonus',
  'streak_bonus',
  'daily_bonus',
  'purchase',
  'refund',
  'reversal',
] as const
export type LedgerKind = (typeof LEDGER_KINDS)[number]
