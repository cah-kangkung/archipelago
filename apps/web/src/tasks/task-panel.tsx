import type { TaskDto, WorldDto } from '@archipelago/shared'
import { MagnifyingGlass, Plus } from '@phosphor-icons/react'
import { type RefObject, useEffect, useState } from 'react'
import { inputClass } from '../editors/fields'
import { Button } from '../ui/button'
import { Icon } from '../ui/icon'
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
  selectedTaskId = null,
}: {
  world: WorldDto
  focus: Focus
  title: string
  today: string
  searchRef?: RefObject<HTMLInputElement | null>
  onNewTask?: () => void
  onEditTask?: (task: TaskDto) => void
  selectedTaskId?: string | null
}) {
  const [query, setQuery] = useState('')
  const needle = query.trim().toLowerCase()
  const tasks = panelTasks(world, focus, today).filter(
    (t) => needle === '' || t.title.toLowerCase().includes(needle),
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
        <h2 className="text-heading font-heading text-text-primary">{title}</h2>
      </div>
      {focus.kind !== 'archipelago' && onNewTask && (
        <div className="flex items-center gap-2 px-4 pt-2">
          <Button size="sm" icon={Plus} onClick={onNewTask} className="ml-auto">
            New task
          </Button>
        </div>
      )}
      <label className="relative block px-4 py-2">
        <span className="sr-only">Search tasks</span>
        <Icon
          icon={MagnifyingGlass}
          className="pointer-events-none absolute top-1/2 left-7 -translate-y-1/2 text-text-tertiary"
        />
        <input
          ref={searchRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search tasks"
          className={`${inputClass} pl-10`}
        />
      </label>
      {tasks.length === 0 ? (
        <p className="px-4 py-6 text-center text-body text-text-secondary">
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
