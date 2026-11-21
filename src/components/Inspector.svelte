<script lang="ts">
  import { defaultTransform } from '../lib/defaults'
  import StepField from './StepField.svelte'
  import type {
    BackfillSettings,
    BlendSettings,
    ImageTransform,
    MaskSettings,
    Point,
    Rect,
    Slot,
  } from '../lib/types'

  interface Props {
    slot: Slot | null
    index: number
    onAttach: (slotId: string, target: 'slot' | 'backfill') => void
    onClearImage: (slotId: string, target: 'slot' | 'backfill') => void
    onDelete: (slotId: string) => void
    onResetEffects: (slotId: string) => void
    onDetectBevel: (slotId: string) => void
    onTraceCutout: (slotId: string) => void
    onPatch: (slotId: string, patch: Partial<Slot>) => void
    onPatchBlend: (slotId: string, patch: Partial<BlendSettings>) => void
    onPatchBackfill: (slotId: string, patch: Partial<BackfillSettings>) => void
    onPatchMask: (slotId: string, patch: Partial<MaskSettings>) => void
    onPatchRect: (slotId: string, patch: Partial<Rect>) => void
    onPatchPoint: (slotId: string, index: number, point: Point) => void
    onResetGeometry: (slotId: string) => void
  }

  let {
    slot,
    index,
    onAttach,
    onClearImage,
    onDelete,
    onResetEffects,
    onDetectBevel,
    onTraceCutout,
    onPatch,
    onPatchBlend,
    onPatchBackfill,
    onPatchMask,
    onPatchRect,
    onPatchPoint,
    onResetGeometry,
  }: Props = $props()

  function num(event: Event): number {
    return Number((event.currentTarget as HTMLInputElement).value)
  }

  function str(event: Event): string {
    return (event.currentTarget as HTMLInputElement | HTMLSelectElement).value
  }

  function bool(event: Event): boolean {
    return (event.currentTarget as HTMLInputElement).checked
  }

  function setBlend<K extends keyof BlendSettings>(key: K, value: BlendSettings[K]): void {
    if (!slot) return
    onPatchBlend(slot.id, { [key]: value } as Partial<BlendSettings>)
  }

  function setBackfill<K extends keyof BackfillSettings>(
    key: K,
    value: BackfillSettings[K],
  ): void {
    if (!slot) return
    onPatchBackfill(slot.id, { [key]: value } as Partial<BackfillSettings>)
  }

  function setTransform(patch: Partial<ImageTransform>): void {
    if (!slot) return
    const current = slot.transform ?? defaultTransform()
    onPatch(slot.id, { transform: { ...current, ...patch } })
  }
</script>

<section class="panel-section">
  <header>
    <h2>Embed slot</h2>
    {#if slot}<span class="badge">#{index + 1}</span>{/if}
  </header>

  {#if !slot}
    <p class="muted">
      Select a slot on the canvas, or use <strong>Add slot</strong> and click four points to
      create one.
    </p>
  {:else}
    <div class="grid two">
      <label>
        <span>Name</span>
        <input
          type="text"
          value={slot.name}
          oninput={(event) => onPatch(slot.id, { name: str(event) })}
        />
      </label>
      <label>
        <span>Fit</span>
        <select value={slot.fit} onchange={(event) => onPatch(slot.id, { fit: str(event) as Slot['fit'] })}>
          <option value="cover">Cover (crop)</option>
          <option value="contain">Fit (bars)</option>
          <option value="stretch">Stretch</option>
        </select>
      </label>
    </div>

    {#if slot.shape === 'quad' && slot.points && slot.points.length === 4}
      <div class="row-between">
        <span class="field-label">Geometry</span>
        <span class="badge">Quad · 4 points</span>
        <button class="link" onclick={() => onResetGeometry(slot.id)}>Make rectangle</button>
      </div>
      <div class="corner-grid">
        {#each slot.points as point, cornerIndex}
          <div class="corner-row">
            <span class="corner-label">P{cornerIndex + 1}</span>
            <StepField
              value={Math.round(point.x)}
              axis="x"
              ariaLabel={`Point ${cornerIndex + 1} X`}
              onchange={(value) => onPatchPoint(slot.id, cornerIndex, { x: value, y: point.y })}
            />
            <StepField
              value={Math.round(point.y)}
              axis="y"
              ariaLabel={`Point ${cornerIndex + 1} Y`}
              onchange={(value) => onPatchPoint(slot.id, cornerIndex, { x: point.x, y: value })}
            />
          </div>
        {/each}
      </div>
      <p class="hint">
        Drag any corner on the canvas to move just that point; drag inside to move the quad.
        The bevel is applied in local space and warped with the quad.
      </p>
    {:else}
      <div class="grid two">
        <label>
          <span>X</span>
          <StepField
            value={slot.rect.x}
            axis="x"
            ariaLabel="Slot X"
            onchange={(value) => onPatchRect(slot.id, { x: value })}
          />
        </label>
        <label>
          <span>Y</span>
          <StepField
            value={slot.rect.y}
            axis="y"
            ariaLabel="Slot Y"
            onchange={(value) => onPatchRect(slot.id, { y: value })}
          />
        </label>
        <label>
          <span>W</span>
          <StepField
            value={slot.rect.w}
            axis="x"
            ariaLabel="Slot width"
            onchange={(value) => onPatchRect(slot.id, { w: value })}
          />
        </label>
        <label>
          <span>H</span>
          <StepField
            value={slot.rect.h}
            axis="y"
            ariaLabel="Slot height"
            onchange={(value) => onPatchRect(slot.id, { h: value })}
          />
        </label>
      </div>
      <p class="hint">
        Ctrl-drag a corner handle to pull that point independently and turn the slot into a quad.
      </p>
    {/if}

    <div class="stack">
      <div class="row-between">
        <span class="field-label">Embedded image</span>
        <code>{slot.imageFile ?? 'none'}</code>
      </div>
      <div class="button-row">
        <button class="primary" onclick={() => onAttach(slot.id, 'slot')}>
          {slot.imageFile ? 'Replace image' : 'Attach image'}
        </button>
        {#if slot.imageFile}
          <button onclick={() => onClearImage(slot.id, 'slot')}>Remove</button>
        {/if}
      </div>
      <p class="hint">Tip: you can also double-click the slot on the canvas, or drop an image file onto it.</p>
    </div>

    <div class="divider"></div>

    <header class="sub">
      <h3>Image framing</h3>
      <button class="link" onclick={() => setTransform(defaultTransform())}>
        Reset framing
      </button>
    </header>
    <label class="slider">
      <span>
        Zoom
        <small>{Math.round((slot.transform?.zoom ?? 1) * 100)}%</small>
      </span>
      <input
        type="range"
        min="10"
        max="400"
        step="1"
        value={Math.round((slot.transform?.zoom ?? 1) * 100)}
        oninput={(event) => setTransform({ zoom: num(event) / 100 })}
      />
    </label>
    <div class="grid two">
      <label>
        <span>Offset X <small>px</small></span>
        <StepField
          value={Math.round(slot.transform?.offsetX ?? 0)}
          axis="x"
          ariaLabel="Image offset X"
          onchange={(value) => setTransform({ offsetX: value })}
        />
      </label>
      <label>
        <span>Offset Y <small>px</small></span>
        <StepField
          value={Math.round(slot.transform?.offsetY ?? 0)}
          axis="y"
          ariaLabel="Image offset Y"
          onchange={(value) => setTransform({ offsetY: value })}
        />
      </label>
    </div>
    <p class="hint">
      Zoom and pan the embedded image inside the slot after the Fit mode is applied. Positive
      offsets move the image right and down; the slot mask still clips it.
    </p>

    <div class="divider"></div>

    <header class="sub">
      <h3>Shape &amp; bevel</h3>
    </header>
    <div class="grid two">
      <label>
        <span>Mask</span>
        <select
          value={slot.mask.mode}
          onchange={(event) => onPatchMask(slot.id, { mode: str(event) as MaskSettings['mode'] })}
        >
          <option value="rect">Rectangle</option>
          <option value="rounded">Rounded bevel</option>
          <option value="auto">Auto-trace cutout</option>
        </select>
      </label>
    </div>

    {#if slot.mask.mode === 'rounded'}
      <label class="slider">
        <span>Corner radius <small>{slot.mask.cornerRadius}px</small></span>
        <input
          type="range"
          min="0"
          max="240"
          value={slot.mask.cornerRadius}
          oninput={(event) => onPatchMask(slot.id, { cornerRadius: num(event) })}
        />
      </label>
      <label class="slider">
        <span>Bezel inset <small>{slot.mask.inset}px</small></span>
        <input
          type="range"
          min="0"
          max="80"
          value={slot.mask.inset}
          oninput={(event) => onPatchMask(slot.id, { inset: num(event) })}
        />
      </label>
      <p class="hint">
        {slot.shape === 'quad'
          ? 'Local bevel area (warped with the quad):'
          : 'Effective embed area:'}
        <strong>{Math.round(slot.rect.x + slot.mask.inset)}, {Math.round(slot.rect.y + slot.mask.inset)}</strong>
        ·
        <strong>{Math.max(1, Math.round(slot.rect.w - slot.mask.inset * 2))} × {Math.max(1, Math.round(slot.rect.h - slot.mask.inset * 2))} px</strong>
      </p>
    {:else if slot.mask.mode === 'auto'}
      <div class="grid two">
        <label>
          <span>Match against</span>
          <select
            value={slot.mask.autoSource}
            onchange={(event) => onPatchMask(slot.id, { autoSource: str(event) as MaskSettings['autoSource'] })}
          >
            <option value="auto">Auto (frame vs cutout)</option>
            <option value="surround">Surrounding frame</option>
            <option value="center">Cutout color</option>
          </select>
        </label>
        <label>
          <span>Color tolerance <small>{slot.mask.tolerance}</small></span>
          <input
            type="range"
            min="0"
            max="160"
            value={slot.mask.tolerance}
            oninput={(event) => onPatchMask(slot.id, { tolerance: num(event) })}
          />
        </label>
      </div>
      <label class="slider">
        <span>Bezel inset <small>{slot.mask.inset}px</small></span>
        <input
          type="range"
          min="0"
          max="80"
          value={slot.mask.inset}
          oninput={(event) => onPatchMask(slot.id, { inset: num(event) })}
        />
      </label>
      <p class="hint">
        Traces the slot area from the base image. "Surrounding frame" keeps pixels that differ
        from the frame; "Cutout color" keeps pixels close to the slot's center color. Useful for
        white/black cut-out templates.
      </p>
    {/if}

    <div class="button-row">
      <button onclick={() => onDetectBevel(slot.id)}>Detect bevel</button>
      <button onclick={() => onTraceCutout(slot.id)}>Trace cutout</button>
    </div>
    <p class="hint">
      Both actions trace the cutout from the base image and fit the slot's rectangle/quad to its
      oriented bounds. <strong>Detect bevel</strong> also applies a rounded radius/inset when the
      corners are reliable; otherwise the traced mask is used as the bevel. <strong>Trace
      cutout</strong> always keeps the traced mask, so the transform and bevel match the cutout
      even when it is askew. The dashed amber outline shows the clipping bevel.
    </p>

    <div class="divider"></div>

    <header class="sub">
      <h3>Backfill</h3>
    </header>
    <div class="grid two">
      <label>
        <span>Mode</span>
        <select
          value={slot.backfill.mode}
          onchange={(event) => setBackfill('mode', str(event) as BackfillSettings['mode'])}
        >
          <option value="none">Transparent</option>
          <option value="color">Solid color</option>
          <option value="image">Image</option>
        </select>
      </label>
      {#if slot.backfill.mode === 'color'}
        <label>
          <span>Color</span>
          <input
            type="color"
            value={slot.backfill.color}
            oninput={(event) => setBackfill('color', str(event))}
          />
        </label>
      {/if}
    </div>
    {#if slot.backfill.mode === 'image'}
      <div class="button-row">
        <button onclick={() => onAttach(slot.id, 'backfill')}>
          {slot.backfill.imageFile ? 'Replace backfill image' : 'Choose backfill image'}
        </button>
        {#if slot.backfill.imageFile}
          <button onclick={() => onClearImage(slot.id, 'backfill')}>Remove</button>
        {/if}
      </div>
      <code class="block-code">{slot.backfill.imageFile ?? 'none'}</code>
    {/if}
    <p class="hint">
      Backfill shows through transparent pixels in the embedded image. Handy for stickers or
      cut-out PNGs.
    </p>

    <div class="divider"></div>

    <header class="sub">
      <h3>Blend &amp; match</h3>
      <button class="link" onclick={() => onResetEffects(slot.id)}>Reset effects</button>
    </header>

    <label class="check">
      <input
        type="checkbox"
        checked={slot.blend.trimEdges}
        onchange={(event) => setBlend('trimEdges', bool(event))}
      />
      <span>Trim near-uniform white/black edges</span>
    </label>

    {#if slot.blend.trimEdges}
      <div class="grid two">
        <label>
          <span>Trim threshold</span>
          <input
            type="range"
            min="0"
            max="80"
            value={slot.blend.trimThreshold}
            oninput={(event) => setBlend('trimThreshold', num(event))}
          />
          <small>{slot.blend.trimThreshold}</small>
        </label>
        <label>
          <span>Border color</span>
          <select
            value={slot.blend.trimColor}
            onchange={(event) => setBlend('trimColor', str(event) as BlendSettings['trimColor'])}
          >
            <option value="auto">Auto detect</option>
            <option value="white">White</option>
            <option value="black">Black</option>
          </select>
        </label>
      </div>
    {/if}

    <label class="slider">
      <span>Edge feather <small>{slot.blend.feather}px</small></span>
      <input
        type="range"
        min="0"
        max="80"
        value={slot.blend.feather}
        oninput={(event) => setBlend('feather', num(event))}
      />
    </label>

    <label class="check">
      <input
        type="checkbox"
        checked={slot.blend.tint}
        onchange={(event) => setBlend('tint', bool(event))}
      />
      <span>Match surrounding color (tint)</span>
    </label>

    {#if slot.blend.tint}
      <label class="slider">
        <span>Tint strength <small>{slot.blend.tintStrength}%</small></span>
        <input
          type="range"
          min="0"
          max="100"
          value={slot.blend.tintStrength}
          oninput={(event) => setBlend('tintStrength', num(event))}
        />
      </label>
    {/if}

    <div class="grid two">
      <label>
        <span>Downscale width <small>{slot.blend.downscale === 0 ? 'off' : `${slot.blend.downscale}px`}</small></span>
        <input
          type="range"
          min="0"
          max="2048"
          step="16"
          value={slot.blend.downscale}
          oninput={(event) => setBlend('downscale', num(event))}
        />
      </label>
      <label>
        <span>Blur <small>{slot.blend.blur}px</small></span>
        <input
          type="range"
          min="0"
          max="30"
          step="0.5"
          value={slot.blend.blur}
          oninput={(event) => setBlend('blur', num(event))}
        />
      </label>
    </div>

    <label class="slider">
      <span>Brightness <small>{slot.blend.brightness}%</small></span>
      <input
        type="range"
        min="0"
        max="200"
        value={slot.blend.brightness}
        oninput={(event) => setBlend('brightness', num(event))}
      />
    </label>
    <label class="slider">
      <span>Saturation <small>{slot.blend.saturation}%</small></span>
      <input
        type="range"
        min="0"
        max="200"
        value={slot.blend.saturation}
        oninput={(event) => setBlend('saturation', num(event))}
      />
    </label>
    <label class="slider">
      <span>Opacity <small>{slot.blend.opacity}%</small></span>
      <input
        type="range"
        min="0"
        max="100"
        value={slot.blend.opacity}
        oninput={(event) => setBlend('opacity', num(event))}
      />
    </label>

    <header class="sub">
      <h3>Outer glow</h3>
    </header>
    <label class="check">
      <input
        type="checkbox"
        checked={slot.blend.glowEnabled}
        onchange={(event) => setBlend('glowEnabled', bool(event))}
      />
      <span>Glow outside the slot shape</span>
    </label>

    {#if slot.blend.glowEnabled}
      <div class="grid two">
        <label>
          <span>Color</span>
          <input
            type="color"
            value={slot.blend.glowColor}
            oninput={(event) => setBlend('glowColor', str(event))}
          />
        </label>
        <label>
          <span>Opacity <small>{slot.blend.glowOpacity}%</small></span>
          <input
            type="range"
            min="0"
            max="100"
            value={slot.blend.glowOpacity}
            oninput={(event) => setBlend('glowOpacity', num(event))}
          />
        </label>
      </div>
      <label class="slider">
        <span>Glow size <small>{slot.blend.glowSize}px</small></span>
        <input
          type="range"
          min="0"
          max="120"
          value={slot.blend.glowSize}
          oninput={(event) => setBlend('glowSize', num(event))}
        />
      </label>
      <p class="hint">
        The glow is drawn behind the image and outside the slot path, so it expands into the
        surrounding scene without tinting the embedded image.
      </p>
    {/if}

    <div class="divider"></div>
    <button class="danger" onclick={() => onDelete(slot.id)}>Delete this slot</button>
  {/if}
</section>

<style>
  .panel-section {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  header {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  header.sub {
    justify-content: space-between;
  }

  h2 {
    margin: 0;
    font-size: 13px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #9fb3c8;
  }

  h3 {
    margin: 0;
    font-size: 12px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: #7f94a9;
  }

  .badge {
    font-size: 11px;
    padding: 1px 7px;
    border-radius: 999px;
    background: rgba(76, 194, 255, 0.16);
    color: #8fd6ff;
    border: 1px solid rgba(76, 194, 255, 0.25);
  }

  .grid {
    display: grid;
    gap: 8px;
  }

  .grid.two {
    grid-template-columns: 1fr 1fr;
  }

  .corner-grid {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .corner-row {
    display: grid;
    grid-template-columns: 26px 1fr 1fr;
    gap: 6px;
    align-items: center;
  }

  .corner-label {
    font-size: 11px;
    color: #7f94a9;
    font-variant-numeric: tabular-nums;
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

  input[type='text'],
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

  input[type='color'] {
    width: 100%;
    height: 32px;
    background: #0f141b;
    border: 1px solid #263241;
    border-radius: 6px;
    padding: 2px;
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

  .check {
    flex-direction: row;
    align-items: center;
    gap: 8px;
    color: #cfdae6;
    font-size: 13px;
  }

  .slider {
    gap: 2px;
  }

  .field-label {
    font-size: 12px;
    color: #8ea3b8;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .row-between {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .button-row {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }

  .stack {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .divider {
    height: 1px;
    background: #1d2632;
    margin: 2px 0;
  }

  code {
    font-size: 11px;
    color: #7fd1a6;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 160px;
  }

  .block-code {
    display: block;
    max-width: 100%;
  }

  .hint {
    margin: 0;
    font-size: 11px;
    line-height: 1.45;
    color: #6f8499;
  }

  .muted {
    color: #8398ad;
    font-size: 13px;
    line-height: 1.5;
  }

  button {
    background: #18202b;
    color: #dbe6f1;
    border: 1px solid #2a3847;
    border-radius: 6px;
    padding: 6px 10px;
    font-size: 12px;
    cursor: pointer;
  }

  button:hover {
    border-color: #3d5266;
    background: #1d2835;
  }

  button.primary {
    background: linear-gradient(180deg, #1f6f9c, #17567a);
    border-color: #2b81b3;
    color: #eaf7ff;
  }

  button.danger {
    border-color: #5a2930;
    color: #ffb3bd;
    background: #241419;
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
