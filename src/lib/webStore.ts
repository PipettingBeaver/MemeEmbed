import { clear, createStore, del, get, keys, set } from 'idb-keyval'
import { migrateTemplate } from './defaults'
import { blobToDataUrl } from './files'
import { slugify } from './images'
import type {
  LoadedTemplate,
  MemeTemplate,
  SaveResult,
  SaveTemplateOptions,
  SelfTestItem,
  TemplateBundle,
  TemplateSummary,
} from './types'

const store = createStore('memeembed', 'templates')
const PREFIX = 'template:'
const PRESET_INDEX = 'templates/index.json'

function keyFor(id: string): string {
  return `${PREFIX}${id}`
}

interface StoredTemplate {
  template: MemeTemplate
  assets: Record<string, string>
  savedAt: string
}

function isStored(value: unknown): value is StoredTemplate {
  if (!value || typeof value !== 'object') return false
  const record = value as Partial<StoredTemplate>
  return Boolean(record.template && record.assets)
}

function referencedAssets(template: MemeTemplate): Set<string> {
  const names = new Set<string>()
  if (template.baseImageFile) names.add(template.baseImageFile)
  for (const slot of template.slots) {
    if (slot.imageFile) names.add(slot.imageFile)
    if (slot.backfill.mode === 'image' && slot.backfill.imageFile) {
      names.add(slot.backfill.imageFile)
    }
  }
  return names
}

function pruneAssets(
  template: MemeTemplate,
  assets: Record<string, string>,
): Record<string, string> {
  const pruned: Record<string, string> = {}
  for (const name of referencedAssets(template)) {
    if (assets[name]) pruned[name] = assets[name]
  }
  return pruned
}

function summaryFor(template: MemeTemplate, assets: Record<string, string>): TemplateSummary {
  return {
    id: template.id,
    name: template.name,
    width: template.width,
    height: template.height,
    slotCount: template.slots.length,
    updatedAt: template.updatedAt || null,
    hasBaseImage: Boolean(template.baseImageFile && assets[template.baseImageFile]),
  }
}

async function uniqueId(base: string): Promise<string> {
  const root = slugify(base) || 'template'
  let id = root
  let suffix = 2
  while (await get(keyFor(id), store)) {
    id = `${root}-${suffix}`
    suffix += 1
  }
  return id
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} while loading ${url}`)
  }
  return (await response.json()) as T
}

async function listTemplates(): Promise<TemplateSummary[]> {
  const allKeys = await keys(store)
  const summaries: TemplateSummary[] = []
  for (const key of allKeys) {
    if (typeof key !== 'string' || !key.startsWith(PREFIX)) continue
    const stored = await get(key, store)
    if (!isStored(stored)) continue
    const template = migrateTemplate(stored.template)
    summaries.push(summaryFor(template, stored.assets))
  }
  summaries.sort((a, b) => a.name.localeCompare(b.name))
  return summaries
}

async function loadTemplate(id: string): Promise<LoadedTemplate> {
  const stored = await get(keyFor(id), store)
  if (!isStored(stored)) {
    throw new Error(`Template "${id}" was not found in this browser.`)
  }
  return {
    template: migrateTemplate(stored.template),
    assets: { ...stored.assets },
  }
}

async function saveTemplate(options: SaveTemplateOptions): Promise<SaveResult> {
  const now = new Date().toISOString()
  const name = options.asCopy
    ? (options.copyName ?? `${options.template.name} copy`)
    : options.template.name

  let id: string
  if (options.asCopy) {
    id = await uniqueId(name)
  } else if (!options.template.id || options.template.id === 'unsaved') {
    id = await uniqueId(name)
  } else {
    id = slugify(options.template.id) || (await uniqueId(name))
  }

  const template: MemeTemplate = {
    ...options.template,
    id,
    name,
    updatedAt: now,
  }
  const assets = pruneAssets(template, options.assets)
  await set(keyFor(id), { template, assets, savedAt: now } satisfies StoredTemplate, store)
  return { id, name, template }
}

async function deleteTemplate(id: string): Promise<void> {
  await del(keyFor(id), store)
}

async function restorePresets(overwrite: boolean): Promise<number> {
  const index = await fetchJson<{ presets: { dir: string }[] }>(
    new URL(PRESET_INDEX, document.baseURI).toString(),
  )
  if (!Array.isArray(index.presets)) {
    throw new Error('The bundled preset manifest is malformed.')
  }

  let restored = 0
  for (const preset of index.presets) {
    const baseUrl = new URL(`templates/${preset.dir}/`, document.baseURI)
    const template = migrateTemplate(
      await fetchJson<MemeTemplate>(new URL('template.json', baseUrl).toString()),
    )
    if (!overwrite && (await get(keyFor(template.id), store))) continue

    const assets: Record<string, string> = {}
    for (const name of referencedAssets(template)) {
      const response = await fetch(new URL(name, baseUrl))
      if (!response.ok) {
        throw new Error(`Could not load preset asset ${name} (HTTP ${response.status})`)
      }
      assets[name] = await blobToDataUrl(await response.blob())
    }

    await set(
      keyFor(template.id),
      { template, assets, savedAt: new Date().toISOString() } satisfies StoredTemplate,
      store,
    )
    restored += 1
  }
  return restored
}

async function seedPresets(): Promise<number> {
  return restorePresets(false)
}

async function exportTemplateBundle(id: string): Promise<TemplateBundle> {
  const loaded = await loadTemplate(id)
  return {
    format: 'memeembed-template',
    version: 1,
    template: loaded.template,
    assets: loaded.assets,
  }
}

async function importTemplateBundle(bundle: TemplateBundle): Promise<SaveResult> {
  if (!bundle || bundle.format !== 'memeembed-template' || !bundle.template) {
    throw new Error('That file is not a MemeEmbed template bundle.')
  }
  const source = migrateTemplate(bundle.template)
  const sourceId =
    source.id && source.id !== 'unsaved' ? slugify(source.id) : ''
  const exists = sourceId ? Boolean(await get(keyFor(sourceId), store)) : false
  const id = sourceId && !exists ? sourceId : await uniqueId(source.name)
  const name = exists ? `${source.name} (imported)` : source.name
  const template: MemeTemplate = {
    ...source,
    id,
    name,
    updatedAt: new Date().toISOString(),
  }
  const assets = pruneAssets(template, bundle.assets ?? {})
  await set(
    keyFor(id),
    { template, assets, savedAt: template.updatedAt } satisfies StoredTemplate,
    store,
  )
  return { id, name, template }
}

async function selfTest(): Promise<SelfTestItem[]> {
  const items: SelfTestItem[] = []

  try {
    await set('selftest', 1, store)
    await del('selftest', store)
    items.push({
      name: 'Browser storage',
      ok: true,
      detail: 'IndexedDB write succeeded',
    })
  } catch (error) {
    items.push({
      name: 'Browser storage',
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    })
  }

  let summaries: TemplateSummary[] = []
  try {
    summaries = await listTemplates()
    items.push({
      name: 'Template index',
      ok: true,
      detail: `${summaries.length} template(s) in this browser`,
    })
  } catch (error) {
    items.push({
      name: 'Template index',
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    })
  }

  for (const summary of summaries.slice(0, 10)) {
    try {
      const loaded = await loadTemplate(summary.id)
      let ok = summary.hasBaseImage && summary.width > 0 && summary.height > 0
      let detail = `${summary.width}×${summary.height}, ${summary.slotCount} slot(s)`
      for (const name of referencedAssets(loaded.template)) {
        if (!loaded.assets[name]) {
          ok = false
          detail += `; missing asset "${name}"`
        }
      }
      items.push({ name: `Template "${summary.name}"`, ok, detail })
    } catch (error) {
      items.push({
        name: `Template "${summary.name}"`,
        ok: false,
        detail: error instanceof Error ? error.message : String(error),
      })
    }
  }

  try {
    const response = await fetch(new URL(PRESET_INDEX, document.baseURI), {
      cache: 'no-store',
    })
    items.push({
      name: 'Bundled presets',
      ok: response.ok,
      detail: response.ok ? 'Preset manifest is reachable' : `HTTP ${response.status}`,
    })
  } catch (error) {
    items.push({
      name: 'Bundled presets',
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    })
  }

  return items
}

async function clearAllTemplates(): Promise<void> {
  await clear(store)
}

export const webStore = {
  seedPresets,
  restorePresets,
  listTemplates,
  loadTemplate,
  saveTemplate,
  deleteTemplate,
  exportTemplateBundle,
  importTemplateBundle,
  selfTest,
  clearAllTemplates,
}
