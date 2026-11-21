import { createCanvas, loadImage } from '@napi-rs/canvas'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { fitCutout, suggestBevel } from './cutout'
import { defaultSlot } from './defaults'
import type { PixelBuffer } from './trim'
import type { MemeTemplate } from './types'

const presetDir = fileURLToPath(
  new URL('../../public/templates/coraline-dad-looking-at-screen/', import.meta.url),
)

function imageDataToBuffer(image: {
  width: number
  height: number
  data: Uint8ClampedArray
}): PixelBuffer {
  return image as unknown as PixelBuffer
}

describe('cutout fitting', () => {
  it('fits a clean white rounded cutout and derives a rounded bevel', () => {
    const canvas = createCanvas(200, 200)
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#2b4bd8'
    ctx.fillRect(0, 0, 200, 200)
    ctx.fillStyle = '#f7f7f2'
    ctx.beginPath()
    ctx.moveTo(70, 50)
    ctx.arcTo(150, 50, 150, 150, 20)
    ctx.arcTo(150, 150, 50, 150, 20)
    ctx.arcTo(50, 150, 50, 50, 20)
    ctx.arcTo(50, 50, 150, 50, 20)
    ctx.closePath()
    ctx.fill()

    const data = imageDataToBuffer(ctx.getImageData(0, 0, 200, 200))
    const slot = defaultSlot({ x: 40, y: 40, w: 120, h: 120 })

    const fit = fitCutout(data, slot, 200, 200)
    expect(fit).not.toBeNull()
    expect(fit!.axisAligned).toBe(true)
    expect(fit!.rect.x).toBeGreaterThanOrEqual(48)
    expect(fit!.rect.x).toBeLessThanOrEqual(52)
    expect(fit!.rect.y).toBeGreaterThanOrEqual(48)
    expect(fit!.rect.y).toBeLessThanOrEqual(52)
    expect(fit!.rect.w).toBeGreaterThanOrEqual(96)
    expect(fit!.rect.w).toBeLessThanOrEqual(102)

    const suggestion = suggestBevel(data, slot, 200, 200)
    expect(suggestion).not.toBeNull()
    expect(suggestion!.plausible).toBe(true)
    expect(suggestion!.radius).toBeGreaterThanOrEqual(12)
    expect(suggestion!.radius).toBeLessThanOrEqual(30)
  })

  async function coralineData() {
    const base = await loadImage(`${presetDir}base.png`)
    const canvas = createCanvas(base.width, base.height)
    const ctx = canvas.getContext('2d')
    ctx.drawImage(base, 0, 0)
    return imageDataToBuffer(ctx.getImageData(0, 0, base.width, base.height))
  }

  it('fits the Coraline screen as an askew quad and localizes the bevel', async () => {
    const data = await coralineData()
    const slot = defaultSlot({ x: 200, y: 800, w: 380, h: 340 })
    const fit = fitCutout(data, slot, 1080, 1217)
    expect(fit).not.toBeNull()
    expect(fit!.axisAligned).toBe(false)
    expect(fit!.rect.x).toBeGreaterThan(150)
    expect(fit!.rect.x).toBeLessThan(210)
    expect(fit!.rect.y).toBeGreaterThan(740)
    expect(fit!.rect.y).toBeLessThan(810)
    expect(fit!.rect.w).toBeGreaterThan(370)
    expect(fit!.rect.w).toBeLessThan(440)
    expect(fit!.rect.h).toBeGreaterThan(330)
    expect(fit!.rect.h).toBeLessThan(410)

    const suggestion = suggestBevel(data, slot, 1080, 1217)
    expect(suggestion).not.toBeNull()
    expect(suggestion!.plausible).toBe(true)
    expect(suggestion!.radius).toBeGreaterThan(35)
    expect(suggestion!.radius).toBeLessThan(75)
    expect(suggestion!.inset).toBeGreaterThanOrEqual(0)
    expect(suggestion!.inset).toBeLessThanOrEqual(3)
  })

  it('uses the stored preset quad as the closest fit and derives its bevel', async () => {
    const template = JSON.parse(
      readFileSync(`${presetDir}template.json`, 'utf8'),
    ) as MemeTemplate
    const slot = template.slots[0]
    const data = await coralineData()

    const fit = fitCutout(data, slot, template.width, template.height)
    expect(fit).not.toBeNull()
    let averageDistance = 0
    for (let i = 0; i < 4; i += 1) {
      averageDistance += Math.hypot(
        slot.points![i].x - fit!.corners[i].x,
        slot.points![i].y - fit!.corners[i].y,
      )
    }
    expect(averageDistance / 4).toBeLessThan(15)

    const suggestion = suggestBevel(data, slot, template.width, template.height)
    expect(suggestion).not.toBeNull()
    expect(suggestion!.fit.corners).toEqual(slot.points)
    expect(suggestion!.usedExisting).toBe(true)
    expect(suggestion!.plausible).toBe(true)
    expect(suggestion!.radius).toBeGreaterThanOrEqual(30)
    expect(suggestion!.radius).toBeLessThanOrEqual(55)
    expect(suggestion!.inset).toBeGreaterThanOrEqual(0)
    expect(suggestion!.inset).toBeLessThanOrEqual(3)
  })
})
