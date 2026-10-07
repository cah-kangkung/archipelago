import { describe, expect, test } from 'bun:test'
import {
  createMilestoneInputSchema,
  createProjectInputSchema,
  createTaskInputSchema,
  taskListQuerySchema,
  updateMilestoneInputSchema,
  updateProjectInputSchema,
  updateTaskInputSchema,
} from './resources'

const projectId = '7f9c2e1a-3b4d-4c5e-8f6a-1b2c3d4e5f60'

const paths = (r: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }) =>
  r.error?.issues.map((i) => i.path.join('.')) ?? []

describe('project and milestone schemas', () => {
  test('names are trimmed and must be 1..80 characters', () => {
    expect(createProjectInputSchema.parse({ name: '  Beta  ' }).name).toBe('Beta')
    expect(createProjectInputSchema.safeParse({ name: '   ' }).success).toBe(false)
    expect(createProjectInputSchema.safeParse({ name: 'x'.repeat(81) }).success).toBe(false)
    expect(createMilestoneInputSchema.parse({ name: ' MVP ' }).name).toBe('MVP')
  })

  test('updates need at least one field', () => {
    expect(updateProjectInputSchema.safeParse({}).success).toBe(false)
    expect(updateProjectInputSchema.parse({ archived: true })).toEqual({ archived: true })
    expect(updateMilestoneInputSchema.safeParse({}).success).toBe(false)
    expect(updateMilestoneInputSchema.safeParse({ sortOrder: -1 }).success).toBe(false)
  })
})

describe('createTaskInputSchema', () => {
  test('applies defaults', () => {
    expect(createTaskInputSchema.parse({ projectId, title: ' Write spec ' })).toEqual({
      projectId,
      milestoneId: null,
      title: 'Write spec',
      notes: '',
      dueDate: null,
      priority: 'med',
      size: 'M',
    })
  })

  test('rejects impossible and non-ISO due dates', () => {
    for (const dueDate of ['2026-02-30', 'tomorrow', '2026-1-5', '2026-10-07T00:00:00Z']) {
      const r = createTaskInputSchema.safeParse({ projectId, title: 'x', dueDate })
      expect(r.success).toBe(false)
      expect(paths(r)).toContain('dueDate')
    }
    expect(
      createTaskInputSchema.parse({ projectId, title: 'x', dueDate: '2026-02-28' }).dueDate,
    ).toBe('2026-02-28')
  })

  test('rejects non-uuid ids and unknown enums', () => {
    const r = createTaskInputSchema.safeParse({
      projectId: 'abc',
      milestoneId: 'nope',
      title: 'x',
      priority: 'urgent',
      size: 'XL',
    })
    expect(paths(r)).toEqual(
      expect.arrayContaining(['projectId', 'milestoneId', 'priority', 'size']),
    )
  })
})

describe('updateTaskInputSchema', () => {
  test('cannot set status to done', () => {
    const r = updateTaskInputSchema.safeParse({ status: 'done' })
    expect(r.success).toBe(false)
    expect(paths(r)).toContain('status')
    expect(updateTaskInputSchema.parse({ status: 'doing' })).toEqual({ status: 'doing' })
  })

  test('allows clearing the due date and the milestone', () => {
    expect(updateTaskInputSchema.parse({ dueDate: null, milestoneId: null })).toEqual({
      dueDate: null,
      milestoneId: null,
    })
  })

  test('needs at least one field', () => {
    expect(updateTaskInputSchema.safeParse({}).success).toBe(false)
  })
})

describe('taskListQuerySchema', () => {
  test('accepts filters and rejects malformed ids', () => {
    expect(taskListQuerySchema.parse({ status: 'todo' })).toEqual({ status: 'todo' })
    expect(paths(taskListQuerySchema.safeParse({ project: 'abc' }))).toContain('project')
  })
})

describe('update schema bounds', () => {
  const INT32_MAX = 2_147_483_647
  test.each([
    ['updateMilestoneInputSchema', updateMilestoneInputSchema],
    ['updateTaskInputSchema', updateTaskInputSchema],
  ])('%s bounds sortOrder to 0..int32', (_name, schema) => {
    expect(schema.safeParse({ sortOrder: 2 ** 31 }).success).toBe(false)
    expect(schema.safeParse({ sortOrder: -1 }).success).toBe(false)
    expect(schema.safeParse({ sortOrder: INT32_MAX }).success).toBe(true)
  })

  test('updateTaskInputSchema rejects bad title, notes and milestoneId', () => {
    expect(updateTaskInputSchema.safeParse({ title: '' }).success).toBe(false)
    expect(updateTaskInputSchema.safeParse({ title: 'x'.repeat(201) }).success).toBe(false)
    expect(updateTaskInputSchema.safeParse({ notes: 'x'.repeat(5001) }).success).toBe(false)
    expect(updateTaskInputSchema.safeParse({ milestoneId: 'nope' }).success).toBe(false)
  })

  test('taskListQuerySchema rejects an unknown status', () => {
    expect(taskListQuerySchema.safeParse({ status: 'bogus' }).success).toBe(false)
  })
})
