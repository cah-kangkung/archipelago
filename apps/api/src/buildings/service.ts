import {
  decorationRotation,
  hexKey,
  isPlaceable,
  type PlaceBuildingInput,
  type PlaceBuildingResultDto,
  type RemoveBuildingResultDto,
  refundFor,
  shopItem,
} from '@archipelago/shared'
import { and, eq } from 'drizzle-orm'
import type { Db } from '../db/client'
import { isUniqueViolation } from '../db/pg-errors'
import { buildings, projects } from '../db/schema'
import { getBalance, insertEntry, lockUser } from '../economy/ledger'
import { AppError } from '../errors'
import { toBuildingDto } from '../http/serialize'
import { lockOwnedProject, occupiedHexes } from '../world/plots'

const plotTaken = () => new AppError('conflict', 'That plot is taken')
const notLand = () =>
  new AppError('validation_failed', 'Request body is invalid', {
    plot: ['Plot is not free land on this island'],
  })

export async function placeBuilding(
  db: Db,
  userId: string,
  input: PlaceBuildingInput,
  now: Date,
): Promise<PlaceBuildingResultDto> {
  try {
    return await db.transaction(async (tx) => {
      const project = await lockOwnedProject(tx, userId, input.projectId)
      if (!project || project.archivedAt !== null) {
        throw new AppError('not_found', 'Project not found')
      }
      const item = shopItem(input.type)
      if (!item)
        throw new AppError('validation_failed', 'Request body is invalid', {
          type: ['Unknown decoration'],
        })
      const plot = { q: input.plotX, r: input.plotY }
      const occupied = await occupiedHexes(tx, project.id)
      if (occupied.some((h) => hexKey(h) === hexKey(plot))) throw plotTaken()
      if (!isPlaceable(occupied, plot)) throw notLand()

      await lockUser(tx, userId)
      const balance = await getBalance(tx, userId)
      if (balance < 0) throw new AppError('insufficient_supplies', 'Balance is negative')
      if (balance < item.price) throw new AppError('insufficient_supplies', 'Not enough Supplies')

      const [row] = await tx
        .insert(buildings)
        .values({
          projectId: project.id,
          type: item.type,
          plotX: plot.q,
          plotY: plot.r,
          rotation: decorationRotation(plot),
          placedAt: now,
        })
        .returning()
      if (!row) throw new Error('placeBuilding: no row returned')
      await insertEntry(
        tx,
        userId,
        { kind: 'purchase', amount: -item.price, refType: 'building', refId: row.id },
        now,
      )
      return { building: toBuildingDto(row), balance: balance - item.price }
    })
  } catch (err) {
    // The project lock serialises placements; the unique index is the last line of defence.
    if (isUniqueViolation(err)) throw plotTaken()
    throw err
  }
}

export async function removeBuilding(
  db: Db,
  userId: string,
  buildingId: string,
  now: Date,
): Promise<RemoveBuildingResultDto> {
  const notFound = () => new AppError('not_found', 'Building not found')
  return db.transaction(async (tx) => {
    const [found] = await tx
      .select({ projectId: buildings.projectId })
      .from(buildings)
      .innerJoin(projects, eq(projects.id, buildings.projectId))
      .where(and(eq(buildings.id, buildingId), eq(projects.userId, userId)))
    if (!found) throw notFound()
    await lockOwnedProject(tx, userId, found.projectId)
    const [row] = await tx.delete(buildings).where(eq(buildings.id, buildingId)).returning()
    if (!row) throw notFound()

    await lockUser(tx, userId)
    // A type no longer in the catalogue has no price to refund.
    const refund = refundFor(shopItem(row.type)?.price ?? 0)
    if (refund > 0) {
      await insertEntry(
        tx,
        userId,
        { kind: 'refund', amount: refund, refType: 'building', refId: row.id },
        now,
      )
    }
    return { refund, balance: await getBalance(tx, userId) }
  })
}
