import 'fake-indexeddb/auto'
import { clear, createStore } from 'idb-keyval'
import { beforeEach, describe, expect, it } from 'vitest'
import { defaultSlot, defaultText } from './defaults'
import { webStore } from './webStore'
import type { MemeTemplate } from './types'

const testStore = createStore('memeembed', 'templates')
const BASE_ASSET = 'data:image/png;base64,AAAA'

function makeTemplate(id = 'test-template', name = 'Test Template'): MemeTemplate {
  return {
    schemaVersion: 1,
    id,
    name,
    width: 200,
    height: 200,
    baseImageFile: 'base.png',
    slots: [defaultSlot({ x: 10, y: 10, w: 100, h: 100 })],
    text: { top: defaultText(), bottom: defaultText() },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

function assets(): Record<string, string> {
  return { 'base.png': BASE_ASSET }
}

describe('webStore', () => {
  beforeEach(async () => {
    await clear(testStore)
  })

  it('saves, loads, and lists a template with its assets', async () => {
    const saved = await webStore.saveTemplate({
      template: makeTemplate(),
      assets: assets(),
      asCopy: false,
      copyName: null,
    })
    expect(saved.id).toBe('test-template')

    const loaded = await webStore.loadTemplate('test-template')
    expect(loaded.template.name).toBe('Test Template')
    expect(loaded.assets['base.png']).toBe(BASE_ASSET)

    const templates = await webStore.listTemplates()
    expect(templates).toHaveLength(1)
    expect(templates[0]).toMatchObject({
      id: 'test-template',
      name: 'Test Template',
      width: 200,
      height: 200,
      slotCount: 1,
      hasBaseImage: true,
    })
  })

  it('creates unique ids for copies', async () => {
    await webStore.saveTemplate({
      template: makeTemplate(),
      assets: assets(),
      asCopy: false,
      copyName: null,
    })

    const first = await webStore.saveTemplate({
      template: makeTemplate(),
      assets: assets(),
      asCopy: true,
      copyName: 'My Copy',
    })
    const second = await webStore.saveTemplate({
      template: makeTemplate(),
      assets: assets(),
      asCopy: true,
      copyName: 'My Copy',
    })

    expect(first.id).toBe('my-copy')
    expect(second.id).toBe('my-copy-2')
    expect(await webStore.listTemplates()).toHaveLength(3)
  })

  it('deletes a template', async () => {
    await webStore.saveTemplate({
      template: makeTemplate(),
      assets: assets(),
      asCopy: false,
      copyName: null,
    })
    await webStore.deleteTemplate('test-template')
    expect(await webStore.listTemplates()).toHaveLength(0)
  })

  it('exports and imports a template bundle', async () => {
    await webStore.saveTemplate({
      template: makeTemplate(),
      assets: assets(),
      asCopy: false,
      copyName: null,
    })

    const bundle = await webStore.exportTemplateBundle('test-template')
    expect(bundle.format).toBe('memeembed-template')
    expect(bundle.assets['base.png']).toBe(BASE_ASSET)

    const imported = await webStore.importTemplateBundle(bundle)
    expect(imported.id).not.toBe('test-template')
    expect(imported.name).toBe('Test Template (imported)')
    expect(imported.template.baseImageFile).toBe('base.png')
    expect((await webStore.listTemplates()).length).toBe(2)
  })

  it('prunes assets that the template no longer references', async () => {
    await webStore.saveTemplate({
      template: makeTemplate(),
      assets: { ...assets(), 'unused.png': 'data:image/png;base64,BBBB' },
      asCopy: false,
      copyName: null,
    })
    const loaded = await webStore.loadTemplate('test-template')
    expect(loaded.assets['base.png']).toBe(BASE_ASSET)
    expect(loaded.assets['unused.png']).toBeUndefined()
  })

  it('clears all templates', async () => {
    await webStore.saveTemplate({
      template: makeTemplate(),
      assets: assets(),
      asCopy: false,
      copyName: null,
    })
    await webStore.clearAllTemplates()
    expect(await webStore.listTemplates()).toHaveLength(0)
  })
})
