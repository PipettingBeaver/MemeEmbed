import { readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { MemeTemplate } from './types'

const coralineDir = fileURLToPath(
  new URL('../../public/templates/coraline-dad-looking-at-screen/', import.meta.url),
)
const oldManDir = fileURLToPath(
  new URL('../../public/templates/old-man-looking-at-screen/', import.meta.url),
)
const animeGirlDir = fileURLToPath(
  new URL('../../public/templates/anime-girl-at-computer-screen/', import.meta.url),
)

function pngSize(path: string): { width: number; height: number } {
  const bytes = readFileSync(path)
  const signature = bytes.subarray(0, 8).toString('hex')
  if (signature !== '89504e470d0a1a0a') {
    throw new Error('not a PNG')
  }
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  }
}

describe('Coraline Dad preset', () => {
  const templatePath = `${coralineDir}template.json`
  const template = JSON.parse(readFileSync(templatePath, 'utf8')) as MemeTemplate

  it('is named and sized as expected', () => {
    expect(template.id).toBe('coraline-dad-looking-at-screen')
    expect(template.name).toBe('Coraline Dad Looking at Screen')
    expect(template.width).toBe(1080)
    expect(template.height).toBe(1217)
  })

  it('has a real 1080x1217 base image', () => {
    const basePath = `${coralineDir}${template.baseImageFile}`
    expect(statSync(basePath).isFile()).toBe(true)
    expect(pngSize(basePath)).toEqual({ width: 1080, height: 1217 })
  })

  it('seeds the screen slot as the closest rectangle quad', () => {
    expect(template.slots).toHaveLength(1)
    const slot = template.slots[0]
    expect(slot.id).toBe('screen')
    expect(slot.shape).toBe('quad')
    expect(slot.rect).toEqual({ x: 175, y: 788, w: 409, h: 356 })
    expect(slot.points).toEqual([
      { x: 175, y: 795 },
      { x: 572, y: 788 },
      { x: 584, y: 1122 },
      { x: 195, y: 1144 },
    ])
  })

  it('defaults to a 38px rounded CRT bevel with a 1px inset', () => {
    const mask = template.slots[0].mask
    expect(mask.mode).toBe('rounded')
    expect(mask.cornerRadius).toBe(38)
    expect(mask.inset).toBe(1)
  })

  it('has sane blend defaults', () => {
    const blend = template.slots[0].blend
    expect(blend.trimEdges).toBe(true)
    expect(blend.tint).toBe(true)
    expect(blend.tintStrength).toBeGreaterThanOrEqual(0)
    expect(blend.tintStrength).toBeLessThanOrEqual(100)
    expect(blend.opacity).toBe(100)
  })
})

describe('Old Man Looking at Big TV Screen preset', () => {
  const templatePath = `${oldManDir}template.json`
  const template = JSON.parse(readFileSync(templatePath, 'utf8')) as MemeTemplate

  it('is named, sized, and sourced', () => {
    expect(template.id).toBe('old-man-looking-at-screen')
    expect(template.name).toBe('Old Man Looking at Big TV Screen')
    expect(template.width).toBe(1080)
    expect(template.height).toBe(1420)
    expect(template.sourceUrl).toContain('reddit.com/r/MemeTemplatesOfficial')
  })

  it('has a real 1080x1420 base image', () => {
    const basePath = `${oldManDir}${template.baseImageFile}`
    expect(statSync(basePath).isFile()).toBe(true)
    expect(pngSize(basePath)).toEqual({ width: 1080, height: 1420 })
  })

  it('has the inferred green-screen quad', () => {
    expect(template.slots).toHaveLength(1)
    const slot = template.slots[0]
    expect(slot.shape).toBe('quad')
    expect(slot.rect).toEqual({ x: 477, y: 221, w: 462, h: 504 })
    expect(slot.points).toEqual([
      { x: 477, y: 289 },
      { x: 939, y: 221 },
      { x: 920, y: 725 },
      { x: 497, y: 614 },
    ])
    expect(slot.mask.mode).toBe('rect')
    expect(slot.blend.tint).toBe(false)
  })
})

describe('Anime Girl at Computer Monitor preset', () => {
  const templatePath = `${animeGirlDir}template.json`
  const template = JSON.parse(readFileSync(templatePath, 'utf8')) as MemeTemplate

  it('is named, sized, and sourced', () => {
    expect(template.id).toBe('anime-girl-at-computer-screen')
    expect(template.name).toBe('Anime Girl at Computer Monitor')
    expect(template.width).toBe(500)
    expect(template.height).toBe(500)
    expect(template.sourceUrl).toContain('pinimg.com')
  })

  it('has a real 500x500 base image', () => {
    const basePath = `${animeGirlDir}${template.baseImageFile}`
    expect(statSync(basePath).isFile()).toBe(true)
    expect(pngSize(basePath)).toEqual({ width: 500, height: 500 })
  })

  it('places the screen slot over the monitor in the top-left quadrant', () => {
    expect(template.slots).toHaveLength(1)
    const slot = template.slots[0]
    expect(slot.id).toBe('screen')
    expect(slot.shape).toBe('quad')
    expect(slot.rect).toEqual({ x: 32, y: 64, w: 201, h: 158 })
    expect(slot.points).toHaveLength(4)
    for (const point of slot.points ?? []) {
      expect(point.x).toBeLessThan(template.width / 2)
      expect(point.y).toBeLessThan(template.height / 2)
    }
    expect(slot.mask.mode).toBe('rect')
  })
})
