import type { MilestoneDto, ProjectDto, TaskDto } from '@archipelago/shared'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import { useRef, useState } from 'react'
import { EditorFrame } from '../editors/editor-frame'
import { MilestoneForm } from '../editors/milestone-form'
import { ProjectForm } from '../editors/project-form'
import { TaskForm } from '../editors/task-form'
import { TaskPanel } from '../tasks/task-panel'
import { IslandSwitcher } from '../world/island-switcher'
import { islandSummaries, parentPath, resolveFocus, todayIn } from '../world/selectors'
import { useMe, useWorld } from '../world/use-world'
import { WorldArea } from '../world/world-area'
import { PanelFrame } from './panel-frame'
import { useIsDesktop } from './use-is-desktop'
import { useShortcuts } from './use-shortcuts'

type Editor =
  | { kind: 'new-project' }
  | { kind: 'edit-project'; project: ProjectDto }
  | { kind: 'new-milestone'; projectId: string }
  | { kind: 'edit-milestone'; milestone: MilestoneDto }
  | { kind: 'new-task'; projectId: string; milestoneId: string | null }
  | { kind: 'edit-task'; task: TaskDto }

const editorTitle: Record<Editor['kind'], string> = {
  'new-project': 'New island',
  'edit-project': 'Edit island',
  'new-milestone': 'New milestone',
  'edit-milestone': 'Edit milestone',
  'new-task': 'New task',
  'edit-task': 'Edit task',
}

export function WorldScreen() {
  const params = useParams({ strict: false })
  const navigate = useNavigate()
  const world = useWorld()
  const me = useMe()
  const isDesktop = useIsDesktop()
  const searchRef = useRef<HTMLInputElement>(null)
  const [editor, setEditor] = useState<Editor | null>(null)

  const resolved = world.data
    ? resolveFocus(world.data, { projectId: params.projectId, milestoneId: params.milestoneId })
    : null
  const focus = resolved?.focus ?? { kind: 'archipelago' as const }

  const openNewTask = () => {
    if (focus.kind === 'island')
      setEditor({ kind: 'new-task', projectId: focus.projectId, milestoneId: null })
    if (focus.kind === 'district') {
      setEditor({ kind: 'new-task', projectId: focus.projectId, milestoneId: focus.milestoneId })
    }
  }

  useShortcuts({
    enabled: isDesktop,
    onNew: openNewTask,
    onSearch: () => searchRef.current?.focus(),
    onEscape: () => {
      if (editor) return setEditor(null)
      const up = parentPath(focus)
      if (up) void navigate({ to: up })
    },
  })

  if (world.isPending) return <p className="p-4 text-text-secondary">Loading your islands…</p>
  if (world.isError || !resolved) {
    return (
      <p role="alert" className="p-4 text-error">
        Could not load your islands.
      </p>
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
    ({ removed }: { removed: boolean }) => {
      setEditor(null)
      if (removed) void navigate({ to })
    }

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <div className="flex min-h-0 flex-1 flex-col">
        <IslandSwitcher summaries={summaries} currentProjectId={project?.id ?? null} />
        <WorldArea
          world={world.data}
          resolved={resolved}
          summaries={summaries}
          onNewProject={() => setEditor({ kind: 'new-project' })}
          onNewMilestone={
            project ? () => setEditor({ kind: 'new-milestone', projectId: project.id }) : undefined
          }
          onEditProject={project ? () => setEditor({ kind: 'edit-project', project }) : undefined}
          onEditMilestone={
            milestone ? () => setEditor({ kind: 'edit-milestone', milestone }) : undefined
          }
        />
      </div>
      <PanelFrame title={panelTitle}>
        <TaskPanel
          world={world.data}
          focus={resolved.focus}
          title={panelTitle}
          today={today}
          searchRef={searchRef}
          onNewTask={openNewTask}
          onEditTask={(task) => setEditor({ kind: 'edit-task', task })}
        />
      </PanelFrame>

      {editor && (
        <EditorFrame title={editorTitle[editor.kind]} onClose={closeEditor}>
          {editor.kind === 'new-project' && <ProjectForm onDone={closeEditor} />}
          {editor.kind === 'edit-project' && (
            <ProjectForm project={editor.project} onDone={afterRemoval('/')} />
          )}
          {editor.kind === 'new-milestone' && (
            <MilestoneForm projectId={editor.projectId} onDone={closeEditor} />
          )}
          {editor.kind === 'edit-milestone' && (
            <MilestoneForm
              projectId={editor.milestone.projectId}
              milestone={editor.milestone}
              onDone={afterRemoval(`/p/${editor.milestone.projectId}`)}
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
          {editor.kind === 'edit-task' && (
            <TaskForm
              world={world.data}
              projectId={editor.task.projectId}
              task={editor.task}
              onDone={closeEditor}
            />
          )}
        </EditorFrame>
      )}
    </div>
  )
}
