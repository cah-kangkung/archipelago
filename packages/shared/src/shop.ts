import { z } from 'zod'
import type { BuildingDto } from './dto'

export const DECORATION_TYPES = [
  'pine',
  'palm',
  'garden',
  'lamp',
  'well',
  'stall',
  'fountain',
  'statue',
] as const
export type DecorationType = (typeof DECORATION_TYPES)[number]

export type ShopItemDto = { type: DecorationType; name: string; price: number }

/** The fixed decoration catalogue (spec 15.1). */
export const SHOP_ITEMS: readonly ShopItemDto[] = Object.freeze([
  { type: 'pine', name: 'Pine tree', price: 30 },
  { type: 'palm', name: 'Palm tree', price: 40 },
  { type: 'garden', name: 'Flower garden', price: 60 },
  { type: 'lamp', name: 'Bench and lamp', price: 80 },
  { type: 'well', name: 'Well', price: 120 },
  { type: 'stall', name: 'Market stall', price: 160 },
  { type: 'fountain', name: 'Fountain', price: 220 },
  { type: 'statue', name: 'Statue', price: 350 },
])

export const isDecorationType = (type: string): type is DecorationType =>
  (DECORATION_TYPES as readonly string[]).includes(type)

export const shopItem = (type: string): ShopItemDto | undefined =>
  SHOP_ITEMS.find((item) => item.type === type)

export const refundFor = (price: number): number => Math.floor(price * 0.5)

export const placeBuildingInputSchema = z.object({
  projectId: z.uuid(),
  type: z.enum(DECORATION_TYPES),
  plotX: z.int32(),
  plotY: z.int32(),
})
export type PlaceBuildingInput = z.infer<typeof placeBuildingInputSchema>

export type PlaceBuildingResultDto = { building: BuildingDto; balance: number }
export type RemoveBuildingResultDto = { refund: number; balance: number }
