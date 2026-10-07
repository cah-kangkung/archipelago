import type {
  BuildingDto,
  LandmarkType,
  MilestoneDto,
  ProjectDto,
  TaskDto,
} from '@archipelago/shared'
import type { buildings, milestones, projects, tasks } from '../db/schema'

const iso = (d: Date | null): string | null => d?.toISOString() ?? null

export const toProjectDto = (row: typeof projects.$inferSelect): ProjectDto => ({
  id: row.id,
  name: row.name,
  islandSeed: row.islandSeed,
  archipelagoX: row.archipelagoX,
  archipelagoY: row.archipelagoY,
  archivedAt: iso(row.archivedAt),
  createdAt: row.createdAt.toISOString(),
})

export const toMilestoneDto = (row: typeof milestones.$inferSelect): MilestoneDto => ({
  id: row.id,
  projectId: row.projectId,
  name: row.name,
  sortOrder: row.sortOrder,
  // Only ever written from LANDMARK_TYPES by the milestone service.
  landmarkType: row.landmarkType as LandmarkType,
  districtQ: row.districtQ,
  districtR: row.districtR,
  completedAt: iso(row.completedAt),
  createdAt: row.createdAt.toISOString(),
})

export const toTaskDto = (row: typeof tasks.$inferSelect): TaskDto => ({
  id: row.id,
  projectId: row.projectId,
  milestoneId: row.milestoneId,
  title: row.title,
  notes: row.notes,
  dueDate: row.dueDate,
  priority: row.priority,
  size: row.size,
  status: row.status,
  completedAt: iso(row.completedAt),
  plotX: row.plotX,
  plotY: row.plotY,
  sortOrder: row.sortOrder,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
})

export const toBuildingDto = (row: typeof buildings.$inferSelect): BuildingDto => ({
  id: row.id,
  projectId: row.projectId,
  type: row.type,
  plotX: row.plotX,
  plotY: row.plotY,
  rotation: row.rotation,
  placedAt: row.placedAt.toISOString(),
})
