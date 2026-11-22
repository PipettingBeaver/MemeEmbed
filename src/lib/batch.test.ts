import { describe, expect, it } from 'vitest'
import { applyBatchSettings, defaultBatchSettings } from './batch'
import { defaultSlot, defaultText } from './defaults'
import type { MemeTemplate } from './types'

function makeTemplate(): MemeTemplate {
  return {
    schemaVersion: 1,
    id: 'batch-test',
    name: 'Batch test',
    width: 200,
    height: 200,
    baseImageFile: 'base.png',
    slots: [
      defaultSlot({ x: 0, y: 0, w: 100, h: 100 }, 'First', 'first'),
      defaultSlot({ x: 100, y: 100, w: 100, h: 100 }, 'Second', 'second'),
    ],
    text: { top: defaultText(), bottom: defaultText() },
    createdAt: '',
    updatedAt: '',
  }
}

describe('applyBatchSettings', () => {
  it('applies shared framing and color settings to the first slot only', () => {
    const template = makeTemplate()
    const result = applyBatchSettings(template, {
      ...defaultBatchSettings(),
      fit: 'contain',
      zoom: 1.5,
      offsetX: 12,
      offsetY: -8,
      target: 'first',
      trimEdges: false,
      tint: true,
      tintStrength: 45,
      feather: 3,
      opacity: 80,
    })

    expect(result.slots[0].fit).toBe('contain')
    expect(result.slots[0].transform).toEqual({ zoom: 1.5, offsetX: 12, offsetY: -8 })
    expect(result.slots[0].blend.trimEdges).toBe(false)
    expect(result.slots[0].blend.tint).toBe(true)
    expect(result.slots[0].blend.tintStrength).toBe(45)
    expect(result.slots[0].blend.feather).toBe(3)
    expect(result.slots[0].blend.opacity).toBe(80)

    expect(result.slots[1].fit).toBe('cover')
    expect(result.slots[1].transform).toEqual({ zoom: 1, offsetX: 0, offsetY: 0 })
  })

  it('applies the settings to every slot when target is all', () => {
    const result = applyBatchSettings(makeTemplate(), {
      ...defaultBatchSettings(),
      target: 'all',
      zoom: 0.5,
      tintStrength: 10,
    })
    for (const slot of result.slots) {
      expect(slot.transform).toEqual({ zoom: 0.5, offsetX: 0, offsetY: 0 })
      expect(slot.blend.tintStrength).toBe(10)
    }
  })

  it('does not mutate the source template', () => {
    const template = makeTemplate()
    const before = JSON.stringify(template)
    applyBatchSettings(template, { ...defaultBatchSettings(), target: 'all', zoom: 2 })
    expect(JSON.stringify(template)).toBe(before)
  })
})
