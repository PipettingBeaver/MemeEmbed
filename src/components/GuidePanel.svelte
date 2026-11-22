<script lang="ts">
  import type { GuideSettings } from '../lib/types'

  interface Props {
    guides: GuideSettings
    onPatch: (patch: Partial<GuideSettings>) => void
  }

  let { guides, onPatch }: Props = $props()
</script>

<section class="panel-section">
  <header>
    <h2>Guidelines</h2>
  </header>

  <label class="check">
    <input
      type="checkbox"
      checked={guides.outlines}
      onchange={(event) => onPatch({ outlines: event.currentTarget.checked })}
    />
    <span>Show outlines for all slots</span>
  </label>
  <label class="check">
    <input
      type="checkbox"
      checked={guides.handles}
      onchange={(event) => onPatch({ handles: event.currentTarget.checked })}
    />
    <span>Vertex handles and P1–P4 labels</span>
  </label>
  <label class="check">
    <input
      type="checkbox"
      checked={guides.thirds}
      onchange={(event) => onPatch({ thirds: event.currentTarget.checked })}
    />
    <span>Rule of thirds</span>
  </label>
  <label class="check">
    <input
      type="checkbox"
      checked={guides.center}
      onchange={(event) => onPatch({ center: event.currentTarget.checked })}
    />
    <span>Center alignments</span>
  </label>
  <label class="check">
    <input
      type="checkbox"
      checked={guides.measurements}
      onchange={(event) => onPatch({ measurements: event.currentTarget.checked })}
    />
    <span>Measurement grid</span>
  </label>
  <p class="hint">
    Unselected slots stay hidden unless "Show outlines" is enabled. The selected slot always
    shows its outline, handles, and label.
  </p>
</section>

<style>
  .panel-section {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  header {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  h2 {
    margin: 0;
    font-size: 13px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #9fb3c8;
  }

  .check {
    display: flex;
    align-items: center;
    gap: 8px;
    color: #cfdae6;
    font-size: 13px;
    cursor: pointer;
  }

  .check input {
    accent-color: #4cc2ff;
  }

  .hint {
    margin: 0;
    font-size: 11px;
    line-height: 1.45;
    color: #6f8499;
  }
</style>
