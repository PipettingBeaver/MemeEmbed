import { createCanvas, loadImage, type Canvas } from '@napi-rs/canvas'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { renderMeme } from './composite'
import { defaultBackfill, defaultBlend, defaultText } from './defaults'
import type { MemeTemplate, Slot } from './types'

const documentShim = {
  createElement(tag: string) {
    if (tag !== 'canvas') throw new Error(`unexpected element: ${tag}`)
    return createCanvas(1, 1)
  },
}

;(globalThis as unknown as { document: typeof documentShim }).document = documentShim

const presetDir = fileURLToPath(
  new URL('../../public/templates/coraline-dad-looking-at-screen/', import.meta.url),
)
const oldManDir = fileURLToPath(
  new URL('../../public/templates/old-man-looking-at-screen/', import.meta.url),
)

function isRed(data: Uint8ClampedArray): boolean {
  return data[0] > 200 && data[1] < 90 && data[2] < 90
}

describe('rounded bevel rendering', () => {
  it('clips the embedded image to the rounded slot and leaves the corners untouched', async () => {
    const template = JSON.parse(
      readFileSync(`${presetDir}template.json`, 'utf8'),
    ) as MemeTemplate
    const slot = template.slots[0]
    slot.shape = 'rect'
    slot.points = undefined
    slot.rect = { x: 200, y: 800, w: 380, h: 340 }
    slot.mask = {
      mode: 'rounded',
      cornerRadius: 22,
      inset: 3,
      autoSource: 'auto',
      tolerance: 36,
    }
    slot.blend = {
      ...slot.blend,
      trimEdges: false,
      tint: false,
      feather: 0,
      blur: 0,
      downscale: 0,
      brightness: 100,
      saturation: 100,
      opacity: 100,
    }

    const base = await loadImage(`${presetDir}base.png`)

    const embedded = createCanvas(64, 64)
    const embeddedCtx = embedded.getContext('2d')
    embeddedCtx.fillStyle = '#ff2d2d'
    embeddedCtx.fillRect(0, 0, 64, 64)

    const canvas = createCanvas(template.width, template.height)
    const ctx = canvas.getContext('2d')
    renderMeme(ctx as unknown as CanvasRenderingContext2D, {
      template,
      baseImage: base as unknown as HTMLImageElement,
      slotImages: { screen: embedded as unknown as HTMLImageElement },
      backfillImages: {},
      showOverlays: false,
    })

    const center = ctx.getImageData(390, 970, 1, 1).data
    const corner = ctx.getImageData(201, 801, 1, 1).data
    const cornerInside = ctx.getImageData(212, 814, 1, 1).data
    const topEdge = ctx.getImageData(390, 806, 1, 1).data

    expect(isRed(center)).toBe(true)
    expect(isRed(topEdge)).toBe(true)
    expect(isRed(cornerInside)).toBe(true)
    expect(isRed(corner)).toBe(false)

    const crop = createCanvas(slot.rect.w, slot.rect.h)
    const cropCtx = crop.getContext('2d')
    cropCtx.drawImage(
      canvas,
      slot.rect.x,
      slot.rect.y,
      slot.rect.w,
      slot.rect.h,
      0,
      0,
      slot.rect.w,
      slot.rect.h,
    )
    writeFileSync('/tmp/memeembed-bevel-crop.png', await crop.encode('png'))
  })

  it('shows the dashed bevel guide inside the selection when an image is attached', async () => {
    const template = JSON.parse(
      readFileSync(`${presetDir}template.json`, 'utf8'),
    ) as MemeTemplate
    const slot = template.slots[0]
    slot.mask = {
      mode: 'rounded',
      cornerRadius: 22,
      inset: 3,
      autoSource: 'auto',
      tolerance: 36,
    }
    slot.blend = {
      ...slot.blend,
      trimEdges: false,
      tint: false,
      feather: 0,
      blur: 0,
      downscale: 0,
      brightness: 100,
      saturation: 100,
      opacity: 100,
    }

    const base = await loadImage(`${presetDir}base.png`)
    const embedded = createCanvas(64, 64)
    const embeddedCtx = embedded.getContext('2d')
    embeddedCtx.fillStyle = '#ff2d2d'
    embeddedCtx.fillRect(0, 0, 64, 64)

    const canvas = createCanvas(template.width, template.height)
    const ctx = canvas.getContext('2d')
    renderMeme(ctx as unknown as CanvasRenderingContext2D, {
      template,
      baseImage: base as unknown as HTMLImageElement,
      slotImages: { screen: embedded as unknown as HTMLImageElement },
      backfillImages: {},
      showOverlays: true,
      selectedSlotId: slot.id,
    })

    const { x, y, w, h } = slot.rect
    const data = ctx.getImageData(x, y, w, h).data
    let amber = 0
    for (let i = 0; i < data.length; i += 4) {
      if (
        data[i] > 180 &&
        data[i + 1] > 150 &&
        data[i + 2] < 170 &&
        data[i + 1] > data[i + 2] + 30
      ) {
        amber += 1
      }
    }
    expect(amber).toBeGreaterThan(100)

    const crop = createCanvas(w, h)
    const cropCtx = crop.getContext('2d')
    cropCtx.drawImage(canvas, x, y, w, h, 0, 0, w, h)
    writeFileSync('/tmp/memeembed-bevel-overlay.png', await crop.encode('png'))
  })

  it('shows the bevel shape on an empty slot before an image is attached', async () => {
    const template = JSON.parse(
      readFileSync(`${presetDir}template.json`, 'utf8'),
    ) as MemeTemplate
    const slot = template.slots[0]
    const base = await loadImage(`${presetDir}base.png`)

    const baseCanvas = createCanvas(template.width, template.height)
    const baseCtx = baseCanvas.getContext('2d')
    baseCtx.drawImage(base, 0, 0)
    const sampleX = 300
    const sampleY = 900
    const before = baseCtx.getImageData(sampleX, sampleY, 1, 1).data

    const canvas = createCanvas(template.width, template.height)
    const ctx = canvas.getContext('2d')
    renderMeme(ctx as unknown as CanvasRenderingContext2D, {
      template,
      baseImage: base as unknown as HTMLImageElement,
      slotImages: {},
      backfillImages: {},
      showOverlays: true,
      selectedSlotId: slot.id,
    })

    const after = ctx.getImageData(sampleX, sampleY, 1, 1).data
    const difference =
      Math.abs(after[0] - before[0]) +
      Math.abs(after[1] - before[1]) +
      Math.abs(after[2] - before[2])
    expect(difference).toBeGreaterThan(15)

    const { x, y, w, h } = slot.rect
    const crop = createCanvas(w, h)
    const cropCtx = crop.getContext('2d')
    cropCtx.drawImage(canvas, x, y, w, h, 0, 0, w, h)
    writeFileSync('/tmp/memeembed-bevel-empty.png', await crop.encode('png'))
  })

  function makeQuadTemplate(): MemeTemplate {
    const slot: Slot = {
      id: 'quad',
      name: 'Quad',
      shape: 'quad',
      rect: { x: 50, y: 50, w: 100, h: 100 },
      points: [
        { x: 50, y: 50 },
        { x: 150, y: 60 },
        { x: 140, y: 150 },
        { x: 60, y: 140 },
      ],
      fit: 'cover',
      imageFile: 'slot.png',
      mask: {
        mode: 'rect',
        cornerRadius: 0,
        inset: 0,
        autoSource: 'auto',
        tolerance: 36,
      },
      backfill: defaultBackfill(),
      blend: {
        ...defaultBlend(),
        trimEdges: false,
        tint: false,
        feather: 0,
        blur: 0,
        downscale: 0,
        brightness: 100,
        saturation: 100,
        opacity: 100,
      },
    }

    return {
      schemaVersion: 1,
      id: 'quad-test',
      name: 'Quad test',
      width: 200,
      height: 200,
      baseImageFile: 'base.png',
      slots: [slot],
      text: { top: defaultText(), bottom: defaultText() },
      createdAt: '',
      updatedAt: '',
    }
  }

  function makeQuadBase() {
    const base = createCanvas(200, 200)
    const ctx = base.getContext('2d')
    ctx.fillStyle = '#2b4bd8'
    ctx.fillRect(0, 0, 200, 200)
    return base
  }

  function makeRedImage() {
    const embedded = createCanvas(64, 64)
    const ctx = embedded.getContext('2d')
    ctx.fillStyle = '#ff2d2d'
    ctx.fillRect(0, 0, 64, 64)
    return embedded
  }

  it('warps an embedded image into a four-point quad', async () => {
    const template = makeQuadTemplate()
    const base = makeQuadBase()
    const embedded = makeRedImage()

    const canvas = createCanvas(200, 200)
    const ctx = canvas.getContext('2d')
    renderMeme(ctx as unknown as CanvasRenderingContext2D, {
      template,
      baseImage: base as unknown as HTMLImageElement,
      slotImages: { quad: embedded as unknown as HTMLImageElement },
      backfillImages: {},
      showOverlays: false,
    })

    expect(isRed(ctx.getImageData(100, 100, 1, 1).data)).toBe(true)
    expect(isRed(ctx.getImageData(100, 130, 1, 1).data)).toBe(true)
    expect(isRed(ctx.getImageData(145, 55, 1, 1).data)).toBe(false)
    expect(isRed(ctx.getImageData(30, 30, 1, 1).data)).toBe(false)

    writeFileSync('/tmp/memeembed-quad.png', await canvas.encode('png'))
  })

  it('draws the bevel guide transformed into the quad', async () => {
    const template = makeQuadTemplate()
    const slot = template.slots[0]
    slot.mask = {
      mode: 'rounded',
      cornerRadius: 10,
      inset: 2,
      autoSource: 'auto',
      tolerance: 36,
    }
    const base = makeQuadBase()
    const embedded = makeRedImage()

    const canvas = createCanvas(200, 200)
    const ctx = canvas.getContext('2d')
    renderMeme(ctx as unknown as CanvasRenderingContext2D, {
      template,
      baseImage: base as unknown as HTMLImageElement,
      slotImages: { quad: embedded as unknown as HTMLImageElement },
      backfillImages: {},
      showOverlays: true,
      selectedSlotId: slot.id,
    })

    const data = ctx.getImageData(50, 50, 100, 100).data
    let amber = 0
    for (let i = 0; i < data.length; i += 4) {
      if (
        data[i] > 180 &&
        data[i + 1] > 150 &&
        data[i + 2] < 170 &&
        data[i + 1] > data[i + 2] + 30
      ) {
        amber += 1
      }
    }
    expect(amber).toBeGreaterThan(50)

    writeFileSync('/tmp/memeembed-quad-bevel.png', await canvas.encode('png'))
  })

  it('renders the Coraline preset quad with its 38px bevel', async () => {
    const template = JSON.parse(
      readFileSync(`${presetDir}template.json`, 'utf8'),
    ) as MemeTemplate
    const slot = template.slots[0]
    slot.blend = {
      ...slot.blend,
      trimEdges: false,
      tint: false,
      feather: 0,
      blur: 0,
      downscale: 0,
      brightness: 100,
      saturation: 100,
      opacity: 100,
    }

    const base = await loadImage(`${presetDir}base.png`)
    const embedded = makeRedImage()
    const canvas = createCanvas(template.width, template.height)
    const ctx = canvas.getContext('2d')
    renderMeme(ctx as unknown as CanvasRenderingContext2D, {
      template,
      baseImage: base as unknown as HTMLImageElement,
      slotImages: { screen: embedded as unknown as HTMLImageElement },
      backfillImages: {},
      showOverlays: false,
    })

    expect(isRed(ctx.getImageData(390, 970, 1, 1).data)).toBe(true)
    expect(isRed(ctx.getImageData(177, 790, 1, 1).data)).toBe(false)

    const crop = createCanvas(slot.rect.w, slot.rect.h)
    const cropCtx = crop.getContext('2d')
    cropCtx.drawImage(
      canvas,
      slot.rect.x,
      slot.rect.y,
      slot.rect.w,
      slot.rect.h,
      0,
      0,
      slot.rect.w,
      slot.rect.h,
    )
    writeFileSync('/tmp/memeembed-coraline-preset.png', await crop.encode('png'))
  })

  it('renders the Old Man green-screen preset through the inferred quad', async () => {
    const template = JSON.parse(
      readFileSync(`${oldManDir}template.json`, 'utf8'),
    ) as MemeTemplate
    const slot = template.slots[0]
    slot.blend = {
      ...slot.blend,
      trimEdges: false,
      tint: false,
      feather: 0,
      blur: 0,
      downscale: 0,
      brightness: 100,
      saturation: 100,
      opacity: 100,
    }

    const base = await loadImage(`${oldManDir}base.png`)
    const embedded = makeRedImage()
    const canvas = createCanvas(template.width, template.height)
    const ctx = canvas.getContext('2d')
    renderMeme(ctx as unknown as CanvasRenderingContext2D, {
      template,
      baseImage: base as unknown as HTMLImageElement,
      slotImages: { screen: embedded as unknown as HTMLImageElement },
      backfillImages: {},
      showOverlays: false,
    })

    expect(isRed(ctx.getImageData(700, 450, 1, 1).data)).toBe(true)
    expect(isRed(ctx.getImageData(400, 400, 1, 1).data)).toBe(false)

    const crop = createCanvas(slot.rect.w, slot.rect.h)
    const cropCtx = crop.getContext('2d')
    cropCtx.drawImage(
      canvas,
      slot.rect.x,
      slot.rect.y,
      slot.rect.w,
      slot.rect.h,
      0,
      0,
      slot.rect.w,
      slot.rect.h,
    )
    writeFileSync('/tmp/memeembed-oldman-preset.png', await crop.encode('png'))
  })

  it('traces a cutout from the base image and composites through it', () => {
    const base = createCanvas(200, 200)
    const baseCtx = base.getContext('2d')
    baseCtx.fillStyle = '#2b4bd8'
    baseCtx.fillRect(0, 0, 200, 200)
    baseCtx.fillStyle = '#f7f7f2'
    baseCtx.beginPath()
    baseCtx.moveTo(70, 50)
    baseCtx.arcTo(150, 50, 150, 150, 20)
    baseCtx.arcTo(150, 150, 50, 150, 20)
    baseCtx.arcTo(50, 150, 50, 50, 20)
    baseCtx.arcTo(50, 50, 150, 50, 20)
    baseCtx.closePath()
    baseCtx.fill()

    const embedded = createCanvas(64, 64)
    const embeddedCtx = embedded.getContext('2d')
    embeddedCtx.fillStyle = '#ff2d2d'
    embeddedCtx.fillRect(0, 0, 64, 64)

    const slot: Slot = {
      id: 'cutout',
      name: 'Cutout',
      shape: 'rect',
      rect: { x: 40, y: 40, w: 120, h: 120 },
      fit: 'cover',
      imageFile: 'slot.png',
      mask: {
        mode: 'auto',
        cornerRadius: 0,
        inset: 0,
        autoSource: 'auto',
        tolerance: 20,
      },
      backfill: defaultBackfill(),
      blend: {
        ...defaultBlend(),
        trimEdges: false,
        tint: false,
        feather: 0,
        blur: 0,
        downscale: 0,
        brightness: 100,
        saturation: 100,
        opacity: 100,
      },
    }

    const template: MemeTemplate = {
      schemaVersion: 1,
      id: 'auto-test',
      name: 'Auto trace test',
      width: 200,
      height: 200,
      baseImageFile: 'base.png',
      slots: [slot],
      text: { top: defaultText(), bottom: defaultText() },
      createdAt: '',
      updatedAt: '',
    }

    const canvas = createCanvas(200, 200)
    const ctx = canvas.getContext('2d')
    renderMeme(ctx as unknown as CanvasRenderingContext2D, {
      template,
      baseImage: base as unknown as HTMLImageElement,
      slotImages: { cutout: embedded as unknown as HTMLImageElement },
      backfillImages: {},
      showOverlays: false,
    })

    expect(isRed(ctx.getImageData(100, 100, 1, 1).data)).toBe(true)
    expect(isRed(ctx.getImageData(100, 55, 1, 1).data)).toBe(true)
    expect(isRed(ctx.getImageData(65, 55, 1, 1).data)).toBe(true)
    expect(isRed(ctx.getImageData(42, 42, 1, 1).data)).toBe(false)
    expect(isRed(ctx.getImageData(52, 52, 1, 1).data)).toBe(false)
  })

  function makeFramingTemplate(transform: Slot['transform']): MemeTemplate {
    const slot: Slot = {
      id: 'framed',
      name: 'Framed',
      shape: 'rect',
      rect: { x: 0, y: 0, w: 200, h: 200 },
      fit: 'stretch',
      imageFile: 'slot.png',
      transform,
      mask: {
        mode: 'rect',
        cornerRadius: 0,
        inset: 0,
        autoSource: 'auto',
        tolerance: 36,
      },
      backfill: defaultBackfill(),
      blend: {
        ...defaultBlend(),
        trimEdges: false,
        tint: false,
        feather: 0,
        blur: 0,
        downscale: 0,
        brightness: 100,
        saturation: 100,
        opacity: 100,
      },
    }
    return {
      schemaVersion: 1,
      id: 'framing-test',
      name: 'Framing test',
      width: 200,
      height: 200,
      baseImageFile: 'base.png',
      slots: [slot],
      text: { top: defaultText(), bottom: defaultText() },
      createdAt: '',
      updatedAt: '',
    }
  }

  function renderFraming(
    transform: Slot['transform'],
    embedded: Canvas,
  ) {
    const base = makeQuadBase()
    const canvas = createCanvas(200, 200)
    const ctx = canvas.getContext('2d')
    renderMeme(ctx as unknown as CanvasRenderingContext2D, {
      template: makeFramingTemplate(transform),
      baseImage: base as unknown as HTMLImageElement,
      slotImages: { framed: embedded as unknown as HTMLImageElement },
      backfillImages: {},
      showOverlays: false,
    })
    return ctx
  }

  it('zooms the embedded image out around the slot center', () => {
    const embedded = makeRedImage()
    const atFull = renderFraming({ zoom: 1, offsetX: 0, offsetY: 0 }, embedded)
    const zoomedOut = renderFraming({ zoom: 0.5, offsetX: 0, offsetY: 0 }, embedded)

    expect(isRed(atFull.getImageData(5, 5, 1, 1).data)).toBe(true)
    expect(isRed(zoomedOut.getImageData(5, 5, 1, 1).data)).toBe(false)
    expect(isRed(zoomedOut.getImageData(100, 100, 1, 1).data)).toBe(true)
  })

  it('offsets the embedded image inside the slot', () => {
    const embedded = createCanvas(64, 64)
    const embeddedCtx = embedded.getContext('2d')
    embeddedCtx.fillStyle = '#ff2d2d'
    embeddedCtx.fillRect(0, 0, 32, 64)
    embeddedCtx.fillStyle = '#2b4bd8'
    embeddedCtx.fillRect(32, 0, 32, 64)

    const centered = renderFraming({ zoom: 1, offsetX: 0, offsetY: 0 }, embedded)
    const offset = renderFraming({ zoom: 1, offsetX: 40, offsetY: 0 }, embedded)

    expect(isRed(centered.getImageData(90, 100, 1, 1).data)).toBe(true)
    expect(isRed(centered.getImageData(110, 100, 1, 1).data)).toBe(false)
    expect(isRed(offset.getImageData(90, 100, 1, 1).data)).toBe(true)
    expect(isRed(offset.getImageData(130, 100, 1, 1).data)).toBe(true)
    expect(isRed(offset.getImageData(150, 100, 1, 1).data)).toBe(false)
  })

  it('reveals the whole image when zooming out from cover instead of re-cropping it', () => {
    const slot: Slot = {
      id: 'reveal',
      name: 'Reveal',
      shape: 'rect',
      rect: { x: 50, y: 50, w: 100, h: 100 },
      fit: 'cover',
      imageFile: 'slot.png',
      transform: { zoom: 1, offsetX: 0, offsetY: 0 },
      mask: {
        mode: 'rect',
        cornerRadius: 0,
        inset: 0,
        autoSource: 'auto',
        tolerance: 36,
      },
      backfill: defaultBackfill(),
      blend: {
        ...defaultBlend(),
        trimEdges: false,
        tint: false,
        feather: 0,
        blur: 0,
        downscale: 0,
        brightness: 100,
        saturation: 100,
        opacity: 100,
      },
    }
    const template: MemeTemplate = {
      schemaVersion: 1,
      id: 'reveal-test',
      name: 'Reveal test',
      width: 200,
      height: 200,
      baseImageFile: 'base.png',
      slots: [slot],
      text: { top: defaultText(), bottom: defaultText() },
      createdAt: '',
      updatedAt: '',
    }

    const bordered = createCanvas(80, 60)
    const bctx = bordered.getContext('2d')
    bctx.fillStyle = '#ff2d2d'
    bctx.fillRect(0, 0, 80, 60)
    bctx.fillStyle = '#ffe14d'
    bctx.fillRect(0, 0, 3, 60)
    bctx.fillRect(77, 0, 3, 60)

    const base = makeQuadBase()
    const render = (zoom: number) => {
      const next = JSON.parse(JSON.stringify(template)) as MemeTemplate
      next.slots[0].transform = { zoom, offsetX: 0, offsetY: 0 }
      const canvas = createCanvas(200, 200)
      const ctx = canvas.getContext('2d')
      renderMeme(ctx as unknown as CanvasRenderingContext2D, {
        template: next,
        baseImage: base as unknown as HTMLImageElement,
        slotImages: { reveal: bordered as unknown as HTMLImageElement },
        backfillImages: {},
        showOverlays: false,
      })
      return ctx
    }

    const isYellow = (data: Uint8ClampedArray) =>
      data[0] > 180 && data[1] > 180 && data[2] < 140

    const covered = render(1)
    expect(isYellow(covered.getImageData(68, 100, 1, 1).data)).toBe(false)

    const revealed = render(0.5)
    expect(isYellow(revealed.getImageData(68, 100, 1, 1).data)).toBe(true)
    expect(isYellow(revealed.getImageData(132, 100, 1, 1).data)).toBe(true)
  })

  it('draws an outer glow outside the slot and not over the image', () => {
    const slot: Slot = {
      id: 'glow',
      name: 'Glow',
      shape: 'rect',
      rect: { x: 80, y: 80, w: 40, h: 40 },
      fit: 'cover',
      imageFile: 'slot.png',
      mask: {
        mode: 'rect',
        cornerRadius: 0,
        inset: 0,
        autoSource: 'auto',
        tolerance: 36,
      },
      backfill: defaultBackfill(),
      blend: {
        ...defaultBlend(),
        trimEdges: false,
        tint: false,
        feather: 0,
        blur: 0,
        downscale: 0,
        brightness: 100,
        saturation: 100,
        opacity: 100,
        glowEnabled: true,
        glowColor: '#ff0000',
        glowSize: 12,
        glowOpacity: 100,
      },
    }
    const template: MemeTemplate = {
      schemaVersion: 1,
      id: 'glow-test',
      name: 'Glow test',
      width: 200,
      height: 200,
      baseImageFile: 'base.png',
      slots: [slot],
      text: { top: defaultText(), bottom: defaultText() },
      createdAt: '',
      updatedAt: '',
    }

    const base = makeQuadBase()
    const canvas = createCanvas(200, 200)
    const ctx = canvas.getContext('2d')
    renderMeme(ctx as unknown as CanvasRenderingContext2D, {
      template,
      baseImage: base as unknown as HTMLImageElement,
      slotImages: { glow: makeRedImage() as unknown as HTMLImageElement },
      backfillImages: {},
      showOverlays: false,
    })

    const nearEdge = ctx.getImageData(74, 100, 1, 1).data
    const farAway = ctx.getImageData(55, 100, 1, 1).data
    const interior = ctx.getImageData(100, 100, 1, 1).data

    expect(nearEdge[0]).toBeGreaterThan(70)
    expect(nearEdge[0]).toBeGreaterThan(farAway[0] + 20)
    expect(isRed(interior)).toBe(true)
  })
})
