import {
  isAxisAlignedQuad,
  pointsBBox,
  quadArea,
  sortQuadPoints,
} from './geometry'
import {
  buildAutoAlpha,
  estimateRoundedBevel,
  keepMainComponent,
  maskOrientedRectangle,
} from './mask'
import type { PixelBuffer } from './trim'
import type { MaskSettings, Point, Rect, Slot } from './types'
import { applyHomography, homographyFromRectToQuad } from './warp'

const MAX_ANALYSIS = 1024

export interface CutoutFit {
  corners: Point[]
  rect: Rect
  axisAligned: boolean
  coverage: number
  source: string
  maskAlpha: Uint8ClampedArray
  maskWidth: number
  maskHeight: number
  search: Rect
}

function erodeMask(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  iterations: number,
): Uint8ClampedArray {
  let current = source
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const next = new Uint8ClampedArray(width * height)
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = y * width + x
        if (current[index] === 0) continue
        const left = x > 0 ? current[index - 1] : 0
        const right = x < width - 1 ? current[index + 1] : 0
        const up = y > 0 ? current[index - width] : 0
        const down = y < height - 1 ? current[index + width] : 0
        next[index] = left && right && up && down ? 255 : 0
      }
    }
    current = next
  }
  return current
}

function averageCornerDistance(a: Point[], b: Point[]): number {
  let total = 0
  for (let i = 0; i < 4; i += 1) {
    total += Math.hypot(a[i].x - b[i].x, a[i].y - b[i].y)
  }
  return total / 4
}

export interface BevelSuggestion {
  fit: CutoutFit
  plausible: boolean
  radius: number
  inset: number
  radiusGuess: number
  coverage: number
  source: string
  usedExisting: boolean
}

function autoProbe(slot: Slot): MaskSettings {
  return { ...slot.mask, mode: 'auto', inset: 0 }
}

/**
 * Traces the cutout inside an expanded region around the slot and returns the
 * minimum-area oriented rectangle that encloses it. The rectangle corners are
 * in template coordinates, so an askew cutout produces an askew quad.
 */
export function fitCutout(
  data: PixelBuffer,
  slot: Slot,
  templateWidth: number,
  templateHeight: number,
  marginRatio = 0.2,
): CutoutFit | null {
  const margin = Math.max(
    32,
    Math.round(Math.max(slot.rect.w, slot.rect.h) * marginRatio),
  )
  const search: Rect = {
    x: Math.max(0, slot.rect.x - margin),
    y: Math.max(0, slot.rect.y - margin),
    w: 0,
    h: 0,
  }
  search.w = Math.min(templateWidth - search.x, slot.rect.w + margin * 2)
  search.h = Math.min(templateHeight - search.y, slot.rect.h + margin * 2)

  const outWidth = Math.max(1, Math.round(search.w))
  const outHeight = Math.max(1, Math.round(search.h))
  const analysisScale = Math.min(1, MAX_ANALYSIS / Math.max(outWidth, outHeight))
  const analysisWidth = Math.max(1, Math.round(outWidth * analysisScale))
  const analysisHeight = Math.max(1, Math.round(outHeight * analysisScale))
  const result = buildAutoAlpha(
    data,
    search,
    templateWidth,
    templateHeight,
    analysisWidth,
    analysisHeight,
    autoProbe(slot),
  )

  const oriented = maskOrientedRectangle(result.alpha, analysisWidth, analysisHeight)
  if (!oriented) return null

  const scaleX = search.w / analysisWidth
  const scaleY = search.h / analysisHeight
  const corners = sortQuadPoints(
    oriented.corners.map((point) => ({
      x: Math.min(
        Math.max(0, search.x + point.x * scaleX),
        templateWidth,
      ),
      y: Math.min(
        Math.max(0, search.y + point.y * scaleY),
        templateHeight,
      ),
    })),
  )
  if (quadArea(corners) < 64) return null

  const bbox = pointsBBox(corners)
  const rect: Rect = {
    x: bbox.x,
    y: bbox.y,
    w: Math.max(1, bbox.w),
    h: Math.max(1, bbox.h),
  }

  return {
    corners,
    rect,
    axisAligned: isAxisAlignedQuad(rect, corners, 1.5),
    coverage: result.stats.coverage,
    source: result.stats.source,
    maskAlpha: result.alpha,
    maskWidth: analysisWidth,
    maskHeight: analysisHeight,
    search,
  }
}

/**
 * Fits the slot to the cutout first, then checks whether the cutout can be
 * represented by a reliable rounded bevel. When it cannot, the caller should
 * fall back to the traced mask as the bevel.
 */
export function suggestBevel(
  data: PixelBuffer,
  slot: Slot,
  templateWidth: number,
  templateHeight: number,
): BevelSuggestion | null {
  const fitted = fitCutout(data, slot, templateWidth, templateHeight)
  if (!fitted) return null

  let geometry = fitted
  let usedExisting = false
  if (
    slot.shape === 'quad' &&
    slot.points &&
    slot.points.length === 4 &&
    averageCornerDistance(slot.points, fitted.corners) <=
      Math.max(8, Math.min(fitted.rect.w, fitted.rect.h) * 0.04)
  ) {
    geometry = {
      ...fitted,
      corners: slot.points,
      rect: slot.rect,
      axisAligned: isAxisAlignedQuad(slot.rect, slot.points, 1.5),
    }
    usedExisting = true
  }

  const matrix = homographyFromRectToQuad(
    geometry.rect.w,
    geometry.rect.h,
    geometry.corners,
  )
  if (!matrix) return null

  const localScale = Math.min(
    1,
    512 / Math.max(geometry.rect.w, geometry.rect.h),
  )
  const localWidth = Math.max(1, Math.round(geometry.rect.w * localScale))
  const localHeight = Math.max(1, Math.round(geometry.rect.h * localScale))
  const local = new Uint8ClampedArray(localWidth * localHeight)
  const { search, maskAlpha, maskWidth, maskHeight } = fitted

  for (let y = 0; y < localHeight; y += 1) {
    for (let x = 0; x < localWidth; x += 1) {
      const point = applyHomography(
        matrix,
        ((x + 0.5) / localWidth) * geometry.rect.w,
        ((y + 0.5) / localHeight) * geometry.rect.h,
      )
      const ax = Math.round(((point.x - search.x) / search.w) * maskWidth)
      const ay = Math.round(((point.y - search.y) / search.h) * maskHeight)
      if (ax < 0 || ay < 0 || ax >= maskWidth || ay >= maskHeight) continue
      local[y * localWidth + x] = maskAlpha[ay * maskWidth + ax]
    }
  }

  keepMainComponent(local, localWidth, localHeight)
  const eroded = erodeMask(local, localWidth, localHeight, 1)
  keepMainComponent(eroded, localWidth, localHeight)
  const estimate = estimateRoundedBevel(eroded, localWidth, localHeight)
  const scale =
    (geometry.rect.w / localWidth + geometry.rect.h / localHeight) / 2
  const minSide = Math.min(geometry.rect.w, geometry.rect.h)
  const plausible =
    estimate.rounded &&
    estimate.radius > 0 &&
    estimate.radius <= minSide * 0.3 &&
    estimate.coverage > 0.03

  return {
    fit: geometry,
    plausible,
    radius: Math.max(1, Math.round(estimate.radius * scale)),
    inset: Math.max(0, Math.round(estimate.inset * scale)),
    radiusGuess: estimate.radius,
    coverage: estimate.coverage,
    source: fitted.source,
    usedExisting,
  }
}
