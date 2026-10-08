import type { MilestoneDto, TaskDto, WorldDto } from '@archipelago/shared'
import { type RefObject, useEffect, useState } from 'react'
import { type Focus, panelTasks } from '../world/selectors'
import { TaskRow } from './task-row'

/** Milestone select values that are not milestone ids (spec 19.4). */
export const ALL_TASKS = 'all'
export const NO_MILESTONE = 'none'

export function TaskPanel({
  world,
  focus,
  title,
  today,
  searchRef,
  onNewTask,
  onEditTask,
  selectedTaskId = null,
  milestones,
  milestoneValue,
  onMilestoneChange,
  commonsOnly,
}: {
  world: WorldDto
  focus: Focus
  title: string
  today: string
  searchRef?: RefObject<HTMLInputElement | null>
  onNewTask?: () => void
  onEditTask?: (task: TaskDto) => void
  selectedTaskId?: string | null
  /** The island's milestones in order; with `onMilestoneChange`, shows the milestone select. */
  milestones?: readonly MilestoneDto[]
  /** ALL_TASKS, NO_MILESTONE or a milestone id. */
  milestoneValue?: string
  onMilestoneChange?: (value: string) => void
  /** Only tasks with no milestone ("No milestone" on the island). */
  commonsOnly?: boolean
}) {
  const [query, setQuery] = useState('')
  const needle = query.trim().toLowerCase()
  const tasks = panelTasks(world, focus, today).filter(
    (t) =>
      (!commonsOnly || t.milestoneId === null) &&
      (needle === '' || t.title.toLowerCase().includes(needle)),
  )
  // A new selection must be visible: clear a search that hides it. Typing afterwards is respected.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the selection is the trigger
  useEffect(() => {
    if (selectedTaskId && !tasks.some((t) => t.id === selectedTaskId)) setQuery('')
  }, [selectedTaskId])
  const projectNames = new Map(world.projects.map((p) => [p.id, p.name]))

  return (
    <div className="flex flex-col">
      <div className="px-4 pt-3">
        <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
      </div>
      {focus.kind !== 'archipelago' && (onNewTask || (milestones && onMilestoneChange)) && (
        <div className="flex items-center gap-2 px-4 pt-2">
          {milestones && onMilestoneChange && (
            <label className="min-w-0 flex-1">
              <span className="sr-only">Milestone</span>
              <select
                value={milestoneValue ?? ALL_TASKS}
                onChange={(e) => onMilestoneChange(e.target.value)}
                className="min-h-11 w-full rounded-md border border-border-secondary bg-surface-primary px-3 text-base"
              >
                <option value={ALL_TASKS}>All tasks</option>
                <option value={NO_MILESTONE}>No milestone</option>
                {milestones.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {onNewTask && (
            <button
              type="button"
              onClick={onNewTask}
              className="ml-auto min-h-11 shrink-0 rounded-md bg-brand px-3 text-sm font-medium text-text-on-brand"
            >
              New task
            </button>
          )}
        </div>
      )}
      <label className="block px-4 py-2">
        <span className="sr-only">Search tasks</span>
        <input
          ref={searchRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search tasks"
          className="min-h-11 w-full rounded-md border border-border-secondary px-3 text-base"
        />
      </label>
      {tasks.length === 0 ? (
        <p className="px-4 py-6 text-center text-text-secondary">
          {focus.kind === 'archipelago' ? 'Nothing due today. Nice work.' : 'No tasks here yet.'}
        </p>
      ) : (
        <ul>
          {tasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              today={today}
              projectName={
                focus.kind === 'archipelago' ? projectNames.get(task.projectId) : undefined
              }
              onEdit={onEditTask}
              selected={task.id === selectedTaskId}
            />
          ))}
        </ul>
      )}
    </div>
  )
}
