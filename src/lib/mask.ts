import type { PixelBuffer } from './trim'
import type { AutoMaskSource, MaskSettings, Point, Rect } from './types'

export interface AutoMaskStats {
  source: 'surround' | 'center'
  ringColor: [number, number, number]
  centerColor: [number, number, number]
  ringStdDev: number
  coverage: number
}

export interface OrientedRect {
  corners: Point[]
  area: number
}

function cross(origin: Point, a: Point, b: Point): number {
  return (a.x - origin.x) * (b.y - origin.y) - (a.y - origin.y) * (b.x - origin.x)
}

function convexHull(points: Point[]): Point[] {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y)
  if (sorted.length <= 1) return sorted

  const lower: Point[] = []
  for (const point of sorted) {
    while (
      lower.length >= 2 &&
      cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0
    ) {
      lower.pop()
    }
    lower.push(point)
  }

  const upper: Point[] = []
  for (let i = sorted.length - 1; i >= 0; i -= 1) {
    const point = sorted[i]
    while (
      upper.length >= 2 &&
      cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0
    ) {
      upper.pop()
    }
    upper.push(point)
  }

  lower.pop()
  upper.pop()
  return lower.concat(upper)
}

/** Minimum-area oriented rectangle enclosing the largest mask region. */
export function maskOrientedRectangle(
  alpha: Uint8ClampedArray,
  width: number,
  height: number,
): OrientedRect | null {
  const boundary: Point[] = []
  const at = (x: number, y: number): number => {
    if (x < 0 || y < 0 || x >= width || y >= height) return 0
    return alpha[y * width + x]
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (alpha[y * width + x] === 0) continue
      if (
        at(x - 1, y) === 0 ||
        at(x + 1, y) === 0 ||
        at(x, y - 1) === 0 ||
        at(x, y + 1) === 0
      ) {
        boundary.push({ x, y })
      }
    }
  }

  if (boundary.length < 8) return null

  const maxPoints = 4000
  const step = Math.max(1, Math.ceil(boundary.length / maxPoints))
  const sampled = boundary.filter((_, index) => index % step === 0)
  const hull = convexHull(sampled)
  if (hull.length < 3) return null

  let bestCorners: Point[] | null = null
  let bestArea = Infinity

  for (let i = 0; i < hull.length; i += 1) {
    const a = hull[i]
    const b = hull[(i + 1) % hull.length]
    const ex = b.x - a.x
    const ey = b.y - a.y
    const length = Math.hypot(ex, ey)
    if (length < 1e-6) continue

    const ux = ex / length
    const uy = ey / length
    const vx = -uy
    const vy = ux

    let minU = Infinity
    let maxU = -Infinity
    let minV = Infinity
    let maxV = -Infinity
    for (const point of hull) {
      const u = point.x * ux + point.y * uy
      const v = point.x * vx + point.y * vy
      if (u < minU) minU = u
      if (u > maxU) maxU = u
      if (v < minV) minV = v
      if (v > maxV) maxV = v
    }

    const area = (maxU - minU) * (maxV - minV)
    if (area < bestArea - 1e-9) {
      bestArea = area
      const corner = (u: number, v: number): Point => ({
        x: u * ux + v * vx,
        y: u * uy + v * vy,
      })
      bestCorners = [
        corner(minU, minV),
        corner(maxU, minV),
        corner(maxU, maxV),
        corner(minU, maxV),
      ]
    }
  }

  if (!bestCorners) return null
  return { corners: bestCorners, area: bestArea }
}

export interface BevelEstimate {
  bbox: Rect
  radius: number
  inset: number
  coverage: number
  rounded: boolean
}

export interface AutoMaskResult {
  alpha: Uint8ClampedArray
  stats: AutoMaskStats
}

type Rgb = [number, number, number]

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function colorAt(data: PixelBuffer, x: number, y: number): Rgb {
  const i = (y * data.width + x) * 4
  return [data.data[i], data.data[i + 1], data.data[i + 2]]
}

function maxDiff(a: Rgb, b: Rgb): number {
  return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]))
}

function luminance(color: Rgb): number {
  return 0.2126 * color[0] + 0.7152 * color[1] + 0.0722 * color[2]
}

export function sampleRing(
  data: PixelBuffer,
  rect: Rect,
  templateWidth: number,
  templateHeight: number,
): { color: Rgb; stdDev: number } {
  const scaleX = data.width / Math.max(1, templateWidth)
  const scaleY = data.height / Math.max(1, templateHeight)
  const band = Math.max(
    4,
    Math.round(Math.min(rect.w * scaleX, rect.h * scaleY) * 0.06),
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
  let n = 0
  let lumSum = 0
  let lumSqSum = 0
  for (let y = top; y <= bottom; y += 1) {
    for (let x = left; x <= right; x += 1) {
      if (x >= innerLeft && x <= innerRight && y >= innerTop && y <= innerBottom) continue
      const i = (y * data.width + x) * 4
      if (data.data[i + 3] <= 8) continue
      const cr = data.data[i]
      const cg = data.data[i + 1]
      const cb = data.data[i + 2]
      r += cr
      g += cg
      b += cb
      const lum = luminance([cr, cg, cb])
      lumSum += lum
      lumSqSum += lum * lum
      n += 1
    }
  }

  if (n === 0) return { color: [0, 0, 0], stdDev: 0 }
  const color: Rgb = [r / n, g / n, b / n]
  const lumMean = lumSum / n
  const variance = Math.max(0, lumSqSum / n - lumMean * lumMean)
  return { color, stdDev: Math.sqrt(variance) }
}

export function sampleCenter(
  data: PixelBuffer,
  rect: Rect,
  templateWidth: number,
  templateHeight: number,
  insetRatio = 0.3,
): Rgb {
  const scaleX = data.width / Math.max(1, templateWidth)
  const scaleY = data.height / Math.max(1, templateHeight)
  const insetX = rect.w * insetRatio
  const insetY = rect.h * insetRatio
  const left = Math.max(0, Math.floor((rect.x + insetX) * scaleX))
  const right = Math.min(data.width - 1, Math.ceil((rect.x + rect.w - insetX) * scaleX))
  const top = Math.max(0, Math.floor((rect.y + insetY) * scaleY))
  const bottom = Math.min(data.height - 1, Math.ceil((rect.y + rect.h - insetY) * scaleY))

  let r = 0
  let g = 0
  let b = 0
  let n = 0
  for (let y = top; y <= bottom; y += 1) {
    for (let x = left; x <= right; x += 1) {
      const i = (y * data.width + x) * 4
      if (data.data[i + 3] <= 8) continue
      r += data.data[i]
      g += data.data[i + 1]
      b += data.data[i + 2]
      n += 1
    }
  }
  if (n === 0) return [0, 0, 0]
  return [r / n, g / n, b / n]
}

function resolveSource(
  requested: AutoMaskSource,
  ringStdDev: number,
): 'surround' | 'center' {
  if (requested !== 'auto') return requested
  return ringStdDev <= 22 ? 'surround' : 'center'
}

export function keepMainComponent(
  alpha: Uint8ClampedArray,
  width: number,
  height: number,
): number {
  const total = width * height
  if (total === 0) return 0

  const labels = new Int32Array(total).fill(-1)
  const stack = new Int32Array(total)
  const counts: number[] = []
  const center = Math.floor(height / 2) * width + Math.floor(width / 2)
  const centerLabels: boolean[] = []

  let label = 0
  for (let start = 0; start < total; start += 1) {
    if (alpha[start] === 0 || labels[start] !== -1) continue
    let sp = 0
    stack[sp++] = start
    labels[start] = label
    let count = 0
    let touchesCenter = false
    while (sp > 0) {
      const p = stack[--sp]
      count += 1
      if (p === center) touchesCenter = true
      const x = p % width
      const y = (p / width) | 0
      if (x > 0) {
        const n = p - 1
        if (alpha[n] > 0 && labels[n] === -1) {
          labels[n] = label
          stack[sp++] = n
        }
      }
      if (x < width - 1) {
        const n = p + 1
        if (alpha[n] > 0 && labels[n] === -1) {
          labels[n] = label
          stack[sp++] = n
        }
      }
      if (y > 0) {
        const n = p - width
        if (alpha[n] > 0 && labels[n] === -1) {
          labels[n] = label
          stack[sp++] = n
        }
      }
      if (y < height - 1) {
        const n = p + width
        if (alpha[n] > 0 && labels[n] === -1) {
          labels[n] = label
          stack[sp++] = n
        }
      }
    }
    counts.push(count)
    centerLabels.push(touchesCenter)
    label += 1
  }

  if (counts.length === 0) return 0

  const minimumPreferred = Math.max(32, total * 0.005)
  let chosen = -1
  for (let i = 0; i < counts.length; i += 1) {
    if (centerLabels[i] && counts[i] >= minimumPreferred) {
      chosen = i
      break
    }
  }
  if (chosen === -1) {
    let best = -1
    for (let i = 0; i < counts.length; i += 1) {
      if (counts[i] > best) {
        best = counts[i]
        chosen = i
      }
    }
  }

  for (let i = 0; i < total; i += 1) {
    alpha[i] = labels[i] === chosen ? 255 : 0
  }
  return counts[chosen] ?? 0
}

export function buildAutoAlpha(
  data: PixelBuffer,
  rect: Rect,
  templateWidth: number,
  templateHeight: number,
  outWidth: number,
  outHeight: number,
  settings: MaskSettings,
): AutoMaskResult {
  const width = Math.max(1, Math.round(outWidth))
  const height = Math.max(1, Math.round(outHeight))
  const alpha = new Uint8ClampedArray(width * height)

  const maxInset = Math.max(0, Math.min(rect.w, rect.h) / 2 - 0.5)
  const inset = clamp(settings.inset, 0, maxInset)
  const inner: Rect = {
    x: rect.x + inset,
    y: rect.y + inset,
    w: Math.max(1, rect.w - inset * 2),
    h: Math.max(1, rect.h - inset * 2),
  }

  const ring = sampleRing(data, rect, templateWidth, templateHeight)
  const centerColor = sampleCenter(data, rect, templateWidth, templateHeight)
  const source = resolveSource(settings.autoSource, ring.stdDev)

  const scaleX = data.width / Math.max(1, templateWidth)
  const scaleY = data.height / Math.max(1, templateHeight)
  const tolerance = clamp(settings.tolerance, 0, 255)

  for (let oy = 0; oy < height; oy += 1) {
    const ty = inner.y + ((oy + 0.5) / height) * inner.h
    const by = clamp(Math.round(ty * scaleY), 0, data.height - 1)
    for (let ox = 0; ox < width; ox += 1) {
      const tx = inner.x + ((ox + 0.5) / width) * inner.w
      const bx = clamp(Math.round(tx * scaleX), 0, data.width - 1)
      const color = colorAt(data, bx, by)
      const diff = maxDiff(color, source === 'center' ? centerColor : ring.color)
      const inside = source === 'center' ? diff <= tolerance : diff > tolerance
      alpha[oy * width + ox] = inside ? 255 : 0
    }
  }

  const kept = keepMainComponent(alpha, width, height)
  return {
    alpha,
    stats: {
      source,
      ringColor: ring.color,
      centerColor,
      ringStdDev: ring.stdDev,
      coverage: kept / (width * height),
    },
  }
}

function topRowOffset(
  alpha: Uint8ClampedArray,
  width: number,
  bbox: Rect,
): number {
  for (let y = bbox.y; y < bbox.y + bbox.h; y += 1) {
    for (let x = bbox.x; x < bbox.x + bbox.w; x += 1) {
      if (alpha[y * width + x] > 0) return x - bbox.x
    }
  }
  return 0
}

function leftColumnOffset(
  alpha: Uint8ClampedArray,
  width: number,
  height: number,
  bbox: Rect,
): number {
  for (let x = bbox.x; x < bbox.x + bbox.w; x += 1) {
    for (let y = bbox.y; y < bbox.y + bbox.h && y < height; y += 1) {
      if (alpha[y * width + x] > 0) return y - bbox.y
    }
  }
  return 0
}

function radiusFromEdgeOffset(offset: number): number {
  if (offset <= 1) return 0
  const root = (1 + Math.sqrt(1 + 4 * offset)) / 2
  return root * root
}

export function estimateRoundedBevel(
  alpha: Uint8ClampedArray,
  width: number,
  height: number,
): BevelEstimate {
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  let inside = 0
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (alpha[y * width + x] === 0) continue
      inside += 1
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }

  if (maxX < 0 || maxY < 0) {
    return {
      bbox: { x: 0, y: 0, w: 0, h: 0 },
      radius: 0,
      inset: 0,
      coverage: 0,
      rounded: false,
    }
  }

  const bbox: Rect = {
    x: minX,
    y: minY,
    w: maxX - minX + 1,
    h: maxY - minY + 1,
  }
  const rowRadius = radiusFromEdgeOffset(topRowOffset(alpha, width, bbox))
  const colRadius = radiusFromEdgeOffset(leftColumnOffset(alpha, width, height, bbox))
  const radius = Math.round(
    clamp((rowRadius + colRadius) / 2, 0, Math.min(bbox.w, bbox.h) / 2),
  )
  const inset = Math.max(
    0,
    Math.min(bbox.x, bbox.y, width - (bbox.x + bbox.w), height - (bbox.y + bbox.h)),
  )

  return {
    bbox,
    radius,
    inset,
    coverage: inside / (width * height),
    rounded: radius >= 2,
  }
}
