import {
  clampNumber,
  computeCoverDest,
  computeCoverSource,
  destFor,
  isAxisAlignedQuad,
  pointsBBox,
  polygonCentroid,
  rectCorners,
  roundedRectOutlinePoints,
} from './geometry'
import { buildAutoAlpha } from './mask'
import { detectTrim, type PixelBuffer } from './trim'
import type {
  BlendSettings,
  GuideSettings,
  MemeTemplate,
  Point,
  Rect,
  Slot,
  TextLayer,
} from './types'
import {
  applyHomography,
  drawWarpedCanvas,
  homographyFromRectToQuad,
  type Homography,
} from './warp'

const imageDataCache = new WeakMap<HTMLImageElement, ImageData>()
const sourceCache = new WeakMap<HTMLImageElement, Map<string, PreparedSource>>()
const processedCache = new WeakMap<HTMLImageElement, Map<string, HTMLCanvasElement>>()
const imageIds = new WeakMap<HTMLImageElement, number>()
const maskCache = new Map<string, HTMLCanvasElement>()
const MAX_CACHE_ENTRIES = 64
let nextImageId = 1

export interface RenderOptions {
  template: MemeTemplate
  baseImage: HTMLImageElement | null
  slotImages: Record<string, HTMLImageElement>
  backfillImages: Record<string, HTMLImageElement>
  showOverlays: boolean
  selectedSlotId?: string | null
  creatingPoints?: Point[]
  guides?: GuideSettings
}

const DEFAULT_GUIDES: GuideSettings = {
  outlines: false,
  thirds: false,
  center: false,
  measurements: false,
  handles: true,
}

export interface ProcessSlotArgs {
  image: HTMLImageElement
  slot: Slot
  backfillImage?: HTMLImageElement
  tintColor: string | null
  mask?: HTMLCanvasElement | null
  maskKey?: string | null
}

interface PreparedSource {
  canvas: HTMLCanvasElement
  width: number
  height: number
}

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width))
  canvas.height = Math.max(1, Math.round(height))
  return canvas
}

function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas 2D context unavailable')
  return ctx
}

function imageId(image: HTMLImageElement): number {
  const existing = imageIds.get(image)
  if (existing) return existing
  const id = nextImageId++
  imageIds.set(image, id)
  return id
}

export function getImageDataForImage(image: HTMLImageElement): PixelBuffer {
  return getImageDataCached(image) as PixelBuffer
}

function getImageDataCached(image: HTMLImageElement): ImageData {
  const cached = imageDataCache.get(image)
  if (cached) return cached
  const width = image.naturalWidth || image.width
  const height = image.naturalHeight || image.height
  const canvas = createCanvas(width, height)
  const ctx = context2d(canvas)
  ctx.drawImage(image, 0, 0)
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height)
  imageDataCache.set(image, data)
  return data
}

function remember<K extends object, V>(map: WeakMap<K, Map<string, V>>, key: K, cacheKey: string, value: V): V {
  let entries = map.get(key)
  if (!entries) {
    entries = new Map<string, V>()
    map.set(key, entries)
  }
  if (entries.size > MAX_CACHE_ENTRIES) entries.clear()
  entries.set(cacheKey, value)
  return value
}

function prepareSource(image: HTMLImageElement, blend: BlendSettings): PreparedSource {
  const naturalWidth = image.naturalWidth || image.width
  const naturalHeight = image.naturalHeight || image.height
  const cacheKey = [
    blend.trimEdges,
    blend.trimThreshold,
    blend.trimColor,
    blend.downscale,
    naturalWidth,
    naturalHeight,
  ].join('|')

  const cached = sourceCache.get(image)?.get(cacheKey)
  if (cached) return cached

  let sx = 0
  let sy = 0
  let sw = naturalWidth
  let sh = naturalHeight

  if (blend.trimEdges) {
    const data = getImageDataCached(image)
    const result = detectTrim(data as PixelBuffer, {
      threshold: blend.trimThreshold,
      color: blend.trimColor,
    })
    if (result.changed) {
      sx = result.rect.x
      sy = result.rect.y
      sw = result.rect.w
      sh = result.rect.h
    }
  }

  let outWidth = Math.max(1, Math.round(sw))
  let outHeight = Math.max(1, Math.round(sh))
  if (blend.downscale > 0 && blend.downscale < outWidth) {
    outWidth = Math.max(1, Math.round(blend.downscale))
    outHeight = Math.max(1, Math.round(sh * (outWidth / sw)))
  }

  const canvas = createCanvas(outWidth, outHeight)
  const ctx = context2d(canvas)
  ctx.imageSmoothingEnabled = true
  ctx.drawImage(image, sx, sy, sw, sh, 0, 0, outWidth, outHeight)

  return remember<HTMLImageElement, PreparedSource>(
    sourceCache,
    image,
    cacheKey,
    { canvas, width: outWidth, height: outHeight },
  )
}

function supportsFilter(ctx: CanvasRenderingContext2D): boolean {
  return 'filter' in ctx
}

function tryComposite(ctx: CanvasRenderingContext2D, mode: GlobalCompositeOperation): boolean {
  const previous = ctx.globalCompositeOperation
  try {
    ctx.globalCompositeOperation = mode
  } catch {
    /* ignored */
  }
  const ok = ctx.globalCompositeOperation === mode
  ctx.globalCompositeOperation = previous
  return ok
}

function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2))
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + width, y, x + width, y + height, r)
  ctx.arcTo(x + width, y + height, x, y + height, r)
  ctx.arcTo(x, y + height, x, y, r)
  ctx.arcTo(x, y, x + width, y, r)
  ctx.closePath()
}

function softenMask(mask: HTMLCanvasElement, feather: number): HTMLCanvasElement {
  const amount = Math.round(feather)
  if (amount <= 0) return mask
  const softened = createCanvas(mask.width, mask.height)
  const ctx = context2d(softened)
  if (supportsFilter(ctx)) ctx.filter = `blur(${amount}px)`
  ctx.drawImage(mask, 0, 0)
  if (supportsFilter(ctx)) ctx.filter = 'none'
  return softened
}

function buildSlotMask(
  slot: Slot,
  baseImage: HTMLImageElement | null,
  baseData: PixelBuffer | null,
  templateWidth: number,
  templateHeight: number,
): { canvas: HTMLCanvasElement; key: string } | null {
  if (slot.mask.mode === 'rect') return null

  const destWidth = Math.max(1, Math.round(slot.rect.w))
  const destHeight = Math.max(1, Math.round(slot.rect.h))
  const key = [
    'mask',
    baseImage ? imageId(baseImage) : 0,
    slot.mask.mode,
    slot.mask.cornerRadius,
    slot.mask.inset,
    slot.mask.autoSource,
    slot.mask.tolerance,
    Math.round(slot.rect.x),
    Math.round(slot.rect.y),
    destWidth,
    destHeight,
    Math.round(slot.blend.feather),
  ].join('|')

  const cached = maskCache.get(key)
  if (cached) return { canvas: cached, key }

  const canvas = createCanvas(destWidth, destHeight)
  const ctx = context2d(canvas)

  if (slot.mask.mode === 'rounded') {
    const scale = Math.min(
      destWidth / Math.max(1, slot.rect.w),
      destHeight / Math.max(1, slot.rect.h),
    )
    const inset = Math.max(
      0,
      Math.min(slot.mask.inset * scale, Math.min(destWidth, destHeight) / 2 - 0.5),
    )
    const radius = Math.max(0, slot.mask.cornerRadius * scale)
    ctx.fillStyle = '#ffffff'
    roundedRectPath(
      ctx,
      inset,
      inset,
      Math.max(1, destWidth - inset * 2),
      Math.max(1, destHeight - inset * 2),
      radius,
    )
    ctx.fill()
  } else if (baseData) {
    const analysisScale = Math.min(
      1,
      1024 / Math.max(destWidth, destHeight),
    )
    const maskWidth = Math.max(1, Math.round(destWidth * analysisScale))
    const maskHeight = Math.max(1, Math.round(destHeight * analysisScale))
    const result = buildAutoAlpha(
      baseData,
      slot.rect,
      templateWidth,
      templateHeight,
      maskWidth,
      maskHeight,
      slot.mask,
    )
    const temp = createCanvas(maskWidth, maskHeight)
    const tempCtx = context2d(temp)
    const imageData = tempCtx.createImageData(maskWidth, maskHeight)
    for (let i = 0; i < result.alpha.length; i += 1) {
      const j = i * 4
      imageData.data[j] = 255
      imageData.data[j + 1] = 255
      imageData.data[j + 2] = 255
      imageData.data[j + 3] = result.alpha[i]
    }
    tempCtx.putImageData(imageData, 0, 0)
    ctx.imageSmoothingEnabled = true
    ctx.drawImage(temp, 0, 0, destWidth, destHeight)
  } else {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, destWidth, destHeight)
  }

  const softened = softenMask(canvas, slot.blend.feather)
  if (maskCache.size > MAX_CACHE_ENTRIES) maskCache.clear()
  maskCache.set(key, softened)
  return { canvas: softened, key }
}

function adjustColor(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  brightness: number,
  saturation: number,
): void {
  if (brightness === 1 && saturation === 1) return
  const imageData = ctx.getImageData(0, 0, width, height)
  const data = imageData.data
  for (let i = 0; i < data.length; i += 4) {
    let r = data[i] * brightness
    let g = data[i + 1] * brightness
    let b = data[i + 2] * brightness
    if (saturation !== 1) {
      const gray = 0.2126 * r + 0.7152 * g + 0.0722 * b
      r = gray + (r - gray) * saturation
      g = gray + (g - gray) * saturation
      b = gray + (b - gray) * saturation
    }
    data[i] = clampNumber(r, 0, 255)
    data[i + 1] = clampNumber(g, 0, 255)
    data[i + 2] = clampNumber(b, 0, 255)
  }
  ctx.putImageData(imageData, 0, 0)
}

function applyTint(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  color: string,
  strength: number,
): void {
  if (strength <= 0) return
  ctx.save()
  const supportsColorBlend = tryComposite(ctx, 'color')
  ctx.globalCompositeOperation = supportsColorBlend ? 'color' : 'source-atop'
  ctx.globalAlpha = clampNumber(strength, 0, 1)
  ctx.fillStyle = color
  ctx.fillRect(0, 0, width, height)
  ctx.restore()
}

function applyFeather(canvas: HTMLCanvasElement, feather: number): void {
  const width = canvas.width
  const height = canvas.height
  const amount = Math.min(Math.round(feather), Math.floor(Math.min(width, height) / 2))
  if (amount <= 0) return

  const mask = createCanvas(width, height)
  const maskCtx = context2d(mask)
  maskCtx.fillStyle = '#ffffff'
  maskCtx.fillRect(0, 0, width, height)
  maskCtx.globalCompositeOperation = 'destination-out'

  const edgeGradient = (
    x0: number,
    y0: number,
    x1: number,
    y1: number,
  ): void => {
    const gradient = maskCtx.createLinearGradient(x0, y0, x1, y1)
    gradient.addColorStop(0, 'rgba(0,0,0,1)')
    gradient.addColorStop(1, 'rgba(0,0,0,0)')
    maskCtx.fillStyle = gradient
    maskCtx.fillRect(0, 0, width, height)
  }

  edgeGradient(0, 0, amount, 0)
  edgeGradient(width, 0, width - amount, 0)
  edgeGradient(0, 0, 0, amount)
  edgeGradient(0, height, 0, height - amount)

  maskCtx.globalCompositeOperation = 'source-over'

  const ctx = context2d(canvas)
  ctx.save()
  ctx.globalCompositeOperation = 'destination-in'
  ctx.drawImage(mask, 0, 0)
  ctx.restore()
}

function drawBackfill(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  slot: Slot,
  backfillImage?: HTMLImageElement,
): void {
  if (slot.backfill.mode === 'color') {
    ctx.fillStyle = slot.backfill.color || '#000000'
    ctx.fillRect(0, 0, width, height)
    return
  }
  if (slot.backfill.mode === 'image' && backfillImage) {
    const crop = computeCoverSource(
      backfillImage.naturalWidth || backfillImage.width,
      backfillImage.naturalHeight || backfillImage.height,
      width,
      height,
    )
    ctx.drawImage(backfillImage, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, width, height)
  }
}

export function processSlot(args: ProcessSlotArgs): HTMLCanvasElement {
  const { image, slot, backfillImage, tintColor } = args
  const destWidth = Math.max(1, Math.round(slot.rect.w))
  const destHeight = Math.max(1, Math.round(slot.rect.h))
  const prepared = prepareSource(image, slot.blend)

  const cacheKey = JSON.stringify({
    destWidth,
    destHeight,
    fit: slot.fit,
    transform: slot.transform ?? { zoom: 1, offsetX: 0, offsetY: 0 },
    blend: slot.blend,
    backfill: {
      mode: slot.backfill.mode,
      color: slot.backfill.color,
      hasImage: Boolean(backfillImage),
    },
    tintColor,
    maskKey: args.maskKey ?? 'rect',
    source: [prepared.width, prepared.height],
  })

  const cached = processedCache.get(image)?.get(cacheKey)
  if (cached) return cached

  const output = createCanvas(destWidth, destHeight)
  const ctx = context2d(output)
  ctx.imageSmoothingEnabled = true

  drawBackfill(ctx, destWidth, destHeight, slot, backfillImage)

  const crop = { sx: 0, sy: 0, sw: prepared.width, sh: prepared.height }
  const dest =
    slot.fit === 'cover'
      ? computeCoverDest(prepared.width, prepared.height, destWidth, destHeight)
      : destFor(slot.fit, prepared.width, prepared.height, destWidth, destHeight)

  const zoom = clampNumber(slot.transform?.zoom ?? 1, 0.1, 10)
  const offsetX = slot.transform?.offsetX ?? 0
  const offsetY = slot.transform?.offsetY ?? 0
  if (zoom !== 1 || offsetX !== 0 || offsetY !== 0) {
    const centerX = dest.dx + dest.dw / 2
    const centerY = dest.dy + dest.dh / 2
    dest.dw *= zoom
    dest.dh *= zoom
    dest.dx = centerX - dest.dw / 2 + offsetX
    dest.dy = centerY - dest.dh / 2 + offsetY
  }

  if (slot.blend.blur > 0 && supportsFilter(ctx)) {
    ctx.filter = `blur(${slot.blend.blur}px)`
  }
  ctx.drawImage(
    prepared.canvas,
    crop.sx,
    crop.sy,
    crop.sw,
    crop.sh,
    dest.dx,
    dest.dy,
    dest.dw,
    dest.dh,
  )
  if (supportsFilter(ctx)) ctx.filter = 'none'

  adjustColor(ctx, destWidth, destHeight, slot.blend.brightness / 100, slot.blend.saturation / 100)

  if (tintColor && slot.blend.tint) {
    applyTint(ctx, destWidth, destHeight, tintColor, slot.blend.tintStrength / 100)
  }

  if (args.mask) {
    ctx.save()
    ctx.globalCompositeOperation = 'destination-in'
    ctx.drawImage(args.mask, 0, 0)
    ctx.restore()
  } else if (slot.blend.feather > 0) {
    applyFeather(output, slot.blend.feather)
  }

  return remember<HTMLImageElement, HTMLCanvasElement>(processedCache, image, cacheKey, output)
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (value: number) =>
    Math.round(clampNumber(value, 0, 255)).toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

export function sampleBorderColor(
  data: PixelBuffer,
  rect: Rect,
  templateWidth: number,
  templateHeight: number,
): string {
  const scaleX = data.width / Math.max(1, templateWidth)
  const scaleY = data.height / Math.max(1, templateHeight)
  const band = Math.max(
    4,
    Math.round(Math.min(rect.w * scaleX, rect.h * scaleY) * 0.08),
  )

  const left = Math.max(0, Math.floor(rect.x * scaleX) - band)
  const right = Math.min(data.width - 1, Math.ceil((rect.x + rect.w) * scaleX) + band)
  const top = Math.max(0, Math.floor(rect.y * scaleY) - band)
  const bottom = Math.min(data.height - 1, Math.ceil((rect.y + rect.h) * scaleY) + band)

  const innerLeft = Math.floor(rect.x * scaleX)
  const innerRight = Math.ceil((rect.x + rect.w) * scaleX)
  const innerTop = Math.floor(rect.y * scaleY)
  const innerBottom = Math.ceil((rect.y + rect.h) * scaleY)

  let r = 0
  let g = 0
  let b = 0
  let count = 0
  for (let y = top; y <= bottom; y += 1) {
    for (let x = left; x <= right; x += 1) {
      if (x >= innerLeft && x <= innerRight && y >= innerTop && y <= innerBottom) {
        continue
      }
      const i = (y * data.width + x) * 4
      if (data.data[i + 3] <= 8) continue
      r += data.data[i]
      g += data.data[i + 1]
      b += data.data[i + 2]
      count += 1
    }
  }

  if (count === 0) return '#000000'
  return rgbToHex(r / count, g / count, b / count)
}

function slotGeometryPoints(slot: Slot): Point[] {
  if (slot.shape === 'quad' && slot.points && slot.points.length === 4) {
    return slot.points
  }
  const { x, y, w, h } = slot.rect
  return [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ]
}

function slotHomography(slot: Slot): Homography | null {
  if (slot.shape !== 'quad' || !slot.points || slot.points.length !== 4) return null
  if (isAxisAlignedQuad(slot.rect, slot.points)) return null
  return homographyFromRectToQuad(slot.rect.w, slot.rect.h, slot.points)
}

function drawSlotTexture(
  ctx: CanvasRenderingContext2D,
  texture: HTMLCanvasElement,
  slot: Slot,
  gridSize: number,
): void {
  const matrix = slotHomography(slot)
  if (matrix) {
    drawWarpedCanvas(ctx, texture, texture.width, texture.height, matrix, gridSize)
  } else {
    ctx.drawImage(texture, slot.rect.x, slot.rect.y, slot.rect.w, slot.rect.h)
  }
}

function tracePointsPath(ctx: CanvasRenderingContext2D, points: Point[]): void {
  ctx.beginPath()
  ctx.moveTo(points[0].x, points[0].y)
  for (let i = 1; i < points.length; i += 1) {
    ctx.lineTo(points[i].x, points[i].y)
  }
  ctx.closePath()
}

function traceSlotPath(ctx: CanvasRenderingContext2D, slot: Slot): void {
  tracePointsPath(ctx, slotGeometryPoints(slot))
}

/** Soft outer glow drawn behind the slot, outside its silhouette only. */
function drawSlotGlow(ctx: CanvasRenderingContext2D, slot: Slot): void {
  if (!slot.blend.glowEnabled) return
  const size = clampNumber(slot.blend.glowSize ?? 0, 0, 200)
  const opacity = clampNumber((slot.blend.glowOpacity ?? 0) / 100, 0, 1)
  if (size <= 0 || opacity <= 0) return

  const color = slot.blend.glowColor || '#000000'
  const points = slotGeometryPoints(slot)
  const bbox = pointsBBox(points)
  if (bbox.w <= 0 || bbox.h <= 0) return

  const pad = Math.ceil(size * 2) + 2
  const layer = createCanvas(Math.ceil(bbox.w) + pad * 2, Math.ceil(bbox.h) + pad * 2)
  const layerCtx = context2d(layer)
  const offsetX = pad - bbox.x
  const offsetY = pad - bbox.y

  layerCtx.save()
  layerCtx.translate(offsetX, offsetY)
  layerCtx.fillStyle = color
  layerCtx.shadowColor = color
  layerCtx.shadowBlur = size
  layerCtx.shadowOffsetX = 0
  layerCtx.shadowOffsetY = 0
  tracePointsPath(layerCtx, points)
  layerCtx.fill()
  layerCtx.restore()

  layerCtx.save()
  layerCtx.translate(offsetX, offsetY)
  layerCtx.globalCompositeOperation = 'destination-out'
  tracePointsPath(layerCtx, points)
  layerCtx.fill()
  layerCtx.restore()

  ctx.save()
  ctx.globalAlpha = opacity
  ctx.drawImage(layer, bbox.x - pad, bbox.y - pad)
  ctx.restore()
}

function bevelGuidePoints(slot: Slot): Point[] | null {
  if (slot.mask.mode !== 'rounded') return null
  const inset = Math.max(
    0,
    Math.min(slot.mask.inset, Math.min(slot.rect.w, slot.rect.h) / 2 - 1),
  )
  const innerWidth = Math.max(1, slot.rect.w - inset * 2)
  const innerHeight = Math.max(1, slot.rect.h - inset * 2)
  const radius = Math.max(
    0,
    Math.min(slot.mask.cornerRadius, innerWidth / 2, innerHeight / 2),
  )
  if (radius <= 0 && inset <= 0) return null

  const local = roundedRectOutlinePoints(inset, inset, innerWidth, innerHeight, radius)
  const matrix = slotHomography(slot)
  if (matrix) {
    return local.map((point) => applyHomography(matrix, point.x, point.y))
  }
  return local.map((point) => ({
    x: point.x + slot.rect.x,
    y: point.y + slot.rect.y,
  }))
}

function drawCornerLabels(
  ctx: CanvasRenderingContext2D,
  points: Point[],
  unit: number,
): void {
  if (points.length < 4) return
  const center = polygonCentroid(points.slice(0, 4))
  const fontSize = Math.max(9, Math.round(unit * 9))
  const padX = unit * 2.5
  const padY = unit * 1.4
  const offset = unit * 16

  ctx.save()
  ctx.font = `700 ${fontSize}px system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (let index = 0; index < 4; index += 1) {
    const point = points[index]
    const dx = point.x - center.x
    const dy = point.y - center.y
    const distance = Math.max(1, Math.hypot(dx, dy))
    const labelX = point.x + (dx / distance) * offset
    const labelY = point.y + (dy / distance) * offset
    const label = `P${index + 1}`
    const width = ctx.measureText(label).width
    ctx.fillStyle = 'rgba(6, 12, 18, 0.88)'
    ctx.fillRect(
      labelX - width / 2 - padX,
      labelY - fontSize / 2 - padY,
      width + padX * 2,
      fontSize + padY * 2,
    )
    ctx.fillStyle = '#cfe8ff'
    ctx.fillText(label, labelX, labelY)
  }
  ctx.restore()
}

function drawQuadHandles(
  ctx: CanvasRenderingContext2D,
  points: Point[],
  unit: number,
): void {
  const size = unit * 8
  const half = size / 2
  ctx.fillStyle = '#0d1621'
  ctx.strokeStyle = '#4cc2ff'
  ctx.lineWidth = unit * 1.5
  for (const point of points) {
    ctx.beginPath()
    ctx.rect(point.x - half, point.y - half, size, size)
    ctx.fill()
    ctx.stroke()
  }
  drawCornerLabels(ctx, points, unit)
}

function strokeDashedPolyline(
  ctx: CanvasRenderingContext2D,
  points: Point[],
  unit: number,
  color: string,
): void {
  if (points.length < 2) return
  ctx.save()
  ctx.setLineDash([unit * 5, unit * 4])
  ctx.lineWidth = unit * 1.5
  ctx.strokeStyle = color
  ctx.beginPath()
  ctx.moveTo(points[0].x, points[0].y)
  for (let i = 1; i < points.length; i += 1) {
    ctx.lineTo(points[i].x, points[i].y)
  }
  ctx.closePath()
  ctx.stroke()
  ctx.restore()
}

function wrapLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (!current || ctx.measureText(candidate).width <= maxWidth) {
      current = candidate
    } else {
      lines.push(current)
      current = word
    }
  }
  if (current) lines.push(current)
  return lines
}

function drawTextLayer(
  ctx: CanvasRenderingContext2D,
  template: MemeTemplate,
  layer: TextLayer,
  position: 'top' | 'bottom',
): void {
  if (!layer.enabled) return
  const raw = layer.text.trim()
  if (!raw) return

  const text = layer.uppercase ? raw.toUpperCase() : raw
  const width = template.width
  const height = template.height
  const margin = Math.round(width * 0.03)
  const maxWidth = Math.max(16, width - margin * 2)
  const maxHeight = height * 0.45

  let fontSize = Math.max(8, Math.round(layer.fontSize))
  let lines: string[] = []
  for (; fontSize >= 8; fontSize -= 2) {
    ctx.font = `${fontSize}px ${layer.fontFamily}`
    lines = wrapLines(ctx, text, maxWidth)
    const lineHeight = fontSize * layer.lineSpacing
    if (lines.length * lineHeight <= maxHeight) break
  }

  ctx.save()
  ctx.font = `${fontSize}px ${layer.fontFamily}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.lineJoin = 'round'
  ctx.miterLimit = 2
  ctx.lineWidth = Math.max(0, layer.strokeWidth)
  ctx.strokeStyle = layer.strokeColor
  ctx.fillStyle = layer.color

  const lineHeight = fontSize * layer.lineSpacing
  const blockHeight = lines.length * lineHeight
  let baseline =
    position === 'top'
      ? margin + fontSize
      : height - margin - blockHeight + fontSize

  for (const line of lines) {
    if (ctx.lineWidth > 0) ctx.strokeText(line, width / 2, baseline)
    ctx.fillText(line, width / 2, baseline)
    baseline += lineHeight
  }
  ctx.restore()
}

function drawEmptySlot(
  ctx: CanvasRenderingContext2D,
  slot: Slot,
  maskCanvas: HTMLCanvasElement | null,
): void {
  const unit = Math.max(1, slot.rect.w / 380)
  ctx.save()

  if (maskCanvas) {
    traceSlotPath(ctx, slot)
    ctx.fillStyle = 'rgba(4, 8, 12, 0.22)'
    ctx.fill()

    const tinted = createCanvas(maskCanvas.width, maskCanvas.height)
    const tintedCtx = context2d(tinted)
    tintedCtx.fillStyle = 'rgba(76, 194, 255, 0.95)'
    tintedCtx.fillRect(0, 0, tinted.width, tinted.height)
    tintedCtx.globalCompositeOperation = 'destination-in'
    tintedCtx.drawImage(maskCanvas, 0, 0)

    ctx.globalAlpha = 0.3
    drawSlotTexture(ctx, tinted, slot, 10)
    ctx.globalAlpha = 1
  } else {
    traceSlotPath(ctx, slot)
    ctx.fillStyle = 'rgba(255, 210, 90, 0.14)'
    ctx.fill()
    traceSlotPath(ctx, slot)
    ctx.setLineDash([12 * unit, 8 * unit])
    ctx.lineWidth = 3 * unit
    ctx.strokeStyle = 'rgba(255, 210, 90, 0.9)'
    ctx.stroke()
    ctx.setLineDash([])
  }

  const label = polygonCentroid(slotGeometryPoints(slot))
  const size = Math.max(14, Math.round(Math.min(slot.rect.w, slot.rect.h) * 0.07))
  ctx.font = `600 ${size}px system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = 'rgba(255, 244, 210, 0.95)'
  ctx.fillText('Click to attach image', label.x, label.y)
  ctx.restore()
}

function drawHandles(
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  unit: number,
): void {
  const size = unit * 8
  const half = size / 2
  const points: Point[] = [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.w / 2, y: rect.y },
    { x: rect.x + rect.w, y: rect.y },
    { x: rect.x + rect.w, y: rect.y + rect.h / 2 },
    { x: rect.x + rect.w, y: rect.y + rect.h },
    { x: rect.x + rect.w / 2, y: rect.y + rect.h },
    { x: rect.x, y: rect.y + rect.h },
    { x: rect.x, y: rect.y + rect.h / 2 },
  ]
  ctx.fillStyle = '#0d1621'
  ctx.strokeStyle = '#4cc2ff'
  ctx.lineWidth = unit * 1.5
  for (const point of points) {
    ctx.beginPath()
    ctx.rect(point.x - half, point.y - half, size, size)
    ctx.fill()
    ctx.stroke()
  }
  drawCornerLabels(ctx, rectCorners(rect), unit)
}

function drawGuides(
  ctx: CanvasRenderingContext2D,
  template: MemeTemplate,
  guides: GuideSettings,
): void {
  const width = Math.max(1, Math.round(template.width))
  const height = Math.max(1, Math.round(template.height))
  const unit = Math.max(1.5, width / 500)

  if (guides.measurements) {
    ctx.save()
    ctx.lineWidth = Math.max(1, unit * 0.8)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)'
    ctx.font = `${Math.round(unit * 7)}px system-ui, sans-serif`
    ctx.fillStyle = 'rgba(255, 255, 255, 0.38)'
    ctx.textBaseline = 'top'
    ctx.textAlign = 'left'
    ctx.beginPath()
    for (let x = 100; x < width; x += 100) {
      ctx.moveTo(x, 0)
      ctx.lineTo(x, height)
    }
    for (let y = 100; y < height; y += 100) {
      ctx.moveTo(0, y)
      ctx.lineTo(width, y)
    }
    ctx.stroke()
    for (let x = 200; x < width; x += 200) {
      ctx.fillText(String(x), x + unit * 2, unit * 2)
    }
    for (let y = 200; y < height; y += 200) {
      ctx.fillText(String(y), unit * 2, y + unit * 2)
    }
    ctx.restore()
  }

  if (guides.thirds) {
    ctx.save()
    ctx.setLineDash([unit * 6, unit * 5])
    ctx.lineWidth = Math.max(1, unit * 1.2)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)'
    ctx.beginPath()
    for (const ratio of [1 / 3, 2 / 3]) {
      ctx.moveTo(width * ratio, 0)
      ctx.lineTo(width * ratio, height)
      ctx.moveTo(0, height * ratio)
      ctx.lineTo(width, height * ratio)
    }
    ctx.stroke()
    ctx.restore()
  }

  if (guides.center) {
    ctx.save()
    ctx.setLineDash([unit * 8, unit * 5])
    ctx.lineWidth = Math.max(1, unit * 1.2)
    ctx.strokeStyle = 'rgba(76, 194, 255, 0.45)'
    ctx.beginPath()
    ctx.moveTo(width / 2, 0)
    ctx.lineTo(width / 2, height)
    ctx.moveTo(0, height / 2)
    ctx.lineTo(width, height / 2)
    ctx.stroke()
    ctx.restore()
  }
}

function drawOverlays(
  ctx: CanvasRenderingContext2D,
  template: MemeTemplate,
  selectedSlotId: string | null,
  creatingPoints: Point[],
  guides: GuideSettings,
): void {
  const unit = Math.max(1.5, template.width / 500)

  for (const slot of template.slots) {
    const bbox = slot.rect
    const selected = slot.id === selectedSlotId
    if (!selected && !guides.outlines) continue
    ctx.save()
    ctx.lineWidth = unit * 1.5
    ctx.strokeStyle = selected ? '#4cc2ff' : 'rgba(255,255,255,0.55)'
    ctx.setLineDash(selected ? [] : [unit * 4, unit * 3])
    traceSlotPath(ctx, slot)
    ctx.stroke()
    ctx.setLineDash([])

    const label = guides.measurements
      ? `${slot.name} · ${Math.round(slot.rect.w)}×${Math.round(slot.rect.h)}`
      : slot.name
    const badgeFont = Math.round(unit * 8)
    ctx.font = `600 ${badgeFont}px system-ui, sans-serif`
    const textWidth = ctx.measureText(label).width
    const pad = unit * 3
    const badgeHeight = unit * 12
    const badgeX = bbox.x
    const badgeY = Math.max(0, bbox.y - badgeHeight - unit * 2)
    ctx.fillStyle = selected ? 'rgba(13, 34, 51, 0.92)' : 'rgba(10, 14, 20, 0.82)'
    ctx.fillRect(badgeX, badgeY, textWidth + pad * 2, badgeHeight)
    ctx.fillStyle = selected ? '#cfe8ff' : '#e7e7ea'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(label, badgeX + pad, badgeY + badgeHeight / 2)

    const guide = bevelGuidePoints(slot)
    if (guide) {
      strokeDashedPolyline(
        ctx,
        guide,
        unit,
        selected ? 'rgba(255, 214, 102, 0.95)' : 'rgba(255, 214, 102, 0.55)',
      )
    }

    if (selected && guides.handles) {
      if (slot.shape === 'quad' && slot.points && slot.points.length === 4) {
        drawQuadHandles(ctx, slot.points, unit)
      } else {
        drawHandles(ctx, bbox, unit)
      }
    }
    ctx.restore()
  }

  if (creatingPoints.length > 0) {
    ctx.save()
    ctx.strokeStyle = '#ffd25a'
    ctx.fillStyle = '#ffd25a'
    ctx.lineWidth = unit * 1.5
    ctx.beginPath()
    creatingPoints.forEach((point, index) => {
      if (index === 0) ctx.moveTo(point.x, point.y)
      else ctx.lineTo(point.x, point.y)
    })
    ctx.stroke()
    for (const point of creatingPoints) {
      ctx.beginPath()
      ctx.arc(point.x, point.y, unit * 4, 0, Math.PI * 2)
      ctx.fill()
    }
    const font = Math.round(unit * 8)
    ctx.font = `600 ${font}px system-ui, sans-serif`
    ctx.fillStyle = 'rgba(255, 240, 200, 0.95)'
    ctx.textBaseline = 'bottom'
    const hint = `${creatingPoints.length}/4 points - click ${4 - creatingPoints.length} more`
    ctx.fillText(hint, creatingPoints[0].x, creatingPoints[0].y - unit * 6)
    ctx.restore()
  }
}

export function renderMeme(
  ctx: CanvasRenderingContext2D,
  options: RenderOptions,
): void {
  const { template, baseImage } = options
  const guides: GuideSettings = { ...DEFAULT_GUIDES, ...(options.guides ?? {}) }
  const width = Math.max(1, Math.round(template.width))
  const height = Math.max(1, Math.round(template.height))

  if (ctx.canvas.width !== width || ctx.canvas.height !== height) {
    ctx.canvas.width = width
    ctx.canvas.height = height
  }

  ctx.clearRect(0, 0, width, height)
  ctx.imageSmoothingEnabled = true

  if (baseImage) {
    ctx.drawImage(baseImage, 0, 0, width, height)
  } else {
    ctx.fillStyle = '#1b1b1f'
    ctx.fillRect(0, 0, width, height)
  }

  const baseData = baseImage ? (getImageDataCached(baseImage) as PixelBuffer) : null

  for (const slot of template.slots) {
    const image = options.slotImages[slot.id]
    const maskInfo = buildSlotMask(slot, baseImage, baseData, width, height)
    drawSlotGlow(ctx, slot)
    if (image) {
      const tintColor =
        baseData && slot.blend.tint
          ? sampleBorderColor(baseData, slot.rect, width, height)
          : null
      const processed = processSlot({
        image,
        slot,
        backfillImage: options.backfillImages[slot.id],
        tintColor,
        mask: maskInfo?.canvas ?? null,
        maskKey: maskInfo?.key ?? null,
      })
      ctx.globalAlpha = clampNumber(slot.blend.opacity / 100, 0, 1)
      drawSlotTexture(ctx, processed, slot, options.showOverlays ? 10 : 24)
      ctx.globalAlpha = 1
    } else if (
      options.showOverlays &&
      (slot.id === options.selectedSlotId || guides.outlines)
    ) {
      drawEmptySlot(ctx, slot, maskInfo?.canvas ?? null)
    }
  }

  drawTextLayer(ctx, template, template.text.top, 'top')
  drawTextLayer(ctx, template, template.text.bottom, 'bottom')

  if (options.showOverlays) {
    drawGuides(ctx, template, guides)
    drawOverlays(
      ctx,
      template,
      options.selectedSlotId ?? null,
      options.creatingPoints ?? [],
      guides,
    )
  }
}

export function createExportCanvas(options: RenderOptions): HTMLCanvasElement {
  const canvas = createCanvas(options.template.width, options.template.height)
  const ctx = context2d(canvas)
  renderMeme(ctx, { ...options, showOverlays: false })
  return canvas
}
