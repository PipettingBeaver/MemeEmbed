<script lang="ts">
  import type { MemeTemplate, TextLayer } from '../lib/types'

  interface Props {
    text: MemeTemplate['text']
    onPatch: (position: 'top' | 'bottom', patch: Partial<TextLayer>) => void
  }

  let { text, onPatch }: Props = $props()

  const positions = ['top', 'bottom'] as const

  const fonts = [
    "Impact, 'Arial Black', sans-serif",
    "'Arial Black', Arial, sans-serif",
    'Arial, Helvetica, sans-serif',
    'Georgia, serif',
    "'Comic Sans MS', cursive",
    'monospace',
  ]

  function str(event: Event): string {
    return (event.currentTarget as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement)
      .value
  }

  function num(event: Event): number {
    return Number((event.currentTarget as HTMLInputElement).value)
  }

  function bool(event: Event): boolean {
    return (event.currentTarget as HTMLInputElement).checked
  }
</script>

<section class="panel-section">
  <header>
    <h2>Top &amp; bottom text</h2>
  </header>

  {#each positions as position}
    {@const layer = text[position]}
    <div class="layer" class:active={layer.enabled}>
      <label class="check">
        <input
          type="checkbox"
          checked={layer.enabled}
          onchange={(event) => onPatch(position, { enabled: bool(event) })}
        />
        <span>{position === 'top' ? 'Top text' : 'Bottom text'}</span>
      </label>

      {#if layer.enabled}
        <textarea
          rows="2"
          placeholder={position === 'top' ? 'TOP TEXT' : 'BOTTOM TEXT'}
          value={layer.text}
          oninput={(event) => onPatch(position, { text: str(event) })}
        ></textarea>

        <div class="grid two">
          <label>
            <span>Font</span>
            <select
              value={layer.fontFamily}
              onchange={(event) => onPatch(position, { fontFamily: str(event) })}
            >
              {#each fonts as font}
                <option value={font}>{font.split(',')[0].replaceAll("'", '')}</option>
              {/each}
            </select>
          </label>
          <label>
            <span>Size</span>
            <input
              type="number"
              min="8"
              max="400"
              value={layer.fontSize}
              oninput={(event) => onPatch(position, { fontSize: num(event) })}
            />
          </label>
        </div>

        <div class="grid two">
          <label>
            <span>Fill</span>
            <input
              type="color"
              value={layer.color}
              oninput={(event) => onPatch(position, { color: str(event) })}
            />
          </label>
          <label>
            <span>Outline</span>
            <input
              type="color"
              value={layer.strokeColor}
              oninput={(event) => onPatch(position, { strokeColor: str(event) })}
            />
          </label>
        </div>

        <label class="slider">
          <span>Outline width <small>{layer.strokeWidth}px</small></span>
          <input
            type="range"
            min="0"
            max="30"
            value={layer.strokeWidth}
            oninput={(event) => onPatch(position, { strokeWidth: num(event) })}
          />
        </label>
        <label class="slider">
          <span>Line spacing <small>{layer.lineSpacing.toFixed(2)}</small></span>
          <input
            type="range"
            min="0.8"
            max="1.8"
            step="0.05"
            value={layer.lineSpacing}
            oninput={(event) => onPatch(position, { lineSpacing: num(event) })}
          />
        </label>
        <label class="check">
          <input
            type="checkbox"
            checked={layer.uppercase}
            onchange={(event) => onPatch(position, { uppercase: bool(event) })}
          />
          <span>Uppercase</span>
        </label>
      {/if}
    </div>
  {/each}
</section>

<style>
  .panel-section {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  h2 {
    margin: 0;
    font-size: 13px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #9fb3c8;
  }

  .layer {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px;
    border: 1px solid #1d2632;
    border-radius: 8px;
    background: #0d1218;
  }

  .layer.active {
    border-color: #274158;
    background: #0e151d;
  }

  .grid {
    display: grid;
    gap: 8px;
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

  .check {
    flex-direction: row;
    align-items: center;
    gap: 8px;
    color: #cfdae6;
    font-size: 13px;
  }

  textarea,
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
    font-family: inherit;
    resize: vertical;
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

  .slider {
    gap: 2px;
  }

  small {
    color: #6f8499;
    font-variant-numeric: tabular-nums;
  }
</style>
