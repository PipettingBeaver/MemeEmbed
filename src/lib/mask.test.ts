import { describe, expect, it } from 'vitest'
import {
  buildAutoAlpha,
  estimateRoundedBevel,
  keepMainComponent,
  maskOrientedRectangle,
} from './mask'
import type { PixelBuffer } from './trim'
import type { MaskSettings } from './types'

type Rgb = [number, number, number]

function makeBuffer(
  width: number,
  height: number,
  paint: (x: number, y: number) => Rgb,
): PixelBuffer {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = paint(x, y)
      const i = (y * width + x) * 4
      data[i] = r
      data[i + 1] = g
      data[i + 2] = b
      data[i + 3] = 255
    }
  }
  return { width, height, data }
}

function inRoundedRect(
  x: number,
  y: number,
  rx: number,
  ry: number,
  rw: number,
  rh: number,
  radius: number,
): boolean {
  const px = x + 0.5
  const py = y + 0.5
  if (px < rx || px > rx + rw || py < ry || py > ry + rh) return false
  const qx = Math.max(rx + radius - px, 0, px - (rx + rw - radius))
  const qy = Math.max(ry + radius - py, 0, py - (ry + rh - radius))
  return qx * qx + qy * qy <= radius * radius
}

function maskSettings(overrides: Partial<MaskSettings> = {}): MaskSettings {
  return {
    mode: 'auto',
    cornerRadius: 0,
    inset: 0,
    autoSource: 'auto',
    tolerance: 36,
    ...overrides,
  }
}

const RECT = { x: 0, y: 0, w: 60, h: 60 }

describe('buildAutoAlpha', () => {
  it('traces a white cutout and drops disconnected specks', () => {
    const blue: Rgb = [20, 40, 120]
    const white: Rgb = [250, 250, 250]
    const buffer = makeBuffer(60, 60, (x, y) => {
      if (inRoundedRect(x, y, 10, 12, 40, 36, 8)) return white
      if (x >= 55 && x <= 58 && y >= 55 && y <= 58) return white
      return blue
    })

    const result = buildAutoAlpha(
      buffer,
      RECT,
      60,
      60,
      60,
      60,
      maskSettings({ autoSource: 'center', tolerance: 20 }),
    )

    expect(result.stats.source).toBe('center')
    expect(result.stats.coverage).toBeGreaterThan(0.2)
    expect(result.alpha[30 * 60 + 30]).toBe(255)
    expect(result.alpha[2 * 60 + 2]).toBe(0)
    expect(result.alpha[57 * 60 + 57]).toBe(0)

    const estimate = estimateRoundedBevel(result.alpha, 60, 60)
    expect(estimate.rounded).toBe(true)
    expect(estimate.radius).toBeGreaterThanOrEqual(6)
    expect(estimate.radius).toBeLessThanOrEqual(10)
    expect(estimate.bbox.x).toBeGreaterThanOrEqual(9)
    expect(estimate.bbox.y).toBeGreaterThanOrEqual(11)
  })

  it('traces a dark screen against a uniform frame using surround mode', () => {
    const beige: Rgb = [200, 190, 160]
    const dark: Rgb = [20, 25, 25]
    const bright: Rgb = [220, 240, 220]
    const buffer = makeBuffer(100, 100, (x, y) => {
      if (!inRoundedRect(x, y, 30, 30, 40, 40, 6)) return beige
      if (x >= 48 && x <= 52 && y >= 48 && y <= 52) return bright
      return dark
    })

    const result = buildAutoAlpha(
      buffer,
      { x: 25, y: 25, w: 50, h: 50 },
      100,
      100,
      50,
      50,
      maskSettings({ autoSource: 'auto', tolerance: 30 }),
    )

    expect(result.stats.source).toBe('surround')
    expect(result.stats.coverage).toBeGreaterThan(0.3)
    expect(result.alpha[25 * 50 + 25]).toBe(255)
    expect(result.alpha[1 * 50 + 1]).toBe(0)
  })
})

describe('keepMainComponent', () => {
  it('keeps the component containing the center', () => {
    const width = 20
    const height = 20
    const alpha = new Uint8ClampedArray(width * height)
    for (let y = 8; y < 14; y += 1) {
      for (let x = 8; x < 14; x += 1) alpha[y * width + x] = 255
    }
    for (let y = 1; y < 7; y += 1) {
      for (let x = 1; x < 7; x += 1) alpha[y * width + x] = 255
    }
    const kept = keepMainComponent(alpha, width, height)
    expect(kept).toBe(36)
    expect(alpha[10 * width + 10]).toBe(255)
    expect(alpha[3 * width + 3]).toBe(0)
  })
})

describe('maskOrientedRectangle', () => {
  it('returns the axis-aligned bounds for a rectangular mask', () => {
    const width = 40
    const height = 30
    const alpha = new Uint8ClampedArray(width * height)
    for (let y = 5; y < 25; y += 1) {
      for (let x = 8; x < 32; x += 1) alpha[y * width + x] = 255
    }
    const rect = maskOrientedRectangle(alpha, width, height)
    expect(rect).not.toBeNull()
    expect(rect!.area).toBeCloseTo(23 * 19, 0)
    const xs = rect!.corners.map((point) => point.x)
    const ys = rect!.corners.map((point) => point.y)
    expect(Math.min(...xs)).toBeCloseTo(8, 0)
    expect(Math.max(...xs)).toBeCloseTo(31, 0)
    expect(Math.min(...ys)).toBeCloseTo(5, 0)
    expect(Math.max(...ys)).toBeCloseTo(24, 0)
  })

  it('aligns with an askew diamond instead of its axis-aligned bounds', () => {
    const width = 60
    const height = 60
    const alpha = new Uint8ClampedArray(width * height)
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (Math.abs(x - 30) + Math.abs(y - 30) <= 20) alpha[y * width + x] = 255
      }
    }
    const rect = maskOrientedRectangle(alpha, width, height)
    expect(rect).not.toBeNull()
    expect(rect!.area).toBeLessThan(1100)
    expect(rect!.area).toBeGreaterThan(600)
  })

  it('returns null for an empty mask', () => {
    expect(maskOrientedRectangle(new Uint8ClampedArray(100), 10, 10)).toBeNull()
  })
})

describe('estimateRoundedBevel', () => {
  it('reads the radius and inset of a rounded mask', () => {
    const width = 80
    const height = 60
    const alpha = new Uint8ClampedArray(width * height)
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (inRoundedRect(x, y, 10, 8, 60, 44, 12)) {
          alpha[y * width + x] = 255
        }
      }
    }
    const estimate = estimateRoundedBevel(alpha, width, height)
    expect(estimate.rounded).toBe(true)
    expect(estimate.radius).toBeGreaterThanOrEqual(10)
    expect(estimate.radius).toBeLessThanOrEqual(14)
    expect(estimate.inset).toBe(8)
  })

  it('reports a rectangle as unrounded', () => {
    const width = 40
    const height = 30
    const alpha = new Uint8ClampedArray(width * height)
    for (let y = 5; y < 25; y += 1) {
      for (let x = 5; x < 35; x += 1) {
        alpha[y * width + x] = 255
      }
    }
    const estimate = estimateRoundedBevel(alpha, width, height)
    expect(estimate.rounded).toBe(false)
    expect(estimate.radius).toBe(0)
    expect(estimate.inset).toBe(5)
  })
})
