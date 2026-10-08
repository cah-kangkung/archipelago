import type { MilestoneDto } from '@archipelago/shared'
import { type FormEvent, useState } from 'react'
import { useApi } from '../api/context'
import { Field, inputClass } from './fields'
import { useEditorMutation } from './use-editor-mutation'

const primary =
  'min-h-11 rounded-md bg-brand px-4 font-medium text-text-on-brand disabled:opacity-60'
const danger = 'min-h-11 rounded-md px-4 text-error'

export function MilestoneForm({
  projectId,
  milestone,
  onDone,
}: {
  projectId: string
  milestone?: MilestoneDto
  onDone: (result: { removed: boolean }) => void | Promise<void>
}) {
  const api = useApi()
  const [name, setName] = useState(milestone?.name ?? '')
  const [localErrors, setLocalErrors] = useState<Record<string, string[]>>({})

  const save = useEditorMutation(
    () =>
      milestone
        ? api.updateMilestone(milestone.id, { name: name.trim() })
        : api.createMilestone(projectId, { name: name.trim() }),
    () => onDone({ removed: false }),
    { fields: ['name'] },
  )
  const remove = useEditorMutation(
    () => api.deleteMilestone(milestone?.id ?? ''),
    () => onDone({ removed: true }),
    { invalidateAfter: true },
  )

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (name.trim() === '') return setLocalErrors({ name: ['Enter a name'] })
    setLocalErrors({})
    save.mutation.mutate()
  }

  const errors = { ...save.fieldErrors, ...localErrors }
  const formError = save.formError ?? remove.formError
  const busy = save.mutation.isPending || remove.mutation.isPending

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {formError && (
        <p role="alert" className="text-sm text-error">
          {formError}
        </p>
      )}
      <Field label="Name" errors={errors.name}>
        <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
      </Field>
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={busy} className={primary}>
          {milestone ? 'Save' : 'Create milestone'}
        </button>
        {milestone && (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (window.confirm(`Delete "${milestone.name}"? Its tasks move to the commons.`)) {
                remove.mutation.mutate()
              }
            }}
            className={danger}
          >
            Delete milestone
          </button>
        )}
      </div>
    </form>
  )
}
