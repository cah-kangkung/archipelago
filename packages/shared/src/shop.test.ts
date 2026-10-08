import { describe, expect, test } from 'bun:test'
import {
  DECORATION_TYPES,
  isDecorationType,
  placeBuildingInputSchema,
  refundFor,
  SHOP_ITEMS,
  shopItem,
} from './shop'

describe('shop catalogue', () => {
  test('lists every decoration type once, with the spec prices', () => {
    expect(SHOP_ITEMS.map((i) => [i.type, i.price])).toEqual([
      ['pine', 30],
      ['palm', 40],
      ['garden', 60],
      ['lamp', 80],
      ['well', 120],
      ['stall', 160],
      ['fountain', 220],
      ['statue', 350],
    ])
    expect(SHOP_ITEMS.map((i) => i.type)).toEqual([...DECORATION_TYPES])
    for (const item of SHOP_ITEMS) {
      expect(Number.isInteger(item.price) && item.price > 0).toBe(true)
      expect(item.name.length).toBeGreaterThan(0)
    }
  })

  test('shopItem finds by type and returns undefined for unknown types', () => {
    expect(shopItem('pine')?.name).toBe('Pine tree')
    expect(shopItem('tree')).toBeUndefined()
    expect(isDecorationType('statue')).toBe(true)
    expect(isDecorationType('tree')).toBe(false)
  })

  test('refund is half the price, rounded down', () => {
    expect(refundFor(30)).toBe(15)
    expect(refundFor(45)).toBe(22)
    expect(refundFor(0)).toBe(0)
  })

  test('placement input requires a known type and integer plot', () => {
    const projectId = '7f9c2e1a-3b4d-4c5e-8f6a-1b2c3d4e5f60'
    expect(
      placeBuildingInputSchema.safeParse({ projectId, type: 'pine', plotX: 1, plotY: -1 }).success,
    ).toBe(true)
    expect(
      placeBuildingInputSchema.safeParse({ projectId, type: 'tree', plotX: 1, plotY: 0 }).success,
    ).toBe(false)
    expect(
      placeBuildingInputSchema.safeParse({ projectId, type: 'pine', plotX: 1.5, plotY: 0 }).success,
    ).toBe(false)
  })
})
