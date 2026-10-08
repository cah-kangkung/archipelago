import type { TaskDto, TaskPriority, TaskSize, WorldDto } from '@archipelago/shared'
import { type FormEvent, useState } from 'react'
import { useApi } from '../api/context'
import { Field, inputClass } from './fields'
import { useEditorMutation } from './use-editor-mutation'

const primary =
  'min-h-11 rounded-md bg-brand px-4 font-medium text-text-on-brand disabled:opacity-60'

export function TaskForm({
  world,
  projectId,
  task,
  defaultMilestoneId = null,
  onDone,
}: {
  world: WorldDto
  projectId: string
  task?: TaskDto
  defaultMilestoneId?: string | null
  onDone: () => void
}) {
  const api = useApi()
  const [title, setTitle] = useState(task?.title ?? '')
  const [notes, setNotes] = useState(task?.notes ?? '')
  const [dueDate, setDueDate] = useState(task?.dueDate ?? '')
  const [priority, setPriority] = useState<TaskPriority>(task?.priority ?? 'med')
  const [size, setSize] = useState<TaskSize>(task?.size ?? 'M')
  const [milestoneId, setMilestoneId] = useState(
    task ? (task.milestoneId ?? '') : (defaultMilestoneId ?? ''),
  )
  const [localErrors, setLocalErrors] = useState<Record<string, string[]>>({})

  const milestones = world.milestones
    .filter((m) => m.projectId === projectId)
    .sort((a, b) => a.sortOrder - b.sortOrder)

  const fields = () => ({
    title: title.trim(),
    notes,
    dueDate: dueDate === '' ? null : dueDate,
    priority,
    size,
    milestoneId: milestoneId === '' ? null : milestoneId,
  })

  const save = useEditorMutation(
    () => (task ? api.updateTask(task.id, fields()) : api.createTask({ projectId, ...fields() })),
    () => onDone(),
    { fields: ['title', 'notes', 'dueDate', 'priority', 'size', 'milestoneId'] },
  )

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (title.trim() === '') return setLocalErrors({ title: ['Enter a title'] })
    setLocalErrors({})
    save.mutation.mutate()
  }

  const { formError } = save
  const errors = { ...save.fieldErrors, ...localErrors }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {formError && (
        <p role="alert" className="text-sm text-error">
          {formError}
        </p>
      )}
      <Field label="Title" errors={errors.title}>
        <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} />
      </Field>
      <Field label="Notes" errors={errors.notes}>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className={`${inputClass} py-2`}
        />
      </Field>
      <Field label="Due date" errors={errors.dueDate}>
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className={inputClass}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Priority" errors={errors.priority}>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as TaskPriority)}
            className={inputClass}
          >
            <option value="low">Low</option>
            <option value="med">Medium</option>
            <option value="high">High</option>
          </select>
        </Field>
        <Field label="Size" errors={errors.size}>
          <select
            value={size}
            onChange={(e) => setSize(e.target.value as TaskSize)}
            className={inputClass}
          >
            <option value="S">S — small</option>
            <option value="M">M — medium</option>
            <option value="L">L — large</option>
          </select>
        </Field>
      </div>
      <Field label="Milestone" errors={errors.milestoneId}>
        <select
          value={milestoneId}
          onChange={(e) => setMilestoneId(e.target.value)}
          className={inputClass}
        >
          <option value="">No milestone (commons)</option>
          {milestones.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </Field>
      <button type="submit" disabled={save.mutation.isPending} className={primary}>
        {task ? 'Save' : 'Create task'}
      </button>
    </form>
  )
}
