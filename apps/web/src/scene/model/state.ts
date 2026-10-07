import type { LandmarkType, MilestoneDto, TaskDto } from '@archipelago/shared'
import { dueStatus } from '../../world/selectors'

export type StructureKind = 'scaffold' | 'crane' | 'hut' | 'house' | 'workshop'
export type Marker = 'storm' | 'lantern' | null

export const STRUCTURE_KINDS: readonly StructureKind[] = [
  'scaffold',
  'crane',
  'hut',
  'house',
  'workshop',
]

const builtBySize = { S: 'hut', M: 'house', L: 'workshop' } as const

/** What a task looks like in the world: its structure and an optional due-date marker (spec §2). */
export function structureFor(
  task: Pick<TaskDto, 'status' | 'size' | 'dueDate'>,
  today: string,
): { kind: StructureKind; marker: Marker } {
  const kind: StructureKind =
    task.status === 'todo' ? 'scaffold' : task.status === 'doing' ? 'crane' : builtBySize[task.size]
  const due = dueStatus(task, today)
  return { kind, marker: due === 'overdue' ? 'storm' : due === 'due-soon' ? 'lantern' : null }
}

export function landmarkFor(
  milestone: Pick<MilestoneDto, 'landmarkType' | 'completedAt'>,
  tasks: readonly Pick<TaskDto, 'status'>[],
): { type: LandmarkType; progress: number } {
  const type = milestone.landmarkType
  if (milestone.completedAt !== null) return { type, progress: 1 }
  if (tasks.length === 0) return { type, progress: 0 }
  return { type, progress: tasks.filter((t) => t.status === 'done').length / tasks.length }
}

/** How many of a landmark's `n` stacked segments are built at `progress`. */
export function solidSegments(progress: number, n: number): number {
  return Math.min(n, Math.ceil(progress * n))
}
