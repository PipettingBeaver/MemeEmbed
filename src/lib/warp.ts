import type { Point } from './types'

export interface Homography {
  a: number
  b: number
  c: number
  d: number
  e: number
  f: number
  g: number
  h: number
}

/**
 * Builds a homography that maps a local rectangle (0,0)-(width,height) onto
 * four points in template space. Point order is top-left, top-right,
 * bottom-right, bottom-left.
 */
export function homographyFromRectToQuad(
  width: number,
  height: number,
  quad: Point[],
): Homography | null {
  if (quad.length !== 4) return null
  const w = Math.max(1, width)
  const h = Math.max(1, height)
  const [p0, p1, p2, p3] = quad

  const dx1 = p1.x - p2.x
  const dx2 = p3.x - p2.x
  const dx3 = p0.x - p1.x + p2.x - p3.x
  const dy1 = p1.y - p2.y
  const dy2 = p3.y - p2.y
  const dy3 = p0.y - p1.y + p2.y - p3.y
  const det = dx1 * dy2 - dx2 * dy1

  let g = 0
  let hh = 0
  if (Math.abs(det) > 1e-9) {
    g = (dx3 * dy2 - dx2 * dy3) / det
    hh = (dx1 * dy3 - dx3 * dy1) / det
  }

  return {
    a: (p1.x - p0.x + g * p1.x) / w,
    b: (p3.x - p0.x + hh * p3.x) / h,
    c: p0.x,
    d: (p1.y - p0.y + g * p1.y) / w,
    e: (p3.y - p0.y + hh * p3.y) / h,
    f: p0.y,
    g: g / w,
    h: hh / h,
  }
}

export function applyHomography(matrix: Homography, x: number, y: number): Point {
  const denominator = matrix.g * x + matrix.h * y + 1
  if (Math.abs(denominator) < 1e-9) return { x: 0, y: 0 }
  return {
    x: (matrix.a * x + matrix.b * y + matrix.c) / denominator,
    y: (matrix.d * x + matrix.e * y + matrix.f) / denominator,
  }
}

interface Affine {
  a: number
  b: number
  c: number
  d: number
  e: number
  f: number
}

function affineFromTriangles(
  s0: Point,
  s1: Point,
  s2: Point,
  d0: Point,
  d1: Point,
  d2: Point,
): Affine | null {
  const sx1 = s1.x - s0.x
  const sy1 = s1.y - s0.y
  const sx2 = s2.x - s0.x
  const sy2 = s2.y - s0.y
  const dx1 = d1.x - d0.x
  const dy1 = d1.y - d0.y
  const dx2 = d2.x - d0.x
  const dy2 = d2.y - d0.y

  const det = sx1 * sy2 - sx2 * sy1
  if (Math.abs(det) < 1e-9) return null

  const a = (dx1 * sy2 - dx2 * sy1) / det
  const c = (dx2 * sx1 - dx1 * sx2) / det
  const b = (dy1 * sy2 - dy2 * sy1) / det
  const d = (dy2 * sx1 - dy1 * sx2) / det

  return {
    a,
    b,
    c,
    d,
    e: d0.x - (a * s0.x + c * s0.y),
    f: d0.y - (b * s0.x + d * s0.y),
  }
}

function expandTriangle(triangle: [Point, Point, Point], amount: number): [Point, Point, Point] {
  const cx = (triangle[0].x + triangle[1].x + triangle[2].x) / 3
  const cy = (triangle[0].y + triangle[1].y + triangle[2].y) / 3
  return triangle.map((point) => {
    const vx = point.x - cx
    const vy = point.y - cy
    const length = Math.hypot(vx, vy) || 1
    return {
      x: point.x + (vx / length) * amount,
      y: point.y + (vy / length) * amount,
    }
  }) as [Point, Point, Point]
}

function drawTexturedTriangle(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  s0: Point,
  s1: Point,
  s2: Point,
  d0: Point,
  d1: Point,
  d2: Point,
): void {
  const affine = affineFromTriangles(s0, s1, s2, d0, d1, d2)
  if (!affine) return

  const expanded = expandTriangle([d0, d1, d2], 1.5)

  ctx.save()
  ctx.beginPath()
  ctx.moveTo(expanded[0].x, expanded[0].y)
  ctx.lineTo(expanded[1].x, expanded[1].y)
  ctx.lineTo(expanded[2].x, expanded[2].y)
  ctx.closePath()
  ctx.clip()
  ctx.transform(affine.a, affine.b, affine.c, affine.d, affine.e, affine.f)

  const minX = Math.max(0, Math.floor(Math.min(s0.x, s1.x, s2.x)) - 2)
  const minY = Math.max(0, Math.floor(Math.min(s0.y, s1.y, s2.y)) - 2)
  const maxX = Math.min(sourceWidth, Math.ceil(Math.max(s0.x, s1.x, s2.x)) + 2)
  const maxY = Math.min(sourceHeight, Math.ceil(Math.max(s0.y, s1.y, s2.y)) + 2)
  const sw = maxX - minX
  const sh = maxY - minY
  if (sw > 0 && sh > 0) {
    ctx.drawImage(source, minX, minY, sw, sh, minX, minY, sw, sh)
  }
  ctx.restore()
}

export function drawWarpedCanvas(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  matrix: Homography,
  gridSize = 12,
): void {
  const grid = Math.max(1, Math.round(gridSize))
  const w = Math.max(1, sourceWidth)
  const h = Math.max(1, sourceHeight)
  const dest: Point[][] = []

  for (let row = 0; row <= grid; row += 1) {
    const line: Point[] = []
    const sy = (row / grid) * h
    for (let col = 0; col <= grid; col += 1) {
      const sx = (col / grid) * w
      line.push(applyHomography(matrix, sx, sy))
    }
    dest.push(line)
  }

  ctx.save()
  ctx.imageSmoothingEnabled = true
  for (let row = 0; row < grid; row += 1) {
    const sy0 = (row / grid) * h
    const sy1 = ((row + 1) / grid) * h
    for (let col = 0; col < grid; col += 1) {
      const sx0 = (col / grid) * w
      const sx1 = ((col + 1) / grid) * w

      const s00 = { x: sx0, y: sy0 }
      const s10 = { x: sx1, y: sy0 }
      const s01 = { x: sx0, y: sy1 }
      const s11 = { x: sx1, y: sy1 }

      const d00 = dest[row][col]
      const d10 = dest[row][col + 1]
      const d01 = dest[row + 1][col]
      const d11 = dest[row + 1][col + 1]

      drawTexturedTriangle(ctx, source, w, h, s00, s10, s11, d00, d10, d11)
      drawTexturedTriangle(ctx, source, w, h, s00, s11, s01, d00, d11, d01)
    }
  }
  ctx.restore()
}
