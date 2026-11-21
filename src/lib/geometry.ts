import type { Point, Rect } from './types'

export type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

export type Corner = 0 | 1 | 2 | 3

export function rectCorners(rect: Rect): [Point, Point, Point, Point] {
  const { x, y, w, h } = rect
  return [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ]
}

export function pointsBBox(points: Point[]): Rect {
  if (points.length === 0) return { x: 0, y: 0, w: 0, h: 0 }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const point of points) {
    if (point.x < minX) minX = point.x
    if (point.x > maxX) maxX = point.x
    if (point.y < minY) minY = point.y
    if (point.y > maxY) maxY = point.y
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

export function clampPoint(point: Point, width: number, height: number): Point {
  return {
    x: Math.min(Math.max(0, point.x), width),
    y: Math.min(Math.max(0, point.y), height),
  }
}

export function pointInPolygon(point: Point, polygon: Point[]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i]
    const b = polygon[j]
    const intersects =
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y || 1e-9) + a.x
    if (intersects) inside = !inside
  }
  return inside
}

export function hitCorner(point: Point, points: Point[], tolerance: number): Corner | null {
  for (let i = 0; i < points.length && i < 4; i += 1) {
    const corner = points[i]
    if (Math.abs(point.x - corner.x) <= tolerance && Math.abs(point.y - corner.y) <= tolerance) {
      return i as Corner
    }
  }
  return null
}

export function polygonCentroid(points: Point[]): Point {
  if (points.length === 0) return { x: 0, y: 0 }
  let x = 0
  let y = 0
  for (const point of points) {
    x += point.x
    y += point.y
  }
  return { x: x / points.length, y: y / points.length }
}

export function sortQuadPoints(points: Point[]): Point[] {
  if (points.length !== 4) return points.map((point) => ({ ...point }))
  const center = polygonCentroid(points)
  const sorted = points
    .map((point) => ({ ...point }))
    .sort(
      (a, b) =>
        Math.atan2(a.y - center.y, a.x - center.x) -
        Math.atan2(b.y - center.y, b.x - center.x),
    )
  let start = 0
  let best = Infinity
  for (let i = 0; i < sorted.length; i += 1) {
    const score = sorted[i].x + sorted[i].y
    if (score < best) {
      best = score
      start = i
    }
  }
  return [...sorted.slice(start), ...sorted.slice(0, start)]
}

export function quadArea(points: Point[]): number {
  if (points.length < 3) return 0
  let area = 0
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    area += a.x * b.y - b.x * a.y
  }
  return Math.abs(area / 2)
}

export function isAxisAlignedQuad(rect: Rect, points: Point[], epsilon = 0.5): boolean {
  if (points.length !== 4) return false
  const corners = rectCorners(rect)
  return points.every(
    (point, index) =>
      Math.abs(point.x - corners[index].x) <= epsilon &&
      Math.abs(point.y - corners[index].y) <= epsilon,
  )
}

export function roundedRectOutlinePoints(
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  cornerSegments = 10,
): Point[] {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2))
  const points: Point[] = []
  const push = (px: number, py: number) => points.push({ x: px, y: py })

  push(x + r, y)
  push(x + width - r, y)
  for (let i = 1; i <= cornerSegments; i += 1) {
    const angle = -Math.PI / 2 + (Math.PI / 2) * (i / cornerSegments)
    push(x + width - r + Math.cos(angle) * r, y + r + Math.sin(angle) * r)
  }
  push(x + width, y + height - r)
  for (let i = 1; i <= cornerSegments; i += 1) {
    const angle = (Math.PI / 2) * (i / cornerSegments)
    push(x + width - r + Math.cos(angle) * r, y + height - r + Math.sin(angle) * r)
  }
  push(x + r, y + height)
  for (let i = 1; i <= cornerSegments; i += 1) {
    const angle = Math.PI / 2 + (Math.PI / 2) * (i / cornerSegments)
    push(x + r + Math.cos(angle) * r, y + height - r + Math.sin(angle) * r)
  }
  push(x, y + r)
  for (let i = 1; i <= cornerSegments; i += 1) {
    const angle = Math.PI + (Math.PI / 2) * (i / cornerSegments)
    push(x + r + Math.cos(angle) * r, y + r + Math.sin(angle) * r)
  }
  push(x + r, y)
  return points
}

const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

export function rectFromPoints(points: Point[]): Rect {
  if (points.length === 0) return { x: 0, y: 0, w: 0, h: 0 }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of points) {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

export function normalizeRect(rect: Rect): Rect {
  let { x, y, w, h } = rect
  if (w < 0) {
    x += w
    w = -w
  }
  if (h < 0) {
    y += h
    h = -h
  }
  return { x, y, w, h }
}

export function clampRect(rect: Rect, width: number, height: number, minSize = 8): Rect {
  const normalized = normalizeRect(rect)
  const w = Math.min(Math.max(minSize, normalized.w), width)
  const h = Math.min(Math.max(minSize, normalized.h), height)
  const x = Math.min(Math.max(0, normalized.x), Math.max(0, width - w))
  const y = Math.min(Math.max(0, normalized.y), Math.max(0, height - h))
  return { x, y, w, h }
}

export function pointInRect(p: Point, rect: Rect): boolean {
  return p.x >= rect.x && p.x <= rect.x + rect.w && p.y >= rect.y && p.y <= rect.y + rect.h
}

export function handlePoints(rect: Rect): Record<Handle, Point> {
  const { x, y, w, h } = rect
  return {
    nw: { x, y },
    n: { x: x + w / 2, y },
    ne: { x: x + w, y },
    e: { x: x + w, y: y + h / 2 },
    se: { x: x + w, y: y + h },
    s: { x: x + w / 2, y: y + h },
    sw: { x, y: y + h },
    w: { x, y: y + h / 2 },
  }
}

export function hitHandle(p: Point, rect: Rect, tolerance: number): Handle | null {
  const points = handlePoints(rect)
  for (const handle of HANDLES) {
    const hp = points[handle]
    if (Math.abs(p.x - hp.x) <= tolerance && Math.abs(p.y - hp.y) <= tolerance) {
      return handle
    }
  }
  return null
}

export function resizeRect(rect: Rect, handle: Handle, p: Point, minSize = 8): Rect {
  let { x, y, w, h } = normalizeRect(rect)
  const right = x + w
  const bottom = y + h

  if (handle.includes('w')) {
    x = Math.min(p.x, right - minSize)
    w = right - x
  }
  if (handle.includes('e')) {
    w = Math.max(minSize, p.x - x)
  }
  if (handle.includes('n')) {
    y = Math.min(p.y, bottom - minSize)
    h = bottom - y
  }
  if (handle.includes('s')) {
    h = Math.max(minSize, p.y - y)
  }

  return normalizeRect({ x, y, w, h })
}

export interface SourceCrop {
  sx: number
  sy: number
  sw: number
  sh: number
}

export interface DestRect {
  dx: number
  dy: number
  dw: number
  dh: number
}

export function computeCoverSource(
  sourceWidth: number,
  sourceHeight: number,
  destWidth: number,
  destHeight: number,
): SourceCrop {
  if (sourceWidth <= 0 || sourceHeight <= 0 || destWidth <= 0 || destHeight <= 0) {
    return { sx: 0, sy: 0, sw: sourceWidth, sh: sourceHeight }
  }
  const scale = Math.max(destWidth / sourceWidth, destHeight / sourceHeight)
  const sw = destWidth / scale
  const sh = destHeight / scale
  return {
    sx: (sourceWidth - sw) / 2,
    sy: (sourceHeight - sh) / 2,
    sw,
    sh,
  }
}

export function computeCoverDest(
  sourceWidth: number,
  sourceHeight: number,
  destWidth: number,
  destHeight: number,
): DestRect {
  if (sourceWidth <= 0 || sourceHeight <= 0) {
    return { dx: 0, dy: 0, dw: destWidth, dh: destHeight }
  }
  const scale = Math.max(destWidth / sourceWidth, destHeight / sourceHeight)
  const dw = sourceWidth * scale
  const dh = sourceHeight * scale
  return {
    dx: (destWidth - dw) / 2,
    dy: (destHeight - dh) / 2,
    dw,
    dh,
  }
}

export function computeContainDest(
  sourceWidth: number,
  sourceHeight: number,
  destWidth: number,
  destHeight: number,
): DestRect {
  if (sourceWidth <= 0 || sourceHeight <= 0) {
    return { dx: 0, dy: 0, dw: destWidth, dh: destHeight }
  }
  const scale = Math.min(destWidth / sourceWidth, destHeight / sourceHeight)
  const dw = sourceWidth * scale
  const dh = sourceHeight * scale
  return {
    dx: (destWidth - dw) / 2,
    dy: (destHeight - dh) / 2,
    dw,
    dh,
  }
}

export function sourceCropFor(
  fit: 'cover' | 'contain' | 'stretch',
  sourceWidth: number,
  sourceHeight: number,
  destWidth: number,
  destHeight: number,
): SourceCrop {
  if (fit === 'cover') {
    return computeCoverSource(sourceWidth, sourceHeight, destWidth, destHeight)
  }
  return { sx: 0, sy: 0, sw: sourceWidth, sh: sourceHeight }
}

export function destFor(
  fit: 'cover' | 'contain' | 'stretch',
  sourceWidth: number,
  sourceHeight: number,
  destWidth: number,
  destHeight: number,
): DestRect {
  if (fit === 'contain') {
    return computeContainDest(sourceWidth, sourceHeight, destWidth, destHeight)
  }
  return { dx: 0, dy: 0, dw: destWidth, dh: destHeight }
}

export function clampNumber(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}
