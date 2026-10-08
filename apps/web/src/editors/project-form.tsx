import type { ProjectDto } from '@archipelago/shared'
import { type FormEvent, useState } from 'react'
import { useApi } from '../api/context'
import { Field, inputClass } from './fields'
import { useEditorMutation } from './use-editor-mutation'

const primary =
  'min-h-11 rounded-md bg-brand px-4 font-medium text-text-on-brand disabled:opacity-60'
const secondary = 'min-h-11 rounded-md border border-border-secondary px-4 text-text-secondary'
const danger = 'min-h-11 rounded-md px-4 text-error'

export function ProjectForm({
  project,
  onDone,
}: {
  project?: ProjectDto
  onDone: (result: { removed: boolean }) => void | Promise<void>
}) {
  const api = useApi()
  const [name, setName] = useState(project?.name ?? '')
  const [localErrors, setLocalErrors] = useState<Record<string, string[]>>({})

  const save = useEditorMutation(
    () =>
      project
        ? api.updateProject(project.id, { name: name.trim() })
        : api.createProject({ name: name.trim() }),
    () => onDone({ removed: false }),
    { fields: ['name'] },
  )
  const archive = useEditorMutation(
    () => api.updateProject(project?.id ?? '', { archived: true }),
    () => onDone({ removed: true }),
    { invalidateAfter: true },
  )
  const remove = useEditorMutation(
    () => api.deleteProject(project?.id ?? ''),
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
  const formError = save.formError ?? archive.formError ?? remove.formError
  const busy = save.mutation.isPending || archive.mutation.isPending || remove.mutation.isPending

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
          {project ? 'Save' : 'Create island'}
        </button>
        {project && (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => archive.mutation.mutate()}
              className={secondary}
            >
              Archive island
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (window.confirm(`Delete "${project.name}" and everything on it?`)) {
                  remove.mutation.mutate()
                }
              }}
              className={danger}
            >
              Delete island
            </button>
          </>
        )}
      </div>
    </form>
  )
}
