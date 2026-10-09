import type { ProjectDto } from '@archipelago/shared'
import { type FormEvent, useState } from 'react'
import { useApi } from '../api/context'
import { Button } from '../ui/button'
import { Field, inputClass } from './fields'
import { useEditorMutation } from './use-editor-mutation'

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
        <p role="alert" className="text-label text-error">
          {formError}
        </p>
      )}
      <Field label="Name" errors={errors.name}>
        <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy}>
          {project ? 'Save' : 'Create island'}
        </Button>
        {project && (
          <>
            <Button variant="ghost" disabled={busy} onClick={() => archive.mutation.mutate()}>
              Archive island
            </Button>
            <Button
              variant="danger"
              disabled={busy}
              onClick={() => {
                if (window.confirm(`Delete "${project.name}" and everything on it?`)) {
                  remove.mutation.mutate()
                }
              }}
            >
              Delete island
            </Button>
          </>
        )}
      </div>
    </form>
  )
}
