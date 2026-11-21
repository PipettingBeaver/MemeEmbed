import type { Rect, TrimColorMode } from './types'

export interface PixelBuffer {
  width: number
  height: number
  data: Uint8ClampedArray
}

export interface TrimOptions {
  threshold: number
  color: TrimColorMode
}

export interface TrimResult {
  rect: Rect
  color: [number, number, number]
  changed: boolean
}

function perimeterColor(buffer: PixelBuffer): [number, number, number] {
  const { width, height, data } = buffer
  let r = 0
  let g = 0
  let b = 0
  let n = 0
  const add = (x: number, y: number) => {
    const i = (y * width + x) * 4
    if (data[i + 3] <= 8) return
    r += data[i]
    g += data[i + 1]
    b += data[i + 2]
    n += 1
  }
  for (let x = 0; x < width; x += 1) {
    add(x, 0)
    add(x, height - 1)
  }
  for (let y = 0; y < height; y += 1) {
    add(0, y)
    add(width - 1, y)
  }
  if (n === 0) return [255, 255, 255]
  return [r / n, g / n, b / n]
}

export function detectTrim(buffer: PixelBuffer, options: TrimOptions): TrimResult {
  const { width, height, data } = buffer
  const fallback: TrimResult = {
    rect: { x: 0, y: 0, w: width, h: height },
    color: [0, 0, 0],
    changed: false,
  }
  if (width < 2 || height < 2) return fallback

  const threshold = Math.min(255, Math.max(0, options.threshold))
  const baseColor =
    options.color === 'auto'
      ? perimeterColor(buffer)
      : options.color === 'white'
        ? ([255, 255, 255] as [number, number, number])
        : ([0, 0, 0] as [number, number, number])

  const isBorder = (x: number, y: number): boolean => {
    const i = (y * width + x) * 4
    if (data[i + 3] <= 8) return true
    return (
      Math.abs(data[i] - baseColor[0]) <= threshold &&
      Math.abs(data[i + 1] - baseColor[1]) <= threshold &&
      Math.abs(data[i + 2] - baseColor[2]) <= threshold
    )
  }

  let top = 0
  let bottom = height - 1
  let left = 0
  let right = width - 1

  const rowIsBorder = (y: number): boolean => {
    for (let x = left; x <= right; x += 1) {
      if (!isBorder(x, y)) return false
    }
    return true
  }
  const colIsBorder = (x: number): boolean => {
    for (let y = top; y <= bottom; y += 1) {
      if (!isBorder(x, y)) return false
    }
    return true
  }

  while (top < bottom && rowIsBorder(top)) top += 1
  while (bottom > top && rowIsBorder(bottom)) bottom -= 1
  while (left < right && colIsBorder(left)) left += 1
  while (right > left && colIsBorder(right)) right -= 1

  const rect: Rect = {
    x: left,
    y: top,
    w: right - left + 1,
    h: bottom - top + 1,
  }

  if (rect.w <= width * 0.05 || rect.h <= height * 0.05) {
    return { ...fallback, color: baseColor }
  }

  const changed = rect.x !== 0 || rect.y !== 0 || rect.w !== width || rect.h !== height
  return { rect, color: baseColor, changed }
}
