import { describe, expect, it } from 'vitest'
import { detectTrim, type PixelBuffer } from './trim'

function makeBuffer(
  width: number,
  height: number,
  paint: (x: number, y: number) => [number, number, number, number],
): PixelBuffer {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b, a] = paint(x, y)
      const i = (y * width + x) * 4
      data[i] = r
      data[i + 1] = g
      data[i + 2] = b
      data[i + 3] = a
    }
  }
  return { width, height, data }
}

describe('detectTrim', () => {
  it('removes a uniform white border', () => {
    const buffer = makeBuffer(20, 20, (x, y) => {
      const inside = x >= 5 && x <= 14 && y >= 5 && y <= 14
      return inside ? [220, 30, 30, 255] : [255, 255, 255, 255]
    })
    const result = detectTrim(buffer, { threshold: 10, color: 'auto' })
    expect(result.changed).toBe(true)
    expect(result.rect).toEqual({ x: 5, y: 5, w: 10, h: 10 })
  })

  it('removes a uniform black border when requested', () => {
    const buffer = makeBuffer(20, 20, (x, y) => {
      const inside = x >= 4 && x <= 15 && y >= 6 && y <= 15
      return inside ? [40, 180, 90, 255] : [2, 2, 2, 255]
    })
    const result = detectTrim(buffer, { threshold: 12, color: 'black' })
    expect(result.rect).toEqual({ x: 4, y: 6, w: 12, h: 10 })
  })

  it('does not trim an image that has no uniform border', () => {
    const buffer = makeBuffer(20, 20, (x, y) => [x * 12, y * 12, 128, 255])
    const result = detectTrim(buffer, { threshold: 8, color: 'auto' })
    expect(result.changed).toBe(false)
    expect(result.rect).toEqual({ x: 0, y: 0, w: 20, h: 20 })
  })

  it('falls back to the full image when the border eats the whole image', () => {
    const buffer = makeBuffer(20, 20, () => [255, 255, 255, 255])
    const result = detectTrim(buffer, { threshold: 10, color: 'white' })
    expect(result.changed).toBe(false)
    expect(result.rect).toEqual({ x: 0, y: 0, w: 20, h: 20 })
  })
})
