import type { TaskDto } from '@archipelago/shared'
import { dueStatus } from '../world/selectors'
import { useAdvanceTask, useDeleteTask } from './use-task-actions'

const nextLabel = { todo: 'doing', doing: 'done', done: 'not done' } as const
const statusStyle = {
  todo: 'border-border-secondary bg-surface-primary',
  doing: 'border-brand-secondary bg-brand-secondary/20',
  done: 'border-success bg-success text-text-on-brand',
} as const
const statusGlyph = { todo: '', doing: '…', done: '✓' } as const

export function TaskRow({
  task,
  today,
  projectName,
  onEdit,
}: {
  task: TaskDto
  today: string
  projectName?: string
  onEdit?: (task: TaskDto) => void
}) {
  const advance = useAdvanceTask()
  const remove = useDeleteTask()
  const busy = advance.isPending || remove.isPending
  const due = dueStatus(task, today)

  const onDelete = () => {
    if (window.confirm(`Delete "${task.title}"?`)) remove.mutate(task)
  }

  return (
    <li className="flex items-start gap-3 border-b border-border-primary px-4 py-3">
      <button
        type="button"
        aria-label={`Mark "${task.title}" as ${nextLabel[task.status]}`}
        disabled={busy}
        onClick={() => advance.mutate(task)}
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-md border-2 text-lg disabled:opacity-60 ${statusStyle[task.status]}`}
      >
        {statusGlyph[task.status]}
      </button>
      <div className="min-w-0 flex-1 py-1">
        <p
          className={
            task.status === 'done' ? 'text-text-tertiary line-through' : 'text-text-primary'
          }
        >
          {task.title}
        </p>
        <p className="text-xs text-text-secondary">
          {projectName && <span>{projectName} · </span>}
          {due === 'overdue' && <span className="text-error">Overdue · {task.dueDate}</span>}
          {due === 'due-soon' && <span className="text-warning">Due soon · {task.dueDate}</span>}
        </p>
      </div>
      {onEdit && (
        <button
          type="button"
          aria-label={`Edit "${task.title}"`}
          onClick={() => onEdit(task)}
          className="min-h-11 rounded-md px-2 text-sm text-brand"
        >
          Edit
        </button>
      )}
      <button
        type="button"
        aria-label={`Delete "${task.title}"`}
        disabled={busy}
        onClick={onDelete}
        className="min-h-11 rounded-md px-2 text-sm text-error disabled:opacity-60"
      >
        Delete
      </button>
    </li>
  )
}
