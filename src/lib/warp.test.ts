import { describe, expect, it } from 'vitest'
import { applyHomography, homographyFromRectToQuad } from './warp'

function expectPoint(actual: { x: number; y: number }, expected: { x: number; y: number }) {
  expect(actual.x).toBeCloseTo(expected.x, 5)
  expect(actual.y).toBeCloseTo(expected.y, 5)
}

describe('homographyFromRectToQuad', () => {
  it('maps the local rectangle corners onto the quad corners', () => {
    const quad = [
      { x: 100, y: 80 },
      { x: 220, y: 60 },
      { x: 240, y: 200 },
      { x: 90, y: 210 },
    ]
    const matrix = homographyFromRectToQuad(100, 50, quad)
    expect(matrix).not.toBeNull()
    if (!matrix) return

    expectPoint(applyHomography(matrix, 0, 0), quad[0])
    expectPoint(applyHomography(matrix, 100, 0), quad[1])
    expectPoint(applyHomography(matrix, 100, 50), quad[2])
    expectPoint(applyHomography(matrix, 0, 50), quad[3])
  })

  it('maps an axis-aligned translated rectangle correctly', () => {
    const quad = [
      { x: 200, y: 800 },
      { x: 300, y: 800 },
      { x: 300, y: 850 },
      { x: 200, y: 850 },
    ]
    const matrix = homographyFromRectToQuad(100, 50, quad)
    expect(matrix).not.toBeNull()
    if (!matrix) return

    expectPoint(applyHomography(matrix, 0, 0), { x: 200, y: 800 })
    expectPoint(applyHomography(matrix, 50, 25), { x: 250, y: 825 })
    expectPoint(applyHomography(matrix, 100, 50), { x: 300, y: 850 })
  })

  it('returns null for a non-quad point list', () => {
    expect(homographyFromRectToQuad(10, 10, [{ x: 0, y: 0 }])).toBeNull()
  })
})
