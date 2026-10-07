import type { TaskDto, WorldDto } from '@archipelago/shared'
import { type RefObject, useState } from 'react'
import { type Focus, panelTasks } from '../world/selectors'
import { TaskRow } from './task-row'

export function TaskPanel({
  world,
  focus,
  title,
  today,
  searchRef,
  onNewTask,
  onEditTask,
}: {
  world: WorldDto
  focus: Focus
  title: string
  today: string
  searchRef?: RefObject<HTMLInputElement | null>
  onNewTask?: () => void
  onEditTask?: (task: TaskDto) => void
}) {
  const [query, setQuery] = useState('')
  const needle = query.trim().toLowerCase()
  const tasks = panelTasks(world, focus, today).filter(
    (t) => needle === '' || t.title.toLowerCase().includes(needle),
  )
  const projectNames = new Map(world.projects.map((p) => [p.id, p.name]))

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between gap-2 px-4 pt-3">
        <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
        {onNewTask && focus.kind !== 'archipelago' && (
          <button
            type="button"
            onClick={onNewTask}
            className="min-h-11 rounded-md bg-brand px-3 text-sm font-medium text-text-on-brand"
          >
            New task
          </button>
        )}
      </div>
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
            />
          ))}
        </ul>
      )}
    </div>
  )
}
