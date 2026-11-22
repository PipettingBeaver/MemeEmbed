<script lang="ts">
  import { onMount } from 'svelte'
  import BatchDialog from './components/BatchDialog.svelte'
  import GuidePanel from './components/GuidePanel.svelte'
  import HelpDialog from './components/HelpDialog.svelte'
  import Inspector from './components/Inspector.svelte'
  import LogPanel from './components/LogPanel.svelte'
  import Stage from './components/Stage.svelte'
  import TemplateList from './components/TemplateList.svelte'
  import TextPanel from './components/TextPanel.svelte'
  import { createExportCanvas, getImageDataForImage } from './lib/composite'
  import {
    createTemplateFromImage,
    defaultBlend,
    defaultSlot,
    makeId,
    migrateTemplate,
  } from './lib/defaults'
  import {
    clampPoint,
    clampRect,
    pointsBBox,
    quadArea,
    rectCorners,
    sortQuadPoints,
  } from './lib/geometry'
  import { fitCutout, suggestBevel, type CutoutFit } from './lib/cutout'
  import {
    assetNameForBase,
    assetNameForSlot,
    fileStem,
    loadImage,
    slugify,
  } from './lib/images'
  import {
    blobToDataUrl,
    downloadBlob,
    downloadText,
    fileToDataUrl,
    pickFile,
  } from './lib/files'
  import { History } from './lib/history'
  import { logs, logError, type LogLevel } from './lib/log.svelte'
  import { webStore } from './lib/webStore'
  import type {
    BackfillSettings,
    BlendSettings,
    GuideSettings,
    MaskSettings,
    MemeTemplate,
    Point,
    Rect,
    SelfTestItem,
    Slot,
    TemplateBundle,
    TemplateSummary,
    TextLayer,
    ToolMode,
  } from './lib/types'

  let templates = $state<TemplateSummary[]>([])
  let current = $state<MemeTemplate | null>(null)
  let assets = $state<Record<string, string>>({})
  let baseImage = $state<HTMLImageElement | null>(null)
  let slotImages = $state<Record<string, HTMLImageElement>>({})
  let backfillImages = $state<Record<string, HTMLImageElement>>({})
  let selectedSlotId = $state<string | null>(null)
  let dirty = $state(false)
  let busy = $state(false)
  let mode = $state<ToolMode>('select')
  let showHelp = $state(false)
  let showBatch = $state(false)
  let showLogs = $state(false)
  let selfTest = $state<SelfTestItem[]>([])
  let copyDialogOpen = $state(false)
  let copyName = $state('')
  let toast = $state('')
  let startupError = $state('')

  const GUIDE_KEY = 'memeembed.guides'

  function loadGuides(): GuideSettings {
    const fallback: GuideSettings = {
      outlines: false,
      thirds: false,
      center: false,
      measurements: false,
      handles: true,
    }
    if (typeof localStorage === 'undefined') return fallback
    try {
      const raw = localStorage.getItem(GUIDE_KEY)
      if (!raw) return fallback
      return { ...fallback, ...(JSON.parse(raw) as Partial<GuideSettings>) }
    } catch {
      return fallback
    }
  }

  const canPasteClipboard =
    typeof navigator !== 'undefined' &&
    Boolean(navigator.clipboard) &&
    typeof navigator.clipboard.read === 'function'

  let guides = $state<GuideSettings>(loadGuides())

  function patchGuides(patch: Partial<GuideSettings>): void {
    guides = { ...guides, ...patch }
    try {
      localStorage.setItem(GUIDE_KEY, JSON.stringify(guides))
    } catch {
      /* storage may be unavailable */
    }
  }

  interface ConfirmState {
    title: string
    message: string
    resolve: (value: boolean) => void
  }

  let confirmState = $state<ConfirmState | null>(null)
  let confirmButton = $state<HTMLButtonElement | null>(null)

  let toastTimer: ReturnType<typeof setTimeout> | null = null

  $effect(() => {
    if (confirmState && confirmButton) confirmButton.focus()
  })

  function confirmAction(message: string, title = 'Confirm'): Promise<boolean> {
    return new Promise((resolve) => {
      confirmState = { title, message, resolve }
    })
  }

  function resolveConfirm(value: boolean): void {
    const state = confirmState
    confirmState = null
    state?.resolve(value)
  }

  interface HistorySnapshot {
    template: MemeTemplate
    assets: Record<string, string>
    selectedSlotId: string | null
    dirty: boolean
  }

  const history = new History<HistorySnapshot>()

  let canUndo = $state(false)
  let canRedo = $state(false)
  let restoring = $state(false)

  function syncHistoryFlags(): void {
    canUndo = history.canUndo
    canRedo = history.canRedo
  }

  const selectedIndex = $derived(
    current ? current.slots.findIndex((slot) => slot.id === selectedSlotId) : -1,
  )
  const selectedSlot = $derived(
    current && selectedIndex >= 0 ? current.slots[selectedIndex] : null,
  )

  onMount(() => {
    const onError = (event: ErrorEvent) => {
      logs.add('error', event.message, event.error instanceof Error ? event.error.stack : undefined)
    }
    const onRejection = (event: PromiseRejectionEvent) => {
      logError(event.reason, 'Unhandled promise rejection')
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return
      const key = event.key.toLowerCase()
      if (key !== 'z' && key !== 'y') return
      if (key === 'y' || (key === 'z' && event.shiftKey)) {
        event.preventDefault()
        void redo()
      } else {
        event.preventDefault()
        void undo()
      }
    }
    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRejection)
    window.addEventListener('keydown', onKeyDown)
    void boot()
    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
      window.removeEventListener('keydown', onKeyDown)
      if (toastTimer) clearTimeout(toastTimer)
    }
  })

  function showToast(message: string): void {
    toast = message
    if (toastTimer) clearTimeout(toastTimer)
    toastTimer = setTimeout(() => {
      toast = ''
    }, 2600)
  }

  function log(level: LogLevel, message: string, detail?: string): void {
    logs.add(level, message, detail)
  }

  function makeSnapshot(): HistorySnapshot | null {
    if (!current) return null
    return {
      template: $state.snapshot(current) as MemeTemplate,
      assets: { ...assets },
      selectedSlotId,
      dirty,
    }
  }

  function recordHistory(key: string): void {
    const snapshot = makeSnapshot()
    if (!snapshot) return
    if (history.record(snapshot, key)) syncHistoryFlags()
  }

  function beginEdit(): void {
    history.beginTransaction()
  }

  function endEdit(): void {
    history.endTransaction()
  }

  function resetHistory(): void {
    history.reset()
    syncHistoryFlags()
  }

  async function restoreSnapshot(snapshot: HistorySnapshot): Promise<void> {
    const template = migrateTemplate(snapshot.template)
    const nextSelected =
      snapshot.selectedSlotId &&
      template.slots.some((slot) => slot.id === snapshot.selectedSlotId)
        ? snapshot.selectedSlotId
        : (template.slots[0]?.id ?? null)
    current = template
    assets = { ...snapshot.assets }
    selectedSlotId = nextSelected
    dirty = snapshot.dirty
    mode = 'select'
    baseImage = null
    slotImages = {}
    backfillImages = {}
    await hydrateImages(template, assets)
  }

  async function undo(): Promise<void> {
    if (restoring || busy || history.isTransactionActive) return
    const currentSnapshot = makeSnapshot()
    if (!currentSnapshot) return
    const snapshot = history.undo(currentSnapshot)
    if (!snapshot) return
    restoring = true
    try {
      await restoreSnapshot(snapshot)
      log('info', 'Undo')
    } catch (error) {
      logError(error, 'Undo failed')
    } finally {
      restoring = false
      syncHistoryFlags()
    }
  }

  async function redo(): Promise<void> {
    if (restoring || busy || history.isTransactionActive) return
    const currentSnapshot = makeSnapshot()
    if (!currentSnapshot) return
    const snapshot = history.redo(currentSnapshot)
    if (!snapshot) return
    restoring = true
    try {
      await restoreSnapshot(snapshot)
      log('info', 'Redo')
    } catch (error) {
      logError(error, 'Redo failed')
    } finally {
      restoring = false
      syncHistoryFlags()
    }
  }

  async function boot(): Promise<void> {
    logs.add('info', 'MemeEmbed starting up')
    busy = true
    try {
      try {
        const seeded = await webStore.seedPresets()
        if (seeded > 0) log('info', `Seeded ${seeded} bundled preset(s)`)
      } catch (error) {
        log(
          'warn',
          'Bundled presets could not be loaded.',
          error instanceof Error ? error.message : String(error),
        )
      }
      await refreshTemplates()
      if (templates.length > 0 && !current) {
        await openTemplate(templates[0].id, true)
      } else if (templates.length === 0) {
        log('warn', 'No templates found. Create one from an image or restore the bundled presets.')
      }
    } catch (error) {
      startupError = error instanceof Error ? error.message : String(error)
      logError(error, 'Startup failed')
    } finally {
      busy = false
    }
  }

  async function refreshTemplates(): Promise<void> {
    templates = await webStore.listTemplates()
  }

  async function confirmDiscard(): Promise<boolean> {
    if (!dirty) return true
    return await confirmAction('Discard unsaved changes?', 'Unsaved changes')
  }

  async function openTemplate(id: string, skipDiscardCheck = false): Promise<void> {
    if (!skipDiscardCheck && !(await confirmDiscard())) return
    busy = true
    try {
      const loaded = await webStore.loadTemplate(id)
      const template = migrateTemplate(loaded.template)
      if (!template.baseImageFile || !loaded.assets[template.baseImageFile]) {
        log('warn', `Template "${template.name}" is missing its base image`, template.baseImageFile ?? '')
      }
      current = template
      assets = loaded.assets
      await hydrateImages(template, loaded.assets)
      selectedSlotId = template.slots[0]?.id ?? null
      dirty = false
      mode = 'select'
      resetHistory()
      log('success', `Opened "${template.name}"`)
    } catch (error) {
      logError(error, `Could not open template "${id}"`)
    } finally {
      busy = false
    }
  }

  async function hydrateImages(
    template: MemeTemplate,
    assetMap: Record<string, string>,
  ): Promise<void> {
    baseImage = null
    slotImages = {}
    backfillImages = {}
    if (template.baseImageFile && assetMap[template.baseImageFile]) {
      try {
        baseImage = await loadImage(assetMap[template.baseImageFile])
      } catch (error) {
        logError(error, 'Could not decode base image')
      }
    }
    for (const slot of template.slots) {
      if (slot.imageFile && assetMap[slot.imageFile]) {
        try {
          slotImages = { ...slotImages, [slot.id]: await loadImage(assetMap[slot.imageFile]) }
        } catch (error) {
          logError(error, `Could not decode image for slot "${slot.name}"`)
        }
      }
    }
    for (const slot of template.slots) {
      if (slot.backfill.mode === 'image' && slot.backfill.imageFile && assetMap[slot.backfill.imageFile]) {
        try {
          backfillImages = {
            ...backfillImages,
            [slot.id]: await loadImage(assetMap[slot.backfill.imageFile]),
          }
        } catch (error) {
          logError(error, `Could not decode backfill image for slot "${slot.name}"`)
        }
      }
    }
  }

  async function newFromImage(): Promise<void> {
    try {
      const file = await pickFile('image/*')
      if (!file) return
      if (!(await confirmDiscard())) return
      const dataUrl = await fileToDataUrl(file)
      const image = await loadImage(dataUrl)
      const baseFile = assetNameForBase(file.name, dataUrl)
      const name = fileStem(file.name).replace(/[-_]+/g, ' ').trim() || 'Untitled meme'
      const template = createTemplateFromImage({
        name,
        width: image.naturalWidth,
        height: image.naturalHeight,
        baseImageFile: baseFile,
        description: `Created from ${file.name}`,
      })
      current = template
      assets = { [baseFile]: dataUrl }
      baseImage = image
      slotImages = {}
      backfillImages = {}
      selectedSlotId = null
      mode = 'create'
      dirty = true
      resetHistory()
      log(
        'success',
        `Created template from ${file.name}`,
        `${image.naturalWidth}×${image.naturalHeight} - click 4 points to add the first slot`,
      )
    } catch (error) {
      logError(error, 'Could not create a template from that image')
    }
  }

  function collectNeededAssets(template: MemeTemplate): string[] {
    const needed = new Set<string>()
    if (template.baseImageFile) needed.add(template.baseImageFile)
    for (const slot of template.slots) {
      if (slot.imageFile) needed.add(slot.imageFile)
      if (slot.backfill.mode === 'image' && slot.backfill.imageFile) {
        needed.add(slot.backfill.imageFile)
      }
    }
    return [...needed]
  }

  async function doSave(asCopy: boolean, nextCopyName?: string): Promise<void> {
    if (!current) return
    busy = true
    try {
      current.updatedAt = new Date().toISOString()
      const needed = collectNeededAssets(current)
      const payloadAssets: Record<string, string> = {}
      for (const name of needed) {
        if (assets[name]) payloadAssets[name] = assets[name]
      }
      if (Object.keys(payloadAssets).length !== needed.length) {
        log('warn', 'Some referenced assets were missing from memory and were not saved')
      }
      const snapshot = $state.snapshot(current) as MemeTemplate
      const result = await webStore.saveTemplate({
        template: snapshot,
        assets: payloadAssets,
        asCopy,
        copyName: asCopy ? (nextCopyName ?? null) : null,
      })
      current.id = result.id
      current.name = result.name
      current.updatedAt = result.template.updatedAt
      assets = payloadAssets
      dirty = false
      mode = 'select'
      if (asCopy) resetHistory()
      await refreshTemplates()
      log('success', asCopy ? `Saved copy "${result.name}"` : `Saved "${result.name}"`)
      showToast(asCopy ? 'Saved as copy' : 'Saved')
    } catch (error) {
      logError(error, asCopy ? 'Save as copy failed' : 'Save failed')
    } finally {
      busy = false
    }
  }

  function requestSaveCopy(): void {
    if (!current) return
    copyName = `${current.name} copy`
    copyDialogOpen = true
  }

  async function confirmSaveCopy(): Promise<void> {
    copyDialogOpen = false
    await doSave(true, copyName.trim() || `${current?.name ?? 'Template'} copy`)
  }

  async function exportPng(): Promise<void> {
    if (!current) return
    busy = true
    try {
      const canvas = createExportCanvas({
        template: current,
        baseImage,
        slotImages,
        backfillImages,
        showOverlays: false,
      })
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((value) => {
          if (value) resolve(value)
          else reject(new Error('PNG encoding failed'))
        }, 'image/png')
      })
      downloadBlob(blob, `${slugify(current.name)}.png`)
      log('success', 'Exported PNG')
      showToast('Exported PNG')
    } catch (error) {
      logError(error, 'Export failed')
    } finally {
      busy = false
    }
  }

  async function applySlotImage(
    slotId: string,
    dataUrl: string,
    originalName: string,
  ): Promise<void> {
    if (!current) return
    const slot = current.slots.find((candidate) => candidate.id === slotId)
    if (!slot) return
    const image = await loadImage(dataUrl)
    recordHistory(`slot:${slotId}:image`)
    const name = assetNameForSlot(slotId, dataUrl)
    const previous = slot.imageFile
    slot.imageFile = name
    const nextAssets = { ...assets, [name]: dataUrl }
    if (previous && previous !== name) delete nextAssets[previous]
    assets = nextAssets
    slotImages = { ...slotImages, [slotId]: image }
    dirty = true
    log('success', `Attached ${originalName} to "${slot.name}"`, `${image.naturalWidth}×${image.naturalHeight}`)
  }

  async function applyBackfillImage(
    slotId: string,
    dataUrl: string,
    originalName: string,
  ): Promise<void> {
    if (!current) return
    const slot = current.slots.find((candidate) => candidate.id === slotId)
    if (!slot) return
    const image = await loadImage(dataUrl)
    recordHistory(`slot:${slotId}:backfill-image`)
    const name = assetNameForSlot(`${slotId}-backfill`, dataUrl)
    const previous = slot.backfill.imageFile
    slot.backfill.mode = 'image'
    slot.backfill.imageFile = name
    const nextAssets = { ...assets, [name]: dataUrl }
    if (previous && previous !== name) delete nextAssets[previous]
    assets = nextAssets
    backfillImages = { ...backfillImages, [slotId]: image }
    dirty = true
    log('success', `Attached backfill ${originalName} to "${slot.name}"`)
  }

  async function attachImage(slotId: string, target: 'slot' | 'backfill'): Promise<void> {
    if (!current) return
    const slot = current.slots.find((candidate) => candidate.id === slotId)
    if (!slot) return
    const file = await pickFile('image/*')
    if (!file) return
    try {
      const dataUrl = await fileToDataUrl(file)
      if (target === 'backfill') {
        await applyBackfillImage(slotId, dataUrl, file.name)
      } else {
        await applySlotImage(slotId, dataUrl, file.name)
      }
    } catch (error) {
      logError(error, 'Could not attach that image')
    }
  }

  async function pasteImage(slotId: string, target: 'slot' | 'backfill'): Promise<void> {
    if (!current) return
    const slot = current.slots.find((candidate) => candidate.id === slotId)
    if (!slot) return
    if (!navigator.clipboard || typeof navigator.clipboard.read !== 'function') {
      log(
        'warn',
        'This browser cannot read images from the clipboard.',
        'Use Attach image or drag and drop instead.',
      )
      return
    }
    try {
      const items = await navigator.clipboard.read()
      for (const item of items) {
        const type = item.types.find((candidate) => candidate.startsWith('image/'))
        if (!type) continue
        const blob = await item.getType(type)
        const dataUrl = await blobToDataUrl(blob)
        const extension = type.split('/')[1] || 'png'
        const name = `clipboard.${extension}`
        if (target === 'backfill') {
          await applyBackfillImage(slotId, dataUrl, name)
        } else {
          await applySlotImage(slotId, dataUrl, name)
        }
        return
      }
      log('warn', 'The clipboard does not contain an image.')
    } catch (error) {
      logError(error, 'Could not read an image from the clipboard')
    }
  }

  async function handleDroppedFile(slotId: string | null, file: File): Promise<void> {
    const targetId = slotId ?? selectedSlotId ?? current?.slots[0]?.id ?? null
    if (!targetId) {
      log('warn', 'Drop an image onto an existing slot, or create a slot first.')
      return
    }
    try {
      const dataUrl = await fileToDataUrl(file)
      await applySlotImage(targetId, dataUrl, file.name || 'dropped image')
    } catch (error) {
      logError(error, 'Could not read the dropped image')
    }
  }

  function clearImage(slotId: string, target: 'slot' | 'backfill'): void {
    if (!current) return
    const slot = current.slots.find((candidate) => candidate.id === slotId)
    if (!slot) return
    recordHistory(`slot:${slotId}:${target}-image`)
    if (target === 'backfill') {
      slot.backfill.imageFile = null
      if (slot.backfill.mode === 'image') slot.backfill.mode = 'none'
      const next = { ...backfillImages }
      delete next[slotId]
      backfillImages = next
    } else {
      slot.imageFile = null
      const next = { ...slotImages }
      delete next[slotId]
      slotImages = next
    }
    dirty = true
  }

  function patchTemplate(patch: Partial<MemeTemplate>): void {
    if (!current) return
    recordHistory(`template:${Object.keys(patch).join(',')}`)
    Object.assign(current, patch)
    dirty = true
  }

  function patchSlot(id: string, patch: Partial<Slot>): void {
    const slot = current?.slots.find((candidate) => candidate.id === id)
    if (!slot) return
    recordHistory(`slot:${id}:meta:${Object.keys(patch).join(',')}`)
    Object.assign(slot, patch)
    dirty = true
  }

  function patchBlend(id: string, patch: Partial<BlendSettings>): void {
    const slot = current?.slots.find((candidate) => candidate.id === id)
    if (!slot) return
    recordHistory(`slot:${id}:blend:${Object.keys(patch).join(',')}`)
    Object.assign(slot.blend, patch)
    dirty = true
  }

  function patchBackfill(id: string, patch: Partial<BackfillSettings>): void {
    const slot = current?.slots.find((candidate) => candidate.id === id)
    if (!slot) return
    recordHistory(`slot:${id}:backfill:${Object.keys(patch).join(',')}`)
    Object.assign(slot.backfill, patch)
    dirty = true
  }

  function patchMask(id: string, patch: Partial<MaskSettings>): void {
    const slot = current?.slots.find((candidate) => candidate.id === id)
    if (!slot) return
    recordHistory(`slot:${id}:mask:${Object.keys(patch).join(',')}`)
    Object.assign(slot.mask, patch)
    dirty = true
  }

  function applyCutoutFit(slot: Slot, fit: CutoutFit): void {
    slot.rect = fit.rect
    if (fit.axisAligned) {
      slot.shape = 'rect'
      slot.points = undefined
    } else {
      slot.shape = 'quad'
      slot.points = fit.corners
    }
  }

  function detectBevel(id: string): void {
    const template = current
    if (!template || !baseImage) {
      log('warn', 'Detect bevel needs a base image.')
      return
    }
    const slot = template.slots.find((candidate) => candidate.id === id)
    if (!slot) return
    try {
      const data = getImageDataForImage(baseImage)
      const suggestion = suggestBevel(data, slot, template.width, template.height)
      if (!suggestion) {
        log(
          'warn',
          'Detect bevel could not find a cutout around this slot.',
          'Adjust the slot rectangle or the auto-trace match/tolerance.',
        )
        return
      }
      const preserveExisting = suggestion.usedExisting && slot.mask.mode === 'rounded'
      if (!preserveExisting) recordHistory(`slot:${id}:bevel`)
      applyCutoutFit(slot, suggestion.fit)

      if (preserveExisting) {
        log(
          'success',
          `Fitted "${slot.name}" to the cutout; kept the existing bevel (${slot.mask.cornerRadius}px radius, ${slot.mask.inset}px inset).`,
          `The localized estimate was ${suggestion.radius}px radius / ${suggestion.inset}px inset; adjust manually if you prefer it.`,
        )
      } else if (suggestion.plausible) {
        slot.mask = {
          ...slot.mask,
          mode: 'rounded',
          cornerRadius: suggestion.radius,
          inset: suggestion.inset,
        }
        log(
          'success',
          `Detected bevel from traced cutout for "${slot.name}": radius ${suggestion.radius}px, inset ${suggestion.inset}px`,
          `${suggestion.fit.axisAligned ? 'rectangle' : 'quad'} fitted; match: ${suggestion.source}, coverage ${(suggestion.coverage * 100).toFixed(0)}%`,
        )
      } else {
        slot.mask = { ...slot.mask, mode: 'auto' }
        log(
          'warn',
          `Fitted "${slot.name}" to the traced cutout, but no reliable rounded bevel was found.`,
          `Using the traced mask as the bevel (radius guess ${suggestion.radiusGuess}px, coverage ${(suggestion.coverage * 100).toFixed(0)}%). Adjust the mask mode/radius manually if needed.`,
        )
      }
      dirty = true
    } catch (error) {
      logError(error, 'Bevel detection failed')
    }
  }

  function traceCutout(id: string): void {
    const template = current
    if (!template) return
    const slot = template.slots.find((candidate) => candidate.id === id)
    if (!slot) return
    if (!baseImage) {
      log('warn', 'Trace cutout needs a base image.')
      return
    }
    try {
      const data = getImageDataForImage(baseImage)
      const fit = fitCutout(data, slot, template.width, template.height)
      if (!fit) {
        log(
          'warn',
          'Trace cutout could not find a cutout around this slot.',
          'Adjust the slot rectangle or the match/tolerance.',
        )
        return
      }
      recordHistory(`slot:${id}:trace`)
      applyCutoutFit(slot, fit)
      slot.mask = { ...slot.mask, mode: 'auto' }
      dirty = true
      log(
        'success',
        `Fitted "${slot.name}" to the traced cutout as a ${fit.axisAligned ? 'rectangle' : 'quad'}`,
        `match: ${fit.source}, coverage ${(fit.coverage * 100).toFixed(0)}%; the traced mask is the bevel`,
      )
    } catch (error) {
      logError(error, 'Could not analyze the cutout')
    }
  }

  function patchRect(id: string, patch: Partial<Rect>): void {
    const slot = current?.slots.find((candidate) => candidate.id === id)
    if (!slot || !current) return
    recordHistory(`slot:${id}:rect`)
    const next = { ...slot.rect, ...patch }
    slot.rect = clampRect(next, current.width, current.height, 8)
    slot.shape = 'rect'
    slot.points = undefined
    dirty = true
  }

  function patchQuad(id: string, points: Point[]): void {
    const template = current
    if (!template) return
    const slot = template.slots.find((candidate) => candidate.id === id)
    if (!slot) return
    const clamped = points.map((point) =>
      clampPoint(point, template.width, template.height),
    )
    if (quadArea(clamped) < 16) return
    recordHistory(`slot:${id}:rect`)
    slot.shape = 'quad'
    slot.points = clamped
    const bbox = pointsBBox(clamped)
    slot.rect = {
      x: bbox.x,
      y: bbox.y,
      w: Math.max(1, bbox.w),
      h: Math.max(1, bbox.h),
    }
    dirty = true
  }

  function patchPoint(id: string, index: number, point: Point): void {
    if (!current) return
    const slot = current.slots.find((candidate) => candidate.id === id)
    if (!slot) return
    const base =
      slot.shape === 'quad' && slot.points && slot.points.length === 4
        ? slot.points
        : rectCorners(slot.rect)
    const points = base.map((candidate) => ({ ...candidate }))
    points[index] = clampPoint(point, current.width, current.height)
    patchQuad(id, points)
  }

  function resetGeometry(id: string): void {
    const slot = current?.slots.find((candidate) => candidate.id === id)
    if (!slot) return
    recordHistory(`slot:${id}:geometry`)
    slot.shape = 'rect'
    slot.points = undefined
    dirty = true
    log('info', `Reset "${slot.name}" to a rectangle`)
  }

  function patchText(position: 'top' | 'bottom', patch: Partial<TextLayer>): void {
    if (!current) return
    recordHistory(`text:${position}`)
    Object.assign(current.text[position], patch)
    dirty = true
  }

  function startCreateSlot(): void {
    if (!current) return
    mode = 'create'
    log('info', 'Click 4 points on the canvas to create a slot')
  }

  function createSlot(rawPoints: Point[]): void {
    const template = current
    if (!template) return
    const sorted = sortQuadPoints(
      rawPoints.map((point) => clampPoint(point, template.width, template.height)),
    )
    if (quadArea(sorted) < 256) {
      log('warn', 'The 4 points were too close together; slot was not created.')
      return
    }
    const bbox = pointsBBox(sorted)
    const rect = clampRect(bbox, template.width, template.height, 12)
    const corners = rectCorners(rect)
    const axisAligned = sorted.every(
      (point, index) =>
        Math.abs(point.x - corners[index].x) <= 2 &&
        Math.abs(point.y - corners[index].y) <= 2,
    )
    const slot = defaultSlot(
      rect,
      `Embed ${template.slots.length + 1}`,
      makeId('slot'),
    )
    if (!axisAligned) {
      slot.shape = 'quad'
      slot.points = sorted
      slot.rect = {
        x: bbox.x,
        y: bbox.y,
        w: Math.max(1, bbox.w),
        h: Math.max(1, bbox.h),
      }
    }
    recordHistory('slot:create')
    template.slots = [...template.slots, slot]
    selectedSlotId = slot.id
    mode = 'select'
    dirty = true
    log(
      'success',
      `Created ${axisAligned ? 'rectangle' : 'quad'} "${slot.name}"`,
      `${Math.round(slot.rect.w)}×${Math.round(slot.rect.h)} at ${Math.round(slot.rect.x)},${Math.round(slot.rect.y)}`,
    )
  }

  function resetEffects(id: string): void {
    const slot = current?.slots.find((candidate) => candidate.id === id)
    if (!slot) return
    recordHistory(`slot:${id}:effects`)
    slot.blend = defaultBlend()
    dirty = true
    log('info', `Reset effects on "${slot.name}"`)
  }

  async function deleteSlot(id: string): Promise<void> {
    if (!current) return
    const slot = current.slots.find((candidate) => candidate.id === id)
    if (!slot) return
    const ok = await confirmAction(`Delete the slot "${slot.name}"?`, 'Delete slot')
    if (!ok) return
    recordHistory(`slot:${id}:delete`)
    current.slots = current.slots.filter((candidate) => candidate.id !== id)
    if (selectedSlotId === id) selectedSlotId = current.slots[0]?.id ?? null
    dirty = true
    log('info', `Deleted slot "${slot.name}"`)
  }

  async function deleteTemplate(id: string): Promise<void> {
    const summary = templates.find((template) => template.id === id)
    const ok = await confirmAction(
      `Delete the template "${summary?.name ?? id}"? It will be removed from this browser.`,
      'Delete template',
    )
    if (!ok) return
    busy = true
    try {
      await webStore.deleteTemplate(id)
      if (current?.id === id) {
        current = null
        baseImage = null
        slotImages = {}
        backfillImages = {}
        selectedSlotId = null
        dirty = false
      }
      resetHistory()
      await refreshTemplates()
      log('success', `Deleted template "${summary?.name ?? id}"`)
      if (!current && templates.length > 0) {
        await openTemplate(templates[0].id, true)
      }
    } catch (error) {
      logError(error, `Could not delete template "${id}"`)
    } finally {
      busy = false
    }
  }

  async function restorePresets(): Promise<void> {
    const ok = await confirmAction(
      'Restore the bundled presets? Templates with the same id will be overwritten.',
      'Restore presets',
    )
    if (!ok) return
    busy = true
    const openId = current?.id ?? null
    try {
      const count = await webStore.restorePresets(true)
      await refreshTemplates()
      if (openId && templates.some((template) => template.id === openId)) {
        await openTemplate(openId, true)
      }
      log('success', `Restored ${count} bundled preset(s)`)
      showToast('Presets restored')
    } catch (error) {
      logError(error, 'Could not restore presets')
    } finally {
      busy = false
    }
  }

  async function importTemplate(): Promise<void> {
    const file = await pickFile('.json,application/json')
    if (!file) return
    if (!(await confirmDiscard())) return
    busy = true
    try {
      const bundle = JSON.parse(await file.text()) as TemplateBundle
      const result = await webStore.importTemplateBundle(bundle)
      await refreshTemplates()
      await openTemplate(result.id, true)
      log('success', `Imported "${result.name}"`)
      showToast('Template imported')
    } catch (error) {
      logError(error, 'Could not import that template')
    } finally {
      busy = false
    }
  }

  async function exportTemplate(): Promise<void> {
    if (!current) return
    try {
      const bundle: TemplateBundle = {
        format: 'memeembed-template',
        version: 1,
        template: $state.snapshot(current) as MemeTemplate,
        assets: { ...assets },
      }
      downloadText(
        JSON.stringify(bundle, null, 2),
        `${slugify(current.name)}.memeembed.json`,
      )
      log('success', 'Exported template bundle')
      showToast('Template exported')
    } catch (error) {
      logError(error, 'Could not export the template')
    }
  }

  async function runSelfTest(): Promise<void> {
    busy = true
    try {
      selfTest = await webStore.selfTest()
      const failures = selfTest.filter((item) => !item.ok)
      log(
        failures.length > 0 ? 'warn' : 'success',
        `Self-test: ${selfTest.length - failures.length}/${selfTest.length} checks passed`,
        failures.length > 0
          ? failures.map((item) => `${item.name}: ${item.detail}`).join('\n')
          : undefined,
      )
      showLogs = true
    } catch (error) {
      logError(error, 'Self-test failed')
    } finally {
      busy = false
    }
  }

  function fallbackCopyText(text: string): boolean {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    textarea.style.pointerEvents = 'none'
    document.body.appendChild(textarea)
    textarea.select()
    let ok = false
    try {
      ok = document.execCommand('copy')
    } catch {
      ok = false
    }
    document.body.removeChild(textarea)
    return ok
  }

  async function copyLogs(): Promise<void> {
    const text = [
      logs.toText(),
      selfTest.length > 0
        ? `\nSELF TEST\n${selfTest
            .map((item) => `${item.ok ? 'PASS' : 'FAIL'} ${item.name}: ${item.detail}`)
            .join('\n')}`
        : '',
    ].join('\n')
    try {
      await navigator.clipboard.writeText(text)
      showToast('Logs copied')
      return
    } catch {
      /* fall back to execCommand below */
    }
    if (fallbackCopyText(text)) {
      showToast('Logs copied')
    } else {
      log('error', 'Could not copy logs to the clipboard; open Logs and select the text manually.')
    }
  }
</script>

<div class="app">
  <header class="topbar">
    <div class="brand">
      <span class="mark">ME</span>
      <div class="brand-text">
        <strong>
          MemeEmbed
          <span class="version" title="Build version">v{__APP_VERSION__}</span>
        </strong>
        <span>template-based image embedding</span>
      </div>
    </div>

    <div class="name-wrap">
      {#if current}
        <input
          class="template-name"
          type="text"
          value={current.name}
          aria-label="Template name"
          oninput={(event) => patchTemplate({ name: (event.currentTarget as HTMLInputElement).value })}
        />
        {#if dirty}<span class="dirty" title="Unsaved changes"></span>{/if}
        <span class="path">
          {current.id === 'unsaved' ? 'Not saved yet' : 'Saved in this browser'}
        </span>
      {:else}
        <span class="no-template">No template open</span>
      {/if}
    </div>

    <div class="actions">
      <button onclick={() => doSave(false)} disabled={!current || busy}>Save</button>
      <button onclick={requestSaveCopy} disabled={!current || busy}>Save as copy</button>
      <button class="primary" onclick={exportPng} disabled={!current || busy}>Export PNG</button>
      <span class="sep"></span>
      <button onclick={() => (showHelp = true)}>Help</button>
      <button onclick={() => (showLogs = true)}>Logs</button>
    </div>
  </header>

  {#if startupError}
    <div class="banner error">
      <strong>Startup problem:</strong> {startupError}
    </div>
  {/if}

  <div class="body">
    <TemplateList
      {templates}
      currentId={current?.id ?? null}
      {busy}
      onOpen={openTemplate}
      onNew={newFromImage}
      onRefresh={() => refreshTemplates().catch((error) => logError(error, 'Refresh failed'))}
      onRestorePresets={restorePresets}
      onImport={importTemplate}
      onExport={exportTemplate}
      onBatch={() => (showBatch = true)}
      onDelete={deleteTemplate}
    />

    <main class="editor">
      <div class="editor-toolbar">
        <button onclick={() => void undo()} disabled={!canUndo || restoring || busy} title="Undo (Ctrl+Z)">
          Undo
        </button>
        <button onclick={() => void redo()} disabled={!canRedo || restoring || busy} title="Redo (Ctrl+Shift+Z or Ctrl+Y)">
          Redo
        </button>
        <span class="sep"></span>
        <button class:active={mode === 'create'} onclick={startCreateSlot} disabled={!current || busy}>
          + Add slot (4 points)
        </button>
        <button class:active={mode === 'select'} onclick={() => (mode = 'select')} disabled={!current}>
          Select / move
        </button>
        <span class="spacer"></span>
        <span class="hint">
          {#if mode === 'create'}
            Click four corners on the canvas.
          {:else if current}
            Click a slot to select · drag to move · handles resize · double-click to attach
          {:else}
            Open or create a template to begin.
          {/if}
        </span>
      </div>

      {#if current}
        <Stage
          template={current}
          {baseImage}
          {slotImages}
          {backfillImages}
          {selectedSlotId}
          {mode}
          {guides}
          onSelect={(id) => (selectedSlotId = id)}
          onChangeRect={patchRect}
          onChangeQuad={patchQuad}
          onCreateSlot={createSlot}
          onEditStart={beginEdit}
          onEditEnd={endEdit}
          onAttachRequest={(slotId) => attachImage(slotId, 'slot')}
          onDropImage={handleDroppedFile}
          onLog={log}
        />
      {:else}
        <div class="placeholder">
          <h2>Start a meme template</h2>
          <p>Choose a template on the left, or create one from any image.</p>
          <button class="primary" onclick={newFromImage} disabled={busy}>+ New from image</button>
        </div>
      {/if}
    </main>

    <aside class="inspector">
      <div class="inspector-scroll">
        <GuidePanel {guides} onPatch={patchGuides} />
        <div class="section-divider"></div>
        <Inspector
          slot={selectedSlot}
          index={selectedIndex}
          onAttach={attachImage}
          onPasteClipboard={pasteImage}
          canPasteClipboard={canPasteClipboard}
          onClearImage={clearImage}
          onDelete={deleteSlot}
          onResetEffects={resetEffects}
          onDetectBevel={detectBevel}
          onTraceCutout={traceCutout}
          onPatch={patchSlot}
          onPatchBlend={patchBlend}
          onPatchBackfill={patchBackfill}
          onPatchMask={patchMask}
          onPatchRect={patchRect}
          onPatchPoint={patchPoint}
          onResetGeometry={resetGeometry}
        />
        <div class="section-divider"></div>
        {#if current}
          <TextPanel text={current.text} onPatch={patchText} />
        {/if}
      </div>
    </aside>
  </div>

  <HelpDialog open={showHelp} onClose={() => (showHelp = false)} />
  <BatchDialog open={showBatch} {templates} onClose={() => (showBatch = false)} />
  <LogPanel
    open={showLogs}
    {selfTest}
    onClose={() => (showLogs = false)}
    onClear={() => {
      logs.clear()
      selfTest = []
    }}
    onSelfTest={runSelfTest}
    onCopy={copyLogs}
  />

  {#if copyDialogOpen}
    <div
      class="overlay"
      role="presentation"
      onclick={(event) => {
        if (event.target === event.currentTarget) copyDialogOpen = false
      }}
    >
      <div
        class="mini-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Save as copy"
        tabindex="-1"
        onkeydown={(event) => {
          if (event.key === 'Escape') copyDialogOpen = false
        }}
      >
        <h2>Save as copy</h2>
        <label>
          <span>Copy name</span>
          <input
            type="text"
            value={copyName}
            oninput={(event) => (copyName = (event.currentTarget as HTMLInputElement).value)}
            onkeydown={(event) => {
              if (event.key === 'Enter') void confirmSaveCopy()
              if (event.key === 'Escape') copyDialogOpen = false
            }}
          />
        </label>
        <div class="mini-actions">
          <button onclick={() => (copyDialogOpen = false)}>Cancel</button>
          <button class="primary" onclick={confirmSaveCopy}>Create copy</button>
        </div>
      </div>
    </div>
  {/if}

  {#if confirmState}
    <div
      class="overlay"
      role="presentation"
      onclick={(event) => {
        if (event.target === event.currentTarget) resolveConfirm(false)
      }}
    >
      <div
        class="mini-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={confirmState.title}
        tabindex="-1"
        onkeydown={(event) => {
          if (event.key === 'Escape') resolveConfirm(false)
          if (event.key === 'Enter') resolveConfirm(true)
        }}
      >
        <h2>{confirmState.title}</h2>
        <p class="confirm-message">{confirmState.message}</p>
        <div class="mini-actions">
          <button onclick={() => resolveConfirm(false)}>Cancel</button>
          <button class="primary" bind:this={confirmButton} onclick={() => resolveConfirm(true)}>
            Confirm
          </button>
        </div>
      </div>
    </div>
  {/if}

  {#if toast}
    <div class="toast">{toast}</div>
  {/if}
</div>

<style>
  .app {
    height: 100%;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .topbar {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 10px 14px;
    background: #0c1117;
    border-bottom: 1px solid #1d2632;
    flex: 0 0 auto;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 9px;
  }

  .mark {
    width: 30px;
    height: 30px;
    display: grid;
    place-items: center;
    border-radius: 8px;
    background: linear-gradient(145deg, #2f8fc4, #17567a);
    color: #eaf7ff;
    font-weight: 700;
    font-size: 13px;
    letter-spacing: 0.04em;
  }

  .brand-text {
    display: flex;
    flex-direction: column;
    line-height: 1.15;
  }

  .brand-text strong {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 14px;
    color: #eaf2fa;
  }

  .brand-text .version {
    padding: 0 5px;
    border: 1px solid #2a3847;
    border-radius: 999px;
    background: #111922;
    color: #8fd6ff;
    font-size: 9px;
    font-weight: 600;
    letter-spacing: 0.02em;
    text-transform: none;
  }

  .brand-text span {
    font-size: 10px;
    color: #6f8499;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .name-wrap {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 8px;
    position: relative;
  }

  .template-name {
    flex: 0 1 380px;
    min-width: 120px;
    background: #0f141b;
    color: #e6edf5;
    border: 1px solid #263241;
    border-radius: 6px;
    padding: 6px 9px;
    font-size: 13px;
    font-weight: 600;
  }

  .template-name:focus {
    outline: none;
    border-color: #2f7196;
    box-shadow: 0 0 0 2px rgba(76, 194, 255, 0.15);
  }

  .dirty {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #ffd25a;
    flex: 0 0 auto;
    box-shadow: 0 0 8px rgba(255, 210, 90, 0.6);
  }

  .path {
    flex: 1;
    min-width: 0;
    font-size: 10px;
    color: #53687d;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .no-template {
    font-size: 13px;
    color: #6f8499;
  }

  .actions {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }

  .sep {
    width: 1px;
    height: 22px;
    background: #1d2632;
    margin: 0 4px;
  }

  .banner {
    padding: 8px 16px;
    font-size: 12px;
    border-bottom: 1px solid #1d2632;
  }

  .banner.error {
    background: #2a1418;
    color: #ffb3bd;
    border-color: #4a2028;
  }

  .body {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: 264px minmax(0, 1fr) 348px;
  }

  .editor {
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    background: #0a0d11;
  }

  .editor-toolbar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border-bottom: 1px solid #1d2632;
    background: #0c1117;
    flex: 0 0 auto;
  }

  .editor-toolbar .spacer {
    flex: 1;
  }

  .hint {
    font-size: 11px;
    color: #5d7186;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .placeholder {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    color: #8398ad;
    text-align: center;
    padding: 24px;
  }

  .placeholder h2 {
    margin: 0;
    color: #cfdae6;
    font-size: 18px;
  }

  .placeholder p {
    margin: 0 0 8px;
    font-size: 13px;
  }

  .inspector {
    min-height: 0;
    background: #0d1218;
    border-left: 1px solid #1d2632;
    overflow: hidden;
    display: flex;
  }

  .inspector-scroll {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .section-divider {
    height: 1px;
    background: #1d2632;
    flex: 0 0 auto;
  }

  button {
    background: #18202b;
    color: #dbe6f1;
    border: 1px solid #2a3847;
    border-radius: 6px;
    padding: 6px 10px;
    font-size: 12px;
    cursor: pointer;
    white-space: nowrap;
  }

  button:hover:not(:disabled) {
    border-color: #3d5266;
    background: #1d2835;
  }

  button:disabled {
    opacity: 0.45;
    cursor: default;
  }

  button.primary {
    background: linear-gradient(180deg, #1f6f9c, #17567a);
    border-color: #2b81b3;
    color: #eaf7ff;
  }

  button.active {
    border-color: #2f7196;
    background: #12212e;
    color: #bfe6ff;
  }

  .overlay {
    position: fixed;
    inset: 0;
    z-index: 60;
    background: rgba(3, 6, 10, 0.72);
    backdrop-filter: blur(3px);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }

  .mini-dialog {
    width: min(420px, 100%);
    background: #10161d;
    border: 1px solid #263241;
    border-radius: 12px;
    box-shadow: 0 30px 80px rgba(0, 0, 0, 0.6);
    padding: 18px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .mini-dialog h2 {
    margin: 0;
    font-size: 15px;
    color: #e6edf5;
  }

  .mini-dialog label {
    display: flex;
    flex-direction: column;
    gap: 5px;
    font-size: 12px;
    color: #8ea3b8;
  }

  .mini-dialog input {
    background: #0f141b;
    color: #e6edf5;
    border: 1px solid #263241;
    border-radius: 6px;
    padding: 7px 9px;
    font-size: 13px;
  }

  .mini-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }

  .confirm-message {
    margin: 0;
    color: #c3d2e1;
    font-size: 13px;
    line-height: 1.5;
  }

  .toast {
    position: fixed;
    bottom: 22px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 70;
    background: #12212e;
    border: 1px solid #2f7196;
    color: #cfe8ff;
    padding: 8px 16px;
    border-radius: 999px;
    font-size: 12px;
    box-shadow: 0 12px 30px rgba(0, 0, 0, 0.45);
  }
</style>
