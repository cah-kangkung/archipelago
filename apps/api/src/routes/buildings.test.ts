import { describe, expect, test } from 'bun:test'
import type {
  BuildingDto,
  PlaceBuildingResultDto,
  RemoveBuildingResultDto,
  ShopItemDto,
  WorldDto,
} from '@archipelago/shared'
import {
  type Hex,
  hexDistance,
  hexKey,
  islandLand,
  islandSize,
  placeablePlots,
  SHOP_ITEMS,
} from '@archipelago/shared'
import { and, eq } from 'drizzle-orm'
import { authedApp, readJson } from '../../test/auth'
import { testDb, withRollback } from '../../test/db'
import {
  insertBuilding,
  insertMilestone,
  insertProject,
  insertTask,
  testConfig,
} from '../../test/fixtures'
import { createApp } from '../app'
import type { Db } from '../db/client'
import { ledger, users } from '../db/schema'
import { insertEntry } from '../economy/ledger'

const BUILDINGS = '/api/v1/buildings'
const NOW = new Date('2026-10-08T05:00:00.000Z')

async function setup(db: Db, funds = 500) {
  const me = await authedApp(db, { now: () => NOW })
  const project = await insertProject(db, me.user.id)
  if (funds !== 0) await insertEntry(db, me.user.id, { kind: 'daily_bonus', amount: funds }, NOW)
  const place = (body: Record<string, unknown>) =>
    me.post(BUILDINGS, { projectId: project.id, type: 'pine', plotX: 1, plotY: 0, ...body })
  const balance = async () =>
    (await readJson<WorldDto>(await me.get('/api/v1/world'))).economy.balance
  return { me, project, place, balance }
}

describe('/shop', () => {
  test('requires auth, then lists the catalogue', async () => {
    await withRollback(async (tx) => {
      const anon = createApp({ db: tx, config: testConfig })
      expect((await anon.request('/api/v1/shop')).status).toBe(401)
      const me = await authedApp(tx)
      const res = await me.get('/api/v1/shop')
      expect(res.status).toBe(200)
      expect(await readJson<{ items: ShopItemDto[] }>(res)).toEqual({ items: [...SHOP_ITEMS] })
    })
  })
})

describe('POST /buildings', () => {
  test('requires auth', async () => {
    await withRollback(async (tx) => {
      const anon = createApp({ db: tx, config: testConfig })
      const res = await anon.request(BUILDINGS, { method: 'POST' })
      expect(res.status).toBe(401)
      expect(
        (await anon.request(`${BUILDINGS}/${crypto.randomUUID()}`, { method: 'DELETE' })).status,
      ).toBe(401)
    })
  })

  test('places, charges the price and writes a purchase entry', async () => {
    await withRollback(async (tx) => {
      const s = await setup(tx)
      const res = await s.place({ type: 'pine', plotX: 0, plotY: 1 })
      expect(res.status).toBe(201)
      const body = await readJson<PlaceBuildingResultDto>(res)
      expect(body.balance).toBe(470)
      expect(body.building).toMatchObject({
        projectId: s.project.id,
        type: 'pine',
        plotX: 0,
        plotY: 1,
      })
      expect(body.building.rotation).toBeGreaterThanOrEqual(0)
      expect(body.building.rotation).toBeLessThanOrEqual(5)
      const entries = await tx
        .select()
        .from(ledger)
        .where(and(eq(ledger.userId, s.me.user.id), eq(ledger.kind, 'purchase')))
      expect(entries).toHaveLength(1)
      expect(entries[0]).toMatchObject({
        amount: -30,
        refType: 'building',
        refId: body.building.id,
      })
      const world = await readJson<WorldDto>(await s.me.get('/api/v1/world'))
      expect(world.buildings.map((b) => b.id)).toEqual([body.building.id])
      expect(world.economy.balance).toBe(470)
    })
  })

  test('a balance exactly equal to the price is enough', async () => {
    await withRollback(async (tx) => {
      const s = await setup(tx, 30)
      const res = await s.place({ type: 'pine' })
      expect(res.status).toBe(201)
      expect((await readJson<PlaceBuildingResultDto>(res)).balance).toBe(0)
    })
  })

  test('blocks a purchase above the balance, and any purchase while negative', async () => {
    await withRollback(async (tx) => {
      const s = await setup(tx, 20)
      const short = await s.place({ type: 'pine' })
      expect(short.status).toBe(409)
      expect(await short.json()).toEqual({
        error: { code: 'insufficient_supplies', message: 'Not enough Supplies' },
      })
      await insertEntry(tx, s.me.user.id, { kind: 'purchase', amount: -25 }, NOW)
      const negative = await s.place({ type: 'pine' })
      expect(negative.status).toBe(409)
      expect(await negative.json()).toEqual({
        error: { code: 'insufficient_supplies', message: 'Balance is negative' },
      })
      expect(await s.balance()).toBe(-5)
    })
  })

  test('422 for unknown types and plots that are not free flat land', async () => {
    await withRollback(async (tx) => {
      const s = await setup(tx)
      const seed = s.project.islandSeed
      const { land, interior } = islandLand(seed, islandSize(seed, []))
      const shore = land.find((h) => !interior.has(hexKey(h))) as Hex
      for (const body of [
        { type: 'tree' },
        { plotX: 0, plotY: 0 }, // commons centre
        { plotX: shore.q, plotY: shore.r }, // shore of this island
        { plotX: 90, plotY: 0 }, // open sea
      ]) {
        const res = await s.place(body)
        expect(res.status).toBe(422)
        expect((await readJson<{ error: { code: string } }>(res)).error.code).toBe(
          'validation_failed',
        )
      }
      expect(await s.balance()).toBe(500)
    })
  })

  test('409 when the plot holds a task, a district centre or a decoration', async () => {
    await withRollback(async (tx) => {
      const s = await setup(tx)
      await insertTask(tx, s.project.id, { plotX: 1, plotY: 0 })
      await insertMilestone(tx, s.project.id, { districtQ: -1, districtR: 1 })
      await insertBuilding(tx, s.project.id, { type: 'pine', plotX: 0, plotY: 1 })
      for (const body of [
        { plotX: 1, plotY: 0 },
        { plotX: -1, plotY: 1 },
        { plotX: 0, plotY: 1 },
      ]) {
        const res = await s.place(body)
        expect(res.status).toBe(409)
        expect(await res.json()).toEqual({
          error: { code: 'conflict', message: 'That plot is taken' },
        })
      }
    })
  })

  test('404 for another user’s project and for an archived project', async () => {
    await withRollback(async (tx) => {
      const s = await setup(tx)
      const other = await authedApp(tx)
      const theirs = await insertProject(tx, other.user.id)
      expect((await s.place({ projectId: theirs.id })).status).toBe(404)
      const archived = await insertProject(tx, s.me.user.id, { archivedAt: NOW })
      expect((await s.place({ projectId: archived.id })).status).toBe(404)
    })
  })

  test('a decoration at the interior edge keeps the island when its task is deleted', async () => {
    await withRollback(async (tx) => {
      const s = await setup(tx)
      const seed = s.project.islandSeed
      const far = placeablePlots(seed, []).at(-1) as Hex
      const task = await insertTask(tx, s.project.id, { plotX: far.q, plotY: far.r })
      const neighbour = placeablePlots(seed, [far]).find((h) => hexDistance(h, far) === 1) as Hex
      expect((await s.place({ plotX: neighbour.q, plotY: neighbour.r })).status).toBe(201)
      expect((await s.me.del(`/api/v1/tasks/${task.id}`)).status).toBe(204)
      const next = placeablePlots(seed, [neighbour])[0] as Hex
      expect((await s.place({ plotX: next.q, plotY: next.r })).status).toBe(201)
    })
  })

  test('deleting the project keeps the purchase in the ledger', async () => {
    await withRollback(async (tx) => {
      const s = await setup(tx)
      await s.place({ type: 'statue' })
      expect((await s.me.del(`/api/v1/projects/${s.project.id}`)).status).toBe(204)
      expect(await s.balance()).toBe(150)
    })
  })
})

describe('DELETE /buildings/:id', () => {
  test('removes, refunds half and writes a refund entry', async () => {
    await withRollback(async (tx) => {
      const s = await setup(tx)
      const { building } = await readJson<{ building: BuildingDto }>(
        await s.place({ type: 'pine' }),
      )
      const res = await s.me.del(`${BUILDINGS}/${building.id}`)
      expect(res.status).toBe(200)
      expect(await readJson<RemoveBuildingResultDto>(res)).toEqual({ refund: 15, balance: 485 })
      const refunds = await tx
        .select()
        .from(ledger)
        .where(and(eq(ledger.userId, s.me.user.id), eq(ledger.kind, 'refund')))
      expect(refunds).toHaveLength(1)
      expect(refunds[0]).toMatchObject({ amount: 15, refType: 'building', refId: building.id })
      const world = await readJson<WorldDto>(await s.me.get('/api/v1/world'))
      expect(world.buildings).toEqual([])
      expect((await s.me.del(`${BUILDINGS}/${building.id}`)).status).toBe(404)
    })
  })

  test('a building of an unknown type refunds 0 and writes no entry', async () => {
    await withRollback(async (tx) => {
      const s = await setup(tx)
      const legacy = await insertBuilding(tx, s.project.id, { type: 'tree', plotX: 0, plotY: 1 })
      const res = await s.me.del(`${BUILDINGS}/${legacy.id}`)
      expect(await readJson<RemoveBuildingResultDto>(res)).toEqual({ refund: 0, balance: 500 })
      const refunds = await tx.select().from(ledger).where(eq(ledger.kind, 'refund'))
      expect(refunds.filter((r) => r.userId === s.me.user.id)).toHaveLength(0)
    })
  })

  test('404 for another user’s building and a malformed id', async () => {
    await withRollback(async (tx) => {
      const s = await setup(tx)
      const other = await authedApp(tx)
      const theirs = await insertProject(tx, other.user.id)
      const building = await insertBuilding(tx, theirs.id, { type: 'pine', plotX: 0, plotY: 1 })
      expect((await s.me.del(`${BUILDINGS}/${building.id}`)).status).toBe(404)
      expect((await s.me.del(`${BUILDINGS}/not-a-uuid`)).status).toBe(404)
    })
  })
})

describe('placement under concurrency', () => {
  test('two placements on one plot: one 201, one 409', async () => {
    // Real transactions on separate connections; cleaned up by deleting the user.
    const me = await authedApp(testDb, { now: () => NOW })
    try {
      const project = await insertProject(testDb, me.user.id)
      await insertEntry(testDb, me.user.id, { kind: 'daily_bonus', amount: 500 }, NOW)
      const body = { projectId: project.id, type: 'pine', plotX: 1, plotY: 0 }
      const results = await Promise.all([me.post(BUILDINGS, body), me.post(BUILDINGS, body)])
      expect(results.map((r) => r.status).sort()).toEqual([201, 409])
    } finally {
      await testDb.delete(users).where(eq(users.id, me.user.id))
    }
  })
})
