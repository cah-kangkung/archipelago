import type {
  AuthUserDto,
  CreateMilestoneInput,
  CreateProjectInput,
  CreateTaskInput,
  ErrorBody,
  ErrorCode,
  LoginInput,
  MilestoneDto,
  ProjectDto,
  TaskDto,
  UpdateMilestoneInput,
  UpdateProjectInput,
  UpdateTaskInput,
  WorldDto,
} from '@archipelago/shared'
import type { Client } from './client'

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly fields: Record<string, string[]> = {},
  ) {
    super(message)
  }
}

type RawResponse = { ok: boolean; status: number; json(): Promise<unknown> }

async function unwrap<T>(res: RawResponse): Promise<T> {
  if (res.ok) return (res.status === 204 ? undefined : await res.json()) as T
  let body: ErrorBody | null = null
  try {
    body = (await res.json()) as ErrorBody
  } catch {
    body = null
  }
  throw new ApiError(
    res.status,
    body?.error?.code ?? 'internal',
    body?.error?.message ?? `Request failed (${res.status})`,
    body?.error?.fields ?? {},
  )
}

export function createApi(client: Client) {
  const v1 = client.api.v1
  return {
    me: async () => unwrap<{ user: AuthUserDto }>(await v1.auth.me.$get()),
    login: async (input: LoginInput) =>
      unwrap<{ user: AuthUserDto }>(await v1.auth.login.$post({ json: input })),
    logout: async () => unwrap<void>(await v1.auth.logout.$post()),
    world: async () => unwrap<WorldDto>(await v1.world.$get()),

    createProject: async (input: CreateProjectInput) =>
      unwrap<{ project: ProjectDto }>(await v1.projects.$post({ json: input })),
    updateProject: async (id: string, input: UpdateProjectInput) =>
      unwrap<{ project: ProjectDto }>(
        await v1.projects[':id'].$patch({ param: { id }, json: input }),
      ),
    deleteProject: async (id: string) =>
      unwrap<void>(await v1.projects[':id'].$delete({ param: { id } })),

    createMilestone: async (projectId: string, input: CreateMilestoneInput) =>
      unwrap<{ milestone: MilestoneDto }>(
        await v1.projects[':id'].milestones.$post({ param: { id: projectId }, json: input }),
      ),
    updateMilestone: async (id: string, input: UpdateMilestoneInput) =>
      unwrap<{ milestone: MilestoneDto }>(
        await v1.milestones[':id'].$patch({ param: { id }, json: input }),
      ),
    deleteMilestone: async (id: string) =>
      unwrap<void>(await v1.milestones[':id'].$delete({ param: { id } })),

    createTask: async (input: CreateTaskInput) =>
      unwrap<{ task: TaskDto }>(await v1.tasks.$post({ json: input })),
    updateTask: async (id: string, input: UpdateTaskInput) =>
      unwrap<{ task: TaskDto }>(await v1.tasks[':id'].$patch({ param: { id }, json: input })),
    deleteTask: async (id: string) =>
      unwrap<void>(await v1.tasks[':id'].$delete({ param: { id } })),
    completeTask: async (id: string) =>
      unwrap<{ task: TaskDto; milestoneCompleted: boolean }>(
        await v1.tasks[':id'].complete.$post({ param: { id } }),
      ),
    reopenTask: async (id: string) =>
      unwrap<{ task: TaskDto; milestoneReopened: boolean }>(
        await v1.tasks[':id'].reopen.$post({ param: { id } }),
      ),
  }
}

export type Api = ReturnType<typeof createApi>
