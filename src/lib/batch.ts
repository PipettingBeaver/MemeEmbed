import type { FitMode, MemeTemplate } from './types'

export type BatchTarget = 'first' | 'all'

export interface BatchSettings {
  fit: FitMode
  zoom: number
  offsetX: number
  offsetY: number
  target: BatchTarget
  trimEdges: boolean
  tint: boolean
  tintStrength: number
  feather: number
  opacity: number
}

export function defaultBatchSettings(): BatchSettings {
  return {
    fit: 'cover',
    zoom: 1,
    offsetX: 0,
    offsetY: 0,
    target: 'first',
    trimEdges: true,
    tint: true,
    tintStrength: 20,
    feather: 6,
    opacity: 100,
  }
}

/**
 * Returns a copy of the template with the same image-framing and color settings
 * applied to the target slot(s). Tint is sampled per template from its own base
 * image at render time, so each output keeps the local scene color.
 */
export function applyBatchSettings(
  template: MemeTemplate,
  settings: BatchSettings,
): MemeTemplate {
  const clone = JSON.parse(JSON.stringify(template)) as MemeTemplate
  const slots = settings.target === 'all' ? clone.slots : clone.slots.slice(0, 1)
  for (const slot of slots) {
    slot.fit = settings.fit
    slot.transform = {
      zoom: settings.zoom,
      offsetX: settings.offsetX,
      offsetY: settings.offsetY,
    }
    slot.blend = {
      ...slot.blend,
      trimEdges: settings.trimEdges,
      tint: settings.tint,
      tintStrength: settings.tintStrength,
      feather: settings.feather,
      opacity: settings.opacity,
    }
  }
  return clone
}
