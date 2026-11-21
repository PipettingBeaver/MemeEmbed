import { describe, expect, it } from 'vitest'
import { defaultSlot, defaultText, migrateTemplate } from './defaults'
import { pointsBBox } from './geometry'
import type { MemeTemplate } from './types'

function templateWithSlot(slot: MemeTemplate['slots'][number]): MemeTemplate {
  return {
    schemaVersion: 1,
    id: 'test',
    name: 'Test',
    width: 200,
    height: 200,
    baseImageFile: 'base.png',
    slots: [slot],
    text: { top: defaultText(), bottom: defaultText() },
    createdAt: '',
    updatedAt: '',
  }
}

describe('migrateTemplate', () => {
  it('preserves a saved quad and realigns its rect to the point bounding box', () => {
    const slot = defaultSlot({ x: 0, y: 0, w: 100, h: 100 })
    slot.shape = 'quad'
    slot.points = [
      { x: 10, y: 20 },
      { x: 120, y: 30 },
      { x: 110, y: 140 },
      { x: 20, y: 130 },
    ]
    slot.rect = { x: 0, y: 0, w: 1, h: 1 }

    const migrated = migrateTemplate(templateWithSlot(slot))
    expect(migrated.slots[0].shape).toBe('quad')
    expect(migrated.slots[0].points).toEqual(slot.points)
    expect(migrated.slots[0].rect).toEqual(pointsBBox(slot.points!))
  })

  it('drops points from a rectangle slot', () => {
    const slot = defaultSlot({ x: 10, y: 20, w: 100, h: 80 })
    slot.points = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ]
    const migrated = migrateTemplate(templateWithSlot(slot))
    expect(migrated.slots[0].shape).toBe('rect')
    expect(migrated.slots[0].points).toBeUndefined()
  })

  it('falls back to a rectangle when quad points are invalid', () => {
    const slot = defaultSlot({ x: 0, y: 0, w: 50, h: 50 })
    slot.shape = 'quad'
    slot.points = [{ x: 1, y: 1 }]
    const migrated = migrateTemplate(templateWithSlot(slot))
    expect(migrated.slots[0].shape).toBe('rect')
    expect(migrated.slots[0].points).toBeUndefined()
  })

  it('defaults missing image framing to no zoom or offset', () => {
    const slot = defaultSlot({ x: 0, y: 0, w: 50, h: 50 })
    delete slot.transform
    const migrated = migrateTemplate(templateWithSlot(slot))
    expect(migrated.slots[0].transform).toEqual({ zoom: 1, offsetX: 0, offsetY: 0 })
  })

  it('clamps an out-of-range zoom when migrating framing', () => {
    const slot = defaultSlot({ x: 0, y: 0, w: 50, h: 50 })
    slot.transform = { zoom: 42, offsetX: 12, offsetY: -8 }
    const migrated = migrateTemplate(templateWithSlot(slot))
    expect(migrated.slots[0].transform).toEqual({ zoom: 10, offsetX: 12, offsetY: -8 })
  })
})
