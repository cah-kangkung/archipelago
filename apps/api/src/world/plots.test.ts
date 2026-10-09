import { describe, expect, test } from 'bun:test'
import {
  hexDistance,
  hexKey,
  islandLand,
  islandSize,
  nextDistrictCenter,
} from '@archipelago/shared'
import { eq } from 'drizzle-orm'
import { withRollback } from '../../test/db'
import { insertMilestone, insertProject, insertTask, insertUser } from '../../test/fixtures'
import { milestones } from '../db/schema'
import {
  assignTaskPlot,
  findMilestoneInProject,
  lockOwnedProject,
  syncMilestoneCompletion,
} from './plots'

describe('lockOwnedProject / findMilestoneInProject', () => {
  test('only returns rows the user owns / that belong to the project', async () => {
    await withRollback(async (tx) => {
      const owner = await insertUser(tx)
      const other = await insertUser(tx)
      const project = await insertProject(tx, owner.id)
      const otherProject = await insertProject(tx, owner.id)
      const milestone = await insertMilestone(tx, project.id)
      expect((await lockOwnedProject(tx, owner.id, project.id))?.id).toBe(project.id)
      expect(await lockOwnedProject(tx, other.id, project.id)).toBeNull()
      expect((await findMilestoneInProject(tx, milestone.id, project.id))?.id).toBe(milestone.id)
      expect(await findMilestoneInProject(tx, milestone.id, otherProject.id)).toBeNull()
    })
  })
})

describe('assignTaskPlot', () => {
  test('loose tasks go next to the commons centre, milestone tasks next to their district', async () => {
    await withRollback(async (tx) => {
      const user = await insertUser(tx)
      const project = await insertProject(tx, user.id, { islandSeed: 3 })
      const centre = nextDistrictCenter(project.islandSeed, [])
      const milestone = await insertMilestone(tx, project.id, {
        districtQ: centre.q,
        districtR: centre.r,
      })
      const loose = await assignTaskPlot(tx, project, null)
      const inDistrict = await assignTaskPlot(tx, project, milestone)
      expect(hexDistance(loose, { q: 0, r: 0 })).toBe(1)
      expect(hexDistance(inDistrict, centre)).toBeLessThanOrEqual(2)
      const { interior } = islandLand(
        project.islandSeed,
        islandSize(project.islandSeed, [centre, inDistrict]),
      )
      expect(interior.has(hexKey(inDistrict))).toBe(true)
    })
  })

  test('never reuses an occupied plot', async () => {
    await withRollback(async (tx) => {
      const user = await insertUser(tx)
      const project = await insertProject(tx, user.id)
      const seen = new Set<string>()
      for (let i = 0; i < 8; i++) {
        const plot = await assignTaskPlot(tx, project, null)
        expect(seen.has(hexKey(plot))).toBe(false)
        seen.add(hexKey(plot))
        await insertTask(tx, project.id, { plotX: plot.q, plotY: plot.r })
      }
    })
  })
})

describe('syncMilestoneCompletion', () => {
  test('completes when all tasks are done and reopens when one is not', async () => {
    await withRollback(async (tx) => {
      const user = await insertUser(tx)
      const project = await insertProject(tx, user.id)
      const milestone = await insertMilestone(tx, project.id)
      const now = new Date('2026-10-07T10:00:00Z')
      expect(await syncMilestoneCompletion(tx, milestone.id, now)).toBe('unchanged')

      await insertTask(tx, project.id, { milestoneId: milestone.id, status: 'done' })
      expect(await syncMilestoneCompletion(tx, milestone.id, now)).toBe('completed')
      const [done] = await tx.select().from(milestones).where(eq(milestones.id, milestone.id))
      expect(done?.completedAt?.toISOString()).toBe(now.toISOString())
      expect(await syncMilestoneCompletion(tx, milestone.id, now)).toBe('unchanged')

      await insertTask(tx, project.id, { milestoneId: milestone.id, status: 'todo' })
      expect(await syncMilestoneCompletion(tx, milestone.id, now)).toBe('reopened')
      expect(await syncMilestoneCompletion(tx, null, now)).toBe('unchanged')
    })
  })
})
