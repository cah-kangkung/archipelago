import { z } from 'zod'
import { TASK_PRIORITIES, TASK_SIZES, TASK_STATUSES } from './domain'

const name = z.string().trim().min(1).max(80)
const title = z.string().trim().min(1).max(200)
const notes = z.string().max(5000)
const dueDate = z.iso.date()
const atLeastOneField = (value: object) => Object.keys(value).length > 0
const NEEDS_A_FIELD = 'Provide at least one field to update'

export const createProjectInputSchema = z.object({ name })
export type CreateProjectInput = z.infer<typeof createProjectInputSchema>

export const updateProjectInputSchema = z
  .object({ name: name.optional(), archived: z.boolean().optional() })
  .refine(atLeastOneField, NEEDS_A_FIELD)
export type UpdateProjectInput = z.infer<typeof updateProjectInputSchema>

export const createMilestoneInputSchema = z.object({ name })
export type CreateMilestoneInput = z.infer<typeof createMilestoneInputSchema>

export const updateMilestoneInputSchema = z
  .object({ name: name.optional(), sortOrder: z.int().min(0).optional() })
  .refine(atLeastOneField, NEEDS_A_FIELD)
export type UpdateMilestoneInput = z.infer<typeof updateMilestoneInputSchema>

export const createTaskInputSchema = z.object({
  projectId: z.uuid(),
  milestoneId: z.uuid().nullable().default(null),
  title,
  notes: notes.default(''),
  dueDate: dueDate.nullable().default(null),
  priority: z.enum(TASK_PRIORITIES).default('med'),
  size: z.enum(TASK_SIZES).default('M'),
})
export type CreateTaskInput = z.infer<typeof createTaskInputSchema>

export const updateTaskInputSchema = z
  .object({
    title: title.optional(),
    notes: notes.optional(),
    dueDate: dueDate.nullable().optional(),
    priority: z.enum(TASK_PRIORITIES).optional(),
    size: z.enum(TASK_SIZES).optional(),
    // `done` is deliberately absent: completion goes through POST /tasks/:id/complete.
    status: z.enum(['todo', 'doing']).optional(),
    milestoneId: z.uuid().nullable().optional(),
    sortOrder: z.int().min(0).optional(),
  })
  .refine(atLeastOneField, NEEDS_A_FIELD)
export type UpdateTaskInput = z.infer<typeof updateTaskInputSchema>

export const taskListQuerySchema = z.object({
  project: z.uuid().optional(),
  milestone: z.uuid().optional(),
  status: z.enum(TASK_STATUSES).optional(),
})
export type TaskListQuery = z.infer<typeof taskListQuerySchema>
