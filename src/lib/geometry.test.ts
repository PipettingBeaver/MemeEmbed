import { describe, expect, it } from 'vitest'
import {
  clampRect,
  computeContainDest,
  computeCoverSource,
  destFor,
  hitCorner,
  hitHandle,
  isAxisAlignedQuad,
  normalizeRect,
  pointInPolygon,
  pointInRect,
  pointsBBox,
  quadArea,
  rectCorners,
  rectFromPoints,
  resizeRect,
  sortQuadPoints,
  sourceCropFor,
} from './geometry'

describe('rectFromPoints', () => {
  it('builds an axis-aligned rectangle from four unordered points', () => {
    const rect = rectFromPoints([
      { x: 200, y: 800 },
      { x: 580, y: 800 },
      { x: 580, y: 1140 },
      { x: 200, y: 1140 },
    ])
    expect(rect).toEqual({ x: 200, y: 800, w: 380, h: 340 })
  })

  it('handles points with negative span', () => {
    const rect = normalizeRect({ x: 10, y: 10, w: -5, h: -20 })
    expect(rect).toEqual({ x: 5, y: -10, w: 5, h: 20 })
  })
})

describe('clampRect', () => {
  it('keeps the rectangle inside the image and enforces a minimum size', () => {
    expect(clampRect({ x: -50, y: -50, w: 380, h: 340 }, 1080, 1217)).toEqual({
      x: 0,
      y: 0,
      w: 380,
      h: 340,
    })
    expect(clampRect({ x: 1000, y: 1200, w: 380, h: 340 }, 1080, 1217)).toEqual({
      x: 700,
      y: 877,
      w: 380,
      h: 340,
    })
    expect(clampRect({ x: 5, y: 5, w: 1, h: 1 }, 1080, 1217, 12)).toEqual({
      x: 5,
      y: 5,
      w: 12,
      h: 12,
    })
  })
})

describe('handle hit testing', () => {
  const rect = { x: 200, y: 800, w: 380, h: 340 }

  it('finds a corner handle', () => {
    expect(hitHandle({ x: 204, y: 803 }, rect, 12)).toBe('nw')
    expect(hitHandle({ x: 576, y: 1136 }, rect, 12)).toBe('se')
  })

  it('does not report a handle far from an edge', () => {
    expect(hitHandle({ x: 390, y: 970 }, rect, 12)).toBeNull()
  })

  it('detects a point inside the rectangle', () => {
    expect(pointInRect({ x: 390, y: 970 }, rect)).toBe(true)
    expect(pointInRect({ x: 190, y: 970 }, rect)).toBe(false)
  })
})

describe('resizeRect', () => {
  const rect = { x: 0, y: 0, w: 100, h: 100 }

  it('resizes from the south-east corner', () => {
    expect(resizeRect(rect, 'se', { x: 150, y: 150 })).toEqual({
      x: 0,
      y: 0,
      w: 150,
      h: 150,
    })
  })

  it('resizes from the north-west corner', () => {
    expect(resizeRect(rect, 'nw', { x: 50, y: 50 })).toEqual({
      x: 50,
      y: 50,
      w: 50,
      h: 50,
    })
  })

  it('enforces the minimum size', () => {
    expect(resizeRect(rect, 'se', { x: -50, y: -50 }, 12)).toEqual({
      x: 0,
      y: 0,
      w: 12,
      h: 12,
    })
  })
})

describe('quad geometry', () => {
  const quad = [
    { x: 50, y: 50 },
    { x: 150, y: 60 },
    { x: 140, y: 150 },
    { x: 60, y: 140 },
  ]

  it('derives a bounding box from four points', () => {
    expect(pointsBBox(quad)).toEqual({ x: 50, y: 50, w: 100, h: 100 })
  })

  it('computes the quad area', () => {
    expect(quadArea(quad)).toBeGreaterThan(8000)
    expect(quadArea(quad)).toBeLessThan(9000)
  })

  it('recognizes a rectangle as axis aligned', () => {
    const rect = { x: 10, y: 20, w: 40, h: 30 }
    expect(isAxisAlignedQuad(rect, rectCorners(rect))).toBe(true)
    expect(isAxisAlignedQuad(rect, quad)).toBe(false)
  })

  it('sorts shuffled corners into top-left/top-right/bottom-right/bottom-left order', () => {
    const shuffled = [quad[2], quad[0], quad[3], quad[1]]
    expect(sortQuadPoints(shuffled)).toEqual(quad)
  })

  it('hit tests corners', () => {
    expect(hitCorner({ x: 52, y: 53 }, quad, 8)).toBe(0)
    expect(hitCorner({ x: 141, y: 149 }, quad, 8)).toBe(2)
    expect(hitCorner({ x: 100, y: 100 }, quad, 8)).toBeNull()
  })

  it('hit tests the polygon interior', () => {
    expect(pointInPolygon({ x: 100, y: 100 }, quad)).toBe(true)
    expect(pointInPolygon({ x: 145, y: 55 }, quad)).toBe(false)
    expect(pointInPolygon({ x: 20, y: 20 }, quad)).toBe(false)
  })
})

describe('cover and contain math', () => {
  it('crops a wide source to a square destination', () => {
    expect(computeCoverSource(100, 50, 100, 100)).toEqual({
      sx: 25,
      sy: 0,
      sw: 50,
      sh: 50,
    })
  })

  it('letterboxes a wide source into a square destination', () => {
    expect(computeContainDest(100, 50, 100, 100)).toEqual({
      dx: 0,
      dy: 25,
      dw: 100,
      dh: 50,
    })
  })

  it('uses the full source for contain and stretch', () => {
    expect(sourceCropFor('contain', 100, 50, 100, 100)).toEqual({
      sx: 0,
      sy: 0,
      sw: 100,
      sh: 50,
    })
    expect(destFor('stretch', 100, 50, 100, 100)).toEqual({
      dx: 0,
      dy: 0,
      dw: 100,
      dh: 100,
    })
  })
})
