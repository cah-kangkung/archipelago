import { Link, useNavigate, useParams } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { EditorFrame } from '../editors/editor-frame'
import { MilestoneForm } from '../editors/milestone-form'
import { ProjectForm } from '../editors/project-form'
import { TaskForm } from '../editors/task-form'
import { TaskPanel } from '../tasks/task-panel'
import { IslandSwitcher } from '../world/island-switcher'
import { islandSummaries, parentPath, resolveFocus, todayIn } from '../world/selectors'
import { useMe, useWorld } from '../world/use-world'
import { WorldArea } from '../world/world-area'
import { PanelFrame, SHEET_MIDDLE } from './panel-frame'
import { useIsDesktop } from './use-is-desktop'
import { useShortcuts } from './use-shortcuts'

type Editor =
  | { kind: 'new-project' }
  | { kind: 'edit-project'; projectId: string }
  | { kind: 'new-milestone'; projectId: string }
  | { kind: 'edit-milestone'; milestoneId: string }
  | { kind: 'new-task'; projectId: string; milestoneId: string | null }
  | { kind: 'edit-task'; taskId: string }

const editorTitle: Record<Editor['kind'], string> = {
  'new-project': 'New island',
  'edit-project': 'Edit island',
  'new-milestone': 'New milestone',
  'edit-milestone': 'Edit milestone',
  'new-task': 'New task',
  'edit-task': 'Edit task',
}

const retryButton = 'inline-flex min-h-11 items-center rounded-md px-3 text-brand'

export function WorldScreen() {
  const params = useParams({ strict: false })
  const navigate = useNavigate()
  const world = useWorld()
  const me = useMe()
  const isDesktop = useIsDesktop()
  const searchRef = useRef<HTMLInputElement>(null)
  const [editor, setEditor] = useState<Editor | null>(null)
  const [sheetDetent, setSheetDetent] = useState(SHEET_MIDDLE)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)

  const resolved = world.data
    ? resolveFocus(world.data, { projectId: params.projectId, milestoneId: params.milestoneId })
    : null
  const focus = resolved?.focus ?? { kind: 'archipelago' as const }

  const openNewTask = () => {
    if (editor !== null) return
    if (focus.kind === 'island')
      setEditor({ kind: 'new-task', projectId: focus.projectId, milestoneId: null })
    if (focus.kind === 'district') {
      setEditor({ kind: 'new-task', projectId: focus.projectId, milestoneId: focus.milestoneId })
    }
  }

  const editedProject =
    editor?.kind === 'edit-project'
      ? world.data?.projects.find((p) => p.id === editor.projectId)
      : undefined
  const editedMilestone =
    editor?.kind === 'edit-milestone'
      ? world.data?.milestones.find((m) => m.id === editor.milestoneId)
      : undefined
  const editedTask =
    editor?.kind === 'edit-task' ? world.data?.tasks.find((t) => t.id === editor.taskId) : undefined
  const editedMissing =
    world.data !== undefined &&
    ((editor?.kind === 'edit-project' && !editedProject) ||
      (editor?.kind === 'edit-milestone' && !editedMilestone) ||
      (editor?.kind === 'edit-task' && !editedTask))

  useEffect(() => {
    if (editedMissing) setEditor(null)
  }, [editedMissing])

  // Editors and selections belong to the route they were made on.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the route params are the trigger
  useEffect(() => {
    setEditor(null)
    setSelectedTaskId(null)
  }, [params.projectId, params.milestoneId])

  useShortcuts({
    enabled: isDesktop,
    onNew: openNewTask,
    onSearch: () => {
      if (editor === null) searchRef.current?.focus()
    },
    onEscape: () => {
      if (editor) return setEditor(null)
      const up = parentPath(focus)
      if (up) void navigate({ to: up })
    },
  })

  if (world.isPending) return <p className="p-4 text-text-secondary">Loading your islands…</p>
  if ((world.isError && !world.data) || !resolved) {
    return (
      <div className="space-y-3 p-4">
        <p role="alert" className="text-error">
          Could not load your islands.
        </p>
        <button type="button" onClick={() => void world.refetch()} className={retryButton}>
          Try again
        </button>
      </div>
    )
  }
  if (resolved.missing) {
    return (
      <div className="space-y-3 p-4">
        <p className="text-text-primary">That island or district doesn't exist.</p>
        <Link to="/" className="inline-flex min-h-11 items-center text-brand">
          Back to the archipelago
        </Link>
      </div>
    )
  }

  const today = todayIn(me.data?.user.timezone ?? 'UTC')
  const summaries = islandSummaries(world.data, today)
  const panelTitle = resolved.milestone?.name ?? resolved.project?.name ?? 'Due today & overdue'
  const { project, milestone } = resolved

  const closeEditor = () => setEditor(null)
  const afterRemoval =
    (to: string) =>
    async ({ removed }: { removed: boolean }) => {
      setEditor(null)
      if (removed) await navigate({ to })
    }

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <div className="flex min-h-0 flex-1 flex-col">
        {world.isError && (
          <div className="flex items-center justify-between gap-2 bg-surface-primary px-4 text-sm text-text-secondary">
            <p role="status">Couldn't refresh. Showing your last update.</p>
            <button type="button" onClick={() => void world.refetch()} className={retryButton}>
              Try again
            </button>
          </div>
        )}
        <IslandSwitcher summaries={summaries} currentProjectId={project?.id ?? null} />
        <WorldArea
          world={world.data}
          resolved={resolved}
          summaries={summaries}
          onNewProject={() => setEditor({ kind: 'new-project' })}
          onNewMilestone={
            project ? () => setEditor({ kind: 'new-milestone', projectId: project.id }) : undefined
          }
          onEditProject={
            project ? () => setEditor({ kind: 'edit-project', projectId: project.id }) : undefined
          }
          onEditMilestone={
            milestone
              ? () => setEditor({ kind: 'edit-milestone', milestoneId: milestone.id })
              : undefined
          }
        />
      </div>
      <PanelFrame title={panelTitle} detent={sheetDetent} onDetentChange={setSheetDetent}>
        <TaskPanel
          world={world.data}
          focus={resolved.focus}
          title={panelTitle}
          today={today}
          searchRef={searchRef}
          selectedTaskId={selectedTaskId}
          onNewTask={openNewTask}
          onEditTask={(task) => setEditor({ kind: 'edit-task', taskId: task.id })}
        />
      </PanelFrame>

      {editor && !editedMissing && (
        <EditorFrame title={editorTitle[editor.kind]} onClose={closeEditor}>
          {editor.kind === 'new-project' && <ProjectForm onDone={closeEditor} />}
          {editor.kind === 'edit-project' && editedProject && (
            <ProjectForm project={editedProject} onDone={afterRemoval('/')} />
          )}
          {editor.kind === 'new-milestone' && (
            <MilestoneForm projectId={editor.projectId} onDone={closeEditor} />
          )}
          {editor.kind === 'edit-milestone' && editedMilestone && (
            <MilestoneForm
              projectId={editedMilestone.projectId}
              milestone={editedMilestone}
              onDone={afterRemoval(`/p/${editedMilestone.projectId}`)}
            />
          )}
          {editor.kind === 'new-task' && (
            <TaskForm
              world={world.data}
              projectId={editor.projectId}
              defaultMilestoneId={editor.milestoneId}
              onDone={closeEditor}
            />
          )}
          {editor.kind === 'edit-task' && editedTask && (
            <TaskForm
              world={world.data}
              projectId={editedTask.projectId}
              task={editedTask}
              onDone={closeEditor}
            />
          )}
        </EditorFrame>
      )}
    </div>
  )
}
