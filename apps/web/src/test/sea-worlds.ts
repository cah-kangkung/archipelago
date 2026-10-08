import type { WorldDto } from '@archipelago/shared'
import { buildSceneModel } from '../scene/model/scene-model'
import { fakeProject } from './fake-api'

export const quietEconomy: WorldDto['economy'] = {
  balance: 0,
  streak: { days: 0, activeToday: false, next: null },
  daily: { amount: 15, claimedToday: false },
}

/** Empty islands (ids p0, p1, …) at the given archipelago slots. */
export function worldAt(...slots: [number, number][]): WorldDto {
  const projects = slots.map(([q, r], i) =>
    fakeProject({ id: `p${i}`, name: `P${i}`, archipelagoX: q, archipelagoY: r }),
  )
  return { projects, milestones: [], tasks: [], buildings: [], economy: quietEconomy }
}

export const modelAt = (...slots: [number, number][]) =>
  buildSceneModel(worldAt(...slots), '2026-10-08')
