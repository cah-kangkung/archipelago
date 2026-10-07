import type { TaskPriority, TaskSize, TaskStatus } from './domain'
import type { LandmarkType } from './hex'

export type ProjectDto = {
  id: string
  name: string
  islandSeed: number
  archipelagoX: number
  archipelagoY: number
  archivedAt: string | null
  createdAt: string
}

export type MilestoneDto = {
  id: string
  projectId: string
  name: string
  sortOrder: number
  landmarkType: LandmarkType
  districtQ: number
  districtR: number
  completedAt: string | null
  createdAt: string
}

export type TaskDto = {
  id: string
  projectId: string
  milestoneId: string | null
  title: string
  notes: string
  dueDate: string | null
  priority: TaskPriority
  size: TaskSize
  status: TaskStatus
  completedAt: string | null
  plotX: number
  plotY: number
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export type BuildingDto = {
  id: string
  projectId: string
  type: string
  plotX: number
  plotY: number
  rotation: number
  placedAt: string
}

export type WorldDto = {
  projects: ProjectDto[]
  milestones: MilestoneDto[]
  tasks: TaskDto[]
  buildings: BuildingDto[]
}
