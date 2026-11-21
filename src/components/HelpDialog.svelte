<script lang="ts">
  interface Props {
    open: boolean
    onClose: () => void
  }

  let { open, onClose }: Props = $props()
</script>

{#if open}
  <div
    class="overlay"
    role="presentation"
    onclick={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}
  >
    <div
      class="dialog"
      role="dialog"
      aria-modal="true"
      aria-label="Help"
      tabindex="-1"
      onkeydown={(event) => {
        if (event.key === 'Escape') onClose()
      }}
    >
      <header>
        <h2>MemeEmbed help</h2>
        <button class="icon" onclick={onClose} aria-label="Close help">×</button>
      </header>

      <div class="content">
        <section>
          <h3>Quick start</h3>
          <ol>
            <li>Pick a template on the left, or click <strong>New from image</strong>.</li>
            <li>Click a slot on the canvas, then <strong>Attach image</strong> (or double-click the slot, or drop an image onto it).</li>
            <li>Tune <strong>Blend &amp; match</strong> until it sits into the scene.</li>
            <li>Optionally enable <strong>Top</strong> / <strong>Bottom text</strong>.</li>
            <li><strong>Save</strong> (or <strong>Save as copy</strong>) and <strong>Export PNG</strong>.</li>
          </ol>
        </section>

        <section>
          <h3>Creating and editing slots</h3>
          <ul>
            <li><strong>Add slot</strong> enters 4-point mode. Click four corners; MemeEmbed creates a quad, or a rectangle when the points are axis-aligned.</li>
            <li>Click a slot to select it, drag inside to move it, drag the eight handles to resize.</li>
            <li><strong>Ctrl-drag</strong> a rectangle corner (Cmd on macOS) to pull that point independently; the slot becomes a four-point quad.</li>
            <li>In quad mode, drag any corner to move that point, or drag inside to move the whole quad. <strong>Make rectangle</strong> in the inspector converts it back.</li>
            <li>The X/Y/W/H fields control rectangles; quad mode shows editable coordinates for all four points. Coordinates are in base-image pixels.</li>
            <li>Slots are generic: every template can hold any number of slots, and the bevel is computed in local slot space then warped with the quad.</li>
          </ul>
        </section>

        <section>
          <h3>Undo and redo</h3>
          <p>
            <strong>Ctrl+Z</strong> undoes the last canvas change;
            <strong>Ctrl+Shift+Z</strong> or <strong>Ctrl+Y</strong> redoes it. Undo covers slot
            geometry/points, bevel and mask settings, blend and backfill, text, adding/deleting
            slots, and attaching/removing images.
          </p>
          <p class="hint">
            Undo works even when a text field or slider is focused. The editor toolbar also has
            Undo/Redo buttons.
          </p>
        </section>

        <section>
          <h3>Shape &amp; bevel</h3>
          <ul>
            <li><strong>Rectangle</strong> keeps the slot rectangular.</li>
            <li><strong>Rounded bevel</strong> rounds the corners and can inset the image from the bezel, which suits CRT screens and other rounded cut-outs.</li>
            <li><strong>Auto-trace cutout</strong> derives a mask from the base image inside the slot. It is useful for the white/black cut-out shapes common in meme templates.</li>
            <li><strong>Detect bevel</strong> traces the cutout, fits the slot's transform to its oriented rectangle/quad, then applies a rounded radius/inset when the corners are reliable. If the shape is noisy (for example a CRT screen with internal content), it keeps the traced mask as the bevel instead of applying a bad radius.</li>
            <li><strong>Trace cutout</strong> also fits the slot's transform to the traced cutout, including askew/oriented quads, and keeps the traced mask as the bevel. Adjust the match/tolerance if the traced shape is too tight or too loose.</li>
          </ul>
          <p>
            The editor shows the bevel as a dashed amber guide inside the blue slot, and tints the
            active embed shape blue before an image is attached.
          </p>
        </section>

        <section>
          <h3>Blend &amp; match effects</h3>
          <ul>
            <li><strong>Trim edges</strong> detects near-uniform white or black borders on the attached image and crops them before fitting.</li>
            <li><strong>Edge feather</strong> softens the slot border so the image melts into the scene.</li>
            <li><strong>Tint</strong> samples the base image just around the slot and shifts the attached image toward that color.</li>
            <li><strong>Downscale width</strong> renders the image at a lower resolution before scaling up, matching a low-res screen.</li>
            <li><strong>Blur</strong>, <strong>brightness</strong>, <strong>saturation</strong> and <strong>opacity</strong> are manual finishing controls.</li>
            <li><strong>Backfill</strong> paints behind transparent pixels, using a color or another image.</li>
          </ul>
        </section>

        <section>
          <h3>Templates and storage</h3>
          <p>
            Templates are saved in <strong>this browser</strong> using IndexedDB, including their
            base image and embedded images. <strong>Save</strong> updates the current template and
            <strong>Save as copy</strong> creates a new one. <strong>Export PNG</strong> downloads a
            flattened meme.
          </p>
          <p>
            Use <strong>Export template</strong> to download a portable
            <code>.memeembed.json</code> bundle with the images embedded, and
            <strong>Import template</strong> to restore it in another browser or after clearing site
            data.
          </p>
        </section>

        <section>
          <h3>Credits and ownership</h3>
          <p>
            I don't own any of the bundled meme images. Rights remain with their original creators;
            the templates are included for meme editing and demonstration. If you are a rights
            holder and want a template removed, open an issue on the project repository.
          </p>
        </section>

        <section>
          <h3>Troubleshooting</h3>
          <ul>
            <li>Open <strong>Logs</strong> to see what the app is doing; errors and stack traces are captured there.</li>
            <li><strong>Run self-test</strong> checks browser storage, the template index, every template's assets, and the bundled presets.</li>
            <li><strong>Restore presets</strong> re-seeds the bundled templates without touching your saved copies.</li>
            <li>Clearing this site's browser data removes your templates — export any you want to keep first.</li>
          </ul>
        </section>
      </div>
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 50;
    background: rgba(3, 6, 10, 0.72);
    backdrop-filter: blur(3px);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }

  .dialog {
    width: min(760px, 100%);
    max-height: min(84vh, 900px);
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
    padding: 16px 20px;
    border-bottom: 1px solid #1d2632;
  }

  h2 {
    margin: 0;
    font-size: 16px;
    color: #e6edf5;
  }

  h3 {
    margin: 0 0 8px;
    font-size: 12px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #7f94a9;
  }

  .content {
    overflow: auto;
    padding: 18px 20px 24px;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  ol,
  ul {
    margin: 0;
    padding-left: 20px;
    color: #c3d2e1;
    font-size: 13px;
    line-height: 1.6;
  }

  p {
    margin: 0 0 8px;
    color: #c3d2e1;
    font-size: 13px;
    line-height: 1.6;
  }

  code {
    font-size: 12px;
    color: #7fd1a6;
    overflow-wrap: anywhere;
  }

  button.icon {
    background: none;
    border: none;
    color: #8fa3b8;
    font-size: 24px;
    line-height: 1;
    cursor: pointer;
    padding: 0 4px;
  }

  button.icon:hover {
    color: #e6edf5;
  }
</style>
