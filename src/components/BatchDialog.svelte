<script lang="ts">
  import { zipSync } from 'fflate'
  import { applyBatchSettings, defaultBatchSettings, type BatchSettings } from '../lib/batch'
  import { createExportCanvas } from '../lib/composite'
  import { downloadBlob, fileToDataUrl, pickFile } from '../lib/files'
  import { loadImage, slugify } from '../lib/images'
  import { webStore } from '../lib/webStore'
  import type { TemplateSummary } from '../lib/types'

  interface Props {
    open: boolean
    templates: TemplateSummary[]
    onClose: () => void
  }

  let { open, templates, onClose }: Props = $props()

  let sourceFile = $state<File | null>(null)
  let sourceUrl = $state<string | null>(null)
  let selectedIds = $state<string[]>([])
  let settings = $state<BatchSettings>(defaultBatchSettings())
  let generating = $state(false)
  let done = $state(0)
  let total = $state(0)
  let status = $state('')
  let failures = $state<string[]>([])

  const usableTemplates = $derived(templates.filter((template) => template.slotCount > 0))

  let wasOpen = false
  $effect(() => {
    if (open && !wasOpen) {
      wasOpen = true
      if (selectedIds.length === 0 && usableTemplates.length > 0) {
        selectedIds = usableTemplates.map((template) => template.id)
      }
    } else if (!open) {
      wasOpen = false
    }
  })

  function setSettings<K extends keyof BatchSettings>(key: K, value: BatchSettings[K]): void {
    settings = { ...settings, [key]: value }
  }

  function num(event: Event): number {
    return Number((event.currentTarget as HTMLInputElement).value)
  }

  function bool(event: Event): boolean {
    return (event.currentTarget as HTMLInputElement).checked
  }

  function toggle(id: string): void {
    selectedIds = selectedIds.includes(id)
      ? selectedIds.filter((value) => value !== id)
      : [...selectedIds, id]
  }

  function allSelected(): boolean {
    return usableTemplates.length > 0 && selectedIds.length === usableTemplates.length
  }

  function toggleAll(): void {
    selectedIds = allSelected() ? [] : usableTemplates.map((template) => template.id)
  }

  async function chooseImage(): Promise<void> {
    const file = await pickFile('image/*')
    if (!file) return
    sourceFile = file
    if (sourceUrl) URL.revokeObjectURL(sourceUrl)
    sourceUrl = URL.createObjectURL(file)
    status = ''
  }

  function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob)
        else reject(new Error('PNG encoding failed'))
      }, 'image/png')
    })
  }

  function uniqueName(base: string, used: Set<string>): string {
    const root = slugify(base) || 'meme'
    let name = `${root}.png`
    let index = 2
    while (used.has(name)) {
      name = `${root}-${index}.png`
      index += 1
    }
    used.add(name)
    return name
  }

  async function generate(): Promise<void> {
    if (!sourceFile || selectedIds.length === 0 || generating) return
    generating = true
    done = 0
    total = selectedIds.length
    status = ''
    failures = []
    const files: Record<string, Uint8Array> = {}
    const used = new Set<string>()
    try {
      const sourceImage = await loadImage(await fileToDataUrl(sourceFile))
      for (const id of selectedIds) {
        try {
          const loaded = await webStore.loadTemplate(id)
          const baseAsset = loaded.assets[loaded.template.baseImageFile]
          if (!baseAsset) throw new Error('missing base image')
          const baseImage = await loadImage(baseAsset)
          const template = applyBatchSettings(loaded.template, settings)
          const slotImages: Record<string, HTMLImageElement> = {}
          for (const slot of template.slots) {
            slot.imageFile = 'batch-image.png'
            slotImages[slot.id] = sourceImage
          }
          const backfillImages: Record<string, HTMLImageElement> = {}
          for (const slot of template.slots) {
            if (slot.backfill.mode !== 'image' || !slot.backfill.imageFile) continue
            const asset = loaded.assets[slot.backfill.imageFile]
            if (asset) backfillImages[slot.id] = await loadImage(asset)
          }
          const canvas = createExportCanvas({
            template,
            baseImage,
            slotImages,
            backfillImages,
            showOverlays: false,
          })
          const blob = await canvasToBlob(canvas)
          files[uniqueName(template.name, used)] = new Uint8Array(await blob.arrayBuffer())
        } catch (error) {
          failures = [
            ...failures,
            `${loadedName(id)}: ${error instanceof Error ? error.message : String(error)}`,
          ]
        } finally {
          done += 1
        }
      }
      if (Object.keys(files).length === 0) {
        status = 'No memes were generated. Check that the templates still have their base images.'
        return
      }
      const zipped = zipSync(files, { level: 0 })
      downloadBlob(
        new Blob([zipped as unknown as BlobPart], { type: 'application/zip' }),
        'memeembed-batch.zip',
      )
      status = `Generated ${Object.keys(files).length} meme${
        Object.keys(files).length === 1 ? '' : 's'
      } in memeembed-batch.zip.`
      if (failures.length > 0) {
        status += ` ${failures.length} template(s) could not be generated.`
      }
    } catch (error) {
      status = `Batch failed: ${error instanceof Error ? error.message : String(error)}`
    } finally {
      generating = false
    }
  }

  function loadedName(id: string): string {
    return templates.find((template) => template.id === id)?.name ?? id
  }
</script>

<svelte:window
  onkeydown={(event) => {
    if (open && event.key === 'Escape' && !generating) onClose()
  }}
/>

{#if open}
  <div
    class="overlay"
    role="presentation"
    onclick={(event) => {
      if (event.target === event.currentTarget && !generating) onClose()
    }}
  >
    <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="batch-title">
      <header>
        <h2 id="batch-title">Batch generate memes</h2>
        <button class="icon" onclick={onClose} aria-label="Close batch dialog" disabled={generating}>×</button>
      </header>

      <div class="content">
        <section>
          <h3>1. Source image</h3>
          <div class="source-row">
            <button class="primary" onclick={chooseImage} disabled={generating}>
              {sourceFile ? 'Choose another image' : 'Choose image'}
            </button>
            <span class="filename">{sourceFile?.name ?? 'No image selected'}</span>
          </div>
          {#if sourceUrl}
            <img class="preview" src={sourceUrl} alt="Selected source preview" />
          {/if}
        </section>

        <section>
          <div class="section-head">
            <h3>2. Templates</h3>
            <button class="link" onclick={toggleAll} disabled={generating || usableTemplates.length === 0}>
              {allSelected() ? 'Select none' : 'Select all'}
            </button>
          </div>
          {#if usableTemplates.length === 0}
            <p class="hint">No saved templates with slots yet.</p>
          {:else}
            <div class="template-list">
              {#each usableTemplates as template (template.id)}
                <label class="template-item">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(template.id)}
                    onchange={() => toggle(template.id)}
                    disabled={generating}
                  />
                  <span class="name">{template.name}</span>
                  <span class="meta">{template.slotCount} slot{template.slotCount === 1 ? '' : 's'}</span>
                </label>
              {/each}
            </div>
          {/if}
        </section>

        <section>
          <h3>3. Shared settings</h3>
          <p class="hint">
            These settings apply to every selected template. Color matching is sampled from each
            template's own base image.
          </p>
          <div class="grid two">
            <label>
              <span>Apply to</span>
              <select
                value={settings.target}
                onchange={(event) => setSettings('target', event.currentTarget.value as BatchSettings['target'])}
                disabled={generating}
              >
                <option value="first">First slot only</option>
                <option value="all">All slots</option>
              </select>
            </label>
            <label>
              <span>Fit</span>
              <select
                value={settings.fit}
                onchange={(event) => setSettings('fit', event.currentTarget.value as BatchSettings['fit'])}
                disabled={generating}
              >
                <option value="cover">Cover (crop)</option>
                <option value="contain">Fit (bars)</option>
                <option value="stretch">Stretch</option>
              </select>
            </label>
          </div>
          <label class="slider">
            <span>Zoom <small>{Math.round(settings.zoom * 100)}%</small></span>
            <input
              type="range"
              min="10"
              max="400"
              value={Math.round(settings.zoom * 100)}
              oninput={(event) => setSettings('zoom', num(event) / 100)}
              disabled={generating}
            />
          </label>
          <div class="grid two">
            <label>
              <span>Offset X <small>px</small></span>
              <input
                type="number"
                value={settings.offsetX}
                oninput={(event) => setSettings('offsetX', num(event))}
                disabled={generating}
              />
            </label>
            <label>
              <span>Offset Y <small>px</small></span>
              <input
                type="number"
                value={settings.offsetY}
                oninput={(event) => setSettings('offsetY', num(event))}
                disabled={generating}
              />
            </label>
          </div>
          <div class="grid two">
            <label class="check">
              <input
                type="checkbox"
                checked={settings.trimEdges}
                onchange={(event) => setSettings('trimEdges', bool(event))}
                disabled={generating}
              />
              <span>Trim edges</span>
            </label>
            <label class="check">
              <input
                type="checkbox"
                checked={settings.tint}
                onchange={(event) => setSettings('tint', bool(event))}
                disabled={generating}
              />
              <span>Tint from base image</span>
            </label>
          </div>
          {#if settings.tint}
            <label class="slider">
              <span>Tint strength <small>{settings.tintStrength}%</small></span>
              <input
                type="range"
                min="0"
                max="100"
                value={settings.tintStrength}
                oninput={(event) => setSettings('tintStrength', num(event))}
                disabled={generating}
              />
            </label>
          {/if}
          <div class="grid two">
            <label class="slider">
              <span>Edge feather <small>{settings.feather}px</small></span>
              <input
                type="range"
                min="0"
                max="80"
                value={settings.feather}
                oninput={(event) => setSettings('feather', num(event))}
                disabled={generating}
              />
            </label>
            <label class="slider">
              <span>Opacity <small>{settings.opacity}%</small></span>
              <input
                type="range"
                min="0"
                max="100"
                value={settings.opacity}
                oninput={(event) => setSettings('opacity', num(event))}
                disabled={generating}
              />
            </label>
          </div>
        </section>

        {#if status}
          <p class="status" role="status">{status}</p>
        {/if}
        {#if failures.length > 0}
          <ul class="failures">
            {#each failures as failure}
              <li>{failure}</li>
            {/each}
          </ul>
        {/if}
      </div>

      <footer>
        {#if generating}
          <span class="progress" role="status">
            Generating {done}/{total} ({Math.round((done / Math.max(1, total)) * 100)}%)
          </span>
        {/if}
        <span class="count">
          {selectedIds.length} template{selectedIds.length === 1 ? '' : 's'} selected
        </span>
        <button onclick={onClose} disabled={generating}>Cancel</button>
        <button
          class="primary"
          onclick={generate}
          disabled={generating || !sourceFile || selectedIds.length === 0}
        >
          {generating ? 'Generating…' : 'Generate ZIP'}
        </button>
      </footer>
    </div>
  </div>
{/if}

<style>
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

  .dialog {
    width: min(720px, 100%);
    max-height: min(88vh, 960px);
    display: flex;
    flex-direction: column;
    background: #10161d;
    border: 1px solid #263241;
    border-radius: 12px;
    box-shadow: 0 30px 80px rgba(0, 0, 0, 0.6);
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 20px;
    border-bottom: 1px solid #1d2632;
  }

  h2 {
    margin: 0;
    font-size: 16px;
    color: #eaf2fa;
  }

  h3 {
    margin: 0 0 8px;
    font-size: 12px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: #7f94a9;
  }

  .content {
    display: flex;
    flex-direction: column;
    gap: 18px;
    padding: 18px 20px;
    overflow: auto;
  }

  section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .section-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .source-row {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .filename {
    font-size: 12px;
    color: #9fb3c8;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .preview {
    max-width: 160px;
    max-height: 100px;
    object-fit: contain;
    border: 1px solid #263241;
    border-radius: 6px;
    background: #0b0f14;
  }

  .template-list {
    max-height: 180px;
    overflow: auto;
    border: 1px solid #1d2632;
    border-radius: 8px;
    background: #0b0f14;
  }

  .template-item {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    border-bottom: 1px solid #141c25;
    cursor: pointer;
  }

  .template-item:last-child {
    border-bottom: none;
  }

  .template-item .name {
    flex: 1;
    font-size: 13px;
    color: #dbe6f1;
  }

  .template-item .meta {
    font-size: 11px;
    color: #6f8499;
  }

  .grid {
    display: grid;
    gap: 10px;
  }

  .grid.two {
    grid-template-columns: 1fr 1fr;
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 12px;
    color: #8ea3b8;
  }

  label > span {
    display: flex;
    justify-content: space-between;
    gap: 6px;
  }

  label.check {
    flex-direction: row;
    align-items: center;
    gap: 8px;
    color: #cfdae6;
    font-size: 13px;
  }

  input[type='number'],
  select {
    width: 100%;
    box-sizing: border-box;
    background: #0f141b;
    color: #e6edf5;
    border: 1px solid #263241;
    border-radius: 6px;
    padding: 6px 8px;
    font-size: 13px;
  }

  input[type='range'] {
    width: 100%;
    accent-color: #4cc2ff;
  }

  input[type='checkbox'] {
    accent-color: #4cc2ff;
  }

  small {
    color: #6f8499;
    font-variant-numeric: tabular-nums;
  }

  .hint {
    margin: 0;
    font-size: 11px;
    line-height: 1.45;
    color: #6f8499;
  }

  .status {
    margin: 0;
    padding: 8px 10px;
    border-radius: 6px;
    background: rgba(76, 194, 255, 0.1);
    border: 1px solid rgba(76, 194, 255, 0.22);
    color: #cfe8ff;
    font-size: 12px;
  }

  .failures {
    margin: 0;
    padding-left: 18px;
    color: #ffb3bd;
    font-size: 11px;
    line-height: 1.5;
  }

  footer {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 20px;
    border-top: 1px solid #1d2632;
  }

  .count,
  .progress {
    flex: 1;
    font-size: 11px;
    color: #6f8499;
  }

  .progress {
    color: #8fd6ff;
  }

  button {
    background: #18202b;
    color: #dbe6f1;
    border: 1px solid #2a3847;
    border-radius: 6px;
    padding: 7px 12px;
    font-size: 12px;
    cursor: pointer;
  }

  button:hover:not(:disabled) {
    border-color: #3d5266;
    background: #1d2835;
  }

  button:disabled {
    opacity: 0.55;
    cursor: default;
  }

  button.primary {
    background: linear-gradient(180deg, #1f6f9c, #17567a);
    border-color: #2b81b3;
    color: #eaf7ff;
  }

  button.icon {
    background: none;
    border: none;
    color: #9fb3c8;
    font-size: 20px;
    line-height: 1;
    padding: 0 4px;
  }

  button.link {
    background: none;
    border: none;
    color: #7f94a9;
    padding: 0;
    font-size: 11px;
    text-decoration: underline;
  }
</style>
