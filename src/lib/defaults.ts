import { pointsBBox } from './geometry'
import type {
  BackfillSettings,
  BlendSettings,
  MaskSettings,
  ImageTransform,
  MemeTemplate,
  Point,
  Rect,
  Slot,
  TextLayer,
} from './types'

export const SCHEMA_VERSION = 1
export const DEFAULT_FONT = "Impact, 'Arial Black', sans-serif"

export function defaultTransform(): ImageTransform {
  return {
    zoom: 1,
    offsetX: 0,
    offsetY: 0,
  }
}

export function defaultBlend(): BlendSettings {
  return {
    trimEdges: true,
    trimThreshold: 24,
    trimColor: 'auto',
    feather: 6,
    tint: true,
    tintStrength: 20,
    glowEnabled: false,
    glowColor: '#000000',
    glowSize: 24,
    glowOpacity: 70,
    downscale: 0,
    blur: 0,
    brightness: 100,
    saturation: 100,
    opacity: 100,
  }
}

export function defaultMask(): MaskSettings {
  return {
    mode: 'rect',
    cornerRadius: 0,
    inset: 0,
    autoSource: 'auto',
    tolerance: 36,
  }
}

export function defaultBackfill(): BackfillSettings {
  return {
    mode: 'none',
    color: '#000000',
    imageFile: null,
  }
}

export function defaultText(): TextLayer {
  return {
    enabled: false,
    text: '',
    fontFamily: DEFAULT_FONT,
    fontSize: 64,
    color: '#ffffff',
    strokeColor: '#000000',
    strokeWidth: 6,
    uppercase: true,
    lineSpacing: 1.05,
  }
}

export function makeId(prefix = 'slot'): string {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10)
  return `${prefix}-${random}`
}

export function defaultSlot(rect: Rect, name?: string, id?: string): Slot {
  return {
    id: id ?? makeId(),
    name: name ?? 'Embed',
    shape: 'rect',
    rect: { ...rect },
    fit: 'cover',
    imageFile: null,
    transform: defaultTransform(),
    mask: defaultMask(),
    backfill: defaultBackfill(),
    blend: defaultBlend(),
  }
}

export function createTemplateFromImage(args: {
  name: string
  width: number
  height: number
  baseImageFile: string
  description?: string
}): MemeTemplate {
  const now = new Date().toISOString()
  return {
    schemaVersion: SCHEMA_VERSION,
    id: 'unsaved',
    name: args.name,
    description: args.description ?? '',
    width: args.width,
    height: args.height,
    baseImageFile: args.baseImageFile,
    slots: [],
    text: {
      top: defaultText(),
      bottom: defaultText(),
    },
    createdAt: now,
    updatedAt: now,
  }
}

function mergeText(value: Partial<TextLayer> | undefined): TextLayer {
  return { ...defaultText(), ...(value ?? {}) }
}

function mergeBackfill(value: Partial<BackfillSettings> | undefined): BackfillSettings {
  return { ...defaultBackfill(), ...(value ?? {}) }
}

function mergeMask(value: Partial<MaskSettings> | undefined): MaskSettings {
  return { ...defaultMask(), ...(value ?? {}) }
}

function mergeBlend(value: Partial<BlendSettings> | undefined): BlendSettings {
  return { ...defaultBlend(), ...(value ?? {}) }
}

function mergeTransform(value: Partial<ImageTransform> | undefined): ImageTransform {
  const merged = { ...defaultTransform(), ...(value ?? {}) }
  return {
    zoom: Number.isFinite(merged.zoom)
      ? Math.min(Math.max(merged.zoom, 0.1), 10)
      : 1,
    offsetX: Number.isFinite(merged.offsetX) ? merged.offsetX : 0,
    offsetY: Number.isFinite(merged.offsetY) ? merged.offsetY : 0,
  }
}

export function migrateTemplate(input: MemeTemplate): MemeTemplate {
  const now = new Date().toISOString()
  const slots = Array.isArray(input.slots) ? input.slots : []
  return {
    ...input,
    schemaVersion: input.schemaVersion ?? SCHEMA_VERSION,
    description: input.description ?? '',
    slots: slots.map((slot, index) => {
      const points: Point[] | undefined =
        Array.isArray(slot.points) &&
        slot.points.length === 4 &&
        slot.points.every(
          (point) => Number.isFinite(point.x) && Number.isFinite(point.y),
        )
          ? slot.points.map((point) => ({ x: point.x, y: point.y }))
          : undefined
      const shape = slot.shape === 'quad' && points ? 'quad' : 'rect'
      return {
        ...slot,
        name: slot.name ?? `Embed ${index + 1}`,
        shape,
        rect:
          shape === 'quad' && points
            ? pointsBBox(points)
            : (slot.rect ?? { x: 0, y: 0, w: 100, h: 100 }),
        points: shape === 'quad' ? points : undefined,
        fit: slot.fit ?? 'cover',
        imageFile: slot.imageFile ?? null,
        transform: mergeTransform(slot.transform),
        mask: mergeMask(slot.mask),
        backfill: mergeBackfill(slot.backfill),
        blend: mergeBlend(slot.blend),
      }
    }),
    text: {
      top: mergeText(input.text?.top),
      bottom: mergeText(input.text?.bottom),
    },
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
  }
}
