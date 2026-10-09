import type { TaskDto } from '@archipelago/shared'
import { Check, Hammer, PencilSimple, Trash } from '@phosphor-icons/react'
import { useEffect, useRef } from 'react'
import { Button } from '../ui/button'
import { Icon } from '../ui/icon'
import { dueStatus } from '../world/selectors'
import { useAdvanceTask, useDeleteTask } from './use-task-actions'

const nextLabel = { todo: 'doing', doing: 'done', done: 'not done' } as const
const statusStyle = {
  todo: 'border-border-secondary bg-surface-primary text-text-tertiary',
  doing: 'border-brand-secondary bg-brand-secondary/10 text-brand-secondary',
  done: 'border-leaf bg-leaf text-text-on-brand',
} as const
const statusIcon = { todo: null, doing: Hammer, done: Check } as const

export function TaskRow({
  task,
  today,
  projectName,
  onEdit,
  selected = false,
}: {
  task: TaskDto
  today: string
  projectName?: string
  onEdit?: (task: TaskDto) => void
  selected?: boolean
}) {
  const advance = useAdvanceTask()
  const remove = useDeleteTask()
  const busy = advance.isPending || remove.isPending
  const due = dueStatus(task, today)
  const StatusIcon = statusIcon[task.status]
  const rowRef = useRef<HTMLLIElement>(null)
  useEffect(() => {
    if (selected) rowRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [selected])

  const onDelete = () => {
    const prompt =
      task.status === 'done'
        ? `Delete "${task.title}"? Any Supplies it earned will be taken back.`
        : `Delete "${task.title}"?`
    if (window.confirm(prompt)) remove.mutate(task)
  }

  return (
    <li
      ref={rowRef}
      aria-current={selected ? 'true' : undefined}
      className={`flex items-start gap-3 border-b border-border-primary px-4 py-3 ${
        selected ? 'bg-brand-secondary/10' : ''
      }`}
    >
      <button
        type="button"
        aria-label={`Mark "${task.title}" as ${nextLabel[task.status]}`}
        disabled={busy}
        onClick={() => advance.mutate(task)}
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border-2 disabled:opacity-60 ${statusStyle[task.status]}`}
      >
        {StatusIcon && <Icon icon={StatusIcon} size={24} />}
      </button>
      <div className="min-w-0 flex-1 py-1">
        <p
          className={
            task.status === 'done'
              ? 'text-body text-text-tertiary line-through'
              : 'text-body text-text-primary'
          }
        >
          {task.title}
        </p>
        <p className="text-meta text-text-secondary">
          {projectName && <span>{projectName} · </span>}
          {due === 'overdue' && <span className="text-coral-text">Overdue · {task.dueDate}</span>}
          {due === 'due-soon' && <span className="text-gold-text">Due soon · {task.dueDate}</span>}
        </p>
      </div>
      {onEdit && (
        <Button
          variant="ghost"
          size="sm"
          icon={PencilSimple}
          aria-label={`Edit "${task.title}"`}
          onClick={() => onEdit(task)}
        >
          <span className="sr-only sm:not-sr-only">Edit</span>
        </Button>
      )}
      <Button
        variant="danger"
        size="sm"
        icon={Trash}
        aria-label={`Delete "${task.title}"`}
        disabled={busy}
        onClick={onDelete}
      >
        <span className="sr-only sm:not-sr-only">Delete</span>
      </Button>
    </li>
  )
}
