<script lang="ts">
  import type { TemplateSummary } from '../lib/types'

  interface Props {
    templates: TemplateSummary[]
    currentId: string | null
    busy: boolean
    onOpen: (id: string) => void
    onNew: () => void
    onRefresh: () => void
    onRestorePresets: () => void
    onImport: () => void
    onExport: () => void
    onDelete: (id: string) => void
  }

  let {
    templates,
    currentId,
    busy,
    onOpen,
    onNew,
    onRefresh,
    onRestorePresets,
    onImport,
    onExport,
    onDelete,
  }: Props = $props()

  let query = $state('')

  const filtered = $derived(
    templates.filter((template) =>
      template.name.toLowerCase().includes(query.trim().toLowerCase()),
    ),
  )
</script>

<aside class="sidebar">
  <div class="top">
    <button class="primary new" onclick={onNew} disabled={busy}>+ New from image</button>
    <input
      class="search"
      type="search"
      placeholder="Search templates"
      bind:value={query}
    />
  </div>

  <div class="list">
    {#if filtered.length === 0}
      <p class="empty">
        {templates.length === 0
          ? 'No templates yet. Create one from an image or restore the bundled presets.'
          : 'No templates match that search.'}
      </p>
    {:else}
      {#each filtered as template (template.id)}
        <div class="item" class:active={template.id === currentId}>
          <button class="open" onclick={() => onOpen(template.id)} disabled={busy}>
            <span class="name">{template.name}</span>
            <span class="meta">
              {template.width}×{template.height} · {template.slotCount} slot{template.slotCount === 1 ? '' : 's'}
            </span>
          </button>
          <button
            class="remove"
            title="Delete template"
            aria-label={`Delete ${template.name}`}
            onclick={(event) => {
              event.stopPropagation()
              onDelete(template.id)
            }}
            disabled={busy}
          >×</button>
        </div>
      {/each}
    {/if}
  </div>

  <div class="bottom">
    <button onclick={onRefresh} disabled={busy}>Refresh</button>
    <button onclick={onRestorePresets} disabled={busy}>Restore presets</button>
    <button onclick={onImport} disabled={busy}>Import template</button>
    <button onclick={onExport} disabled={busy || !currentId}>Export template</button>
  </div>
</aside>

<style>
  .sidebar {
    display: flex;
    flex-direction: column;
    min-height: 0;
    background: #0d1218;
    border-right: 1px solid #1d2632;
  }

  .top {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
    border-bottom: 1px solid #1d2632;
  }

  .new {
    width: 100%;
  }

  .search {
    width: 100%;
    box-sizing: border-box;
    background: #0f141b;
    color: #e6edf5;
    border: 1px solid #263241;
    border-radius: 6px;
    padding: 6px 8px;
    font-size: 12px;
  }

  .list {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .item {
    display: flex;
    align-items: stretch;
    border: 1px solid transparent;
    border-radius: 7px;
    background: #111821;
    overflow: hidden;
  }

  .item:hover {
    border-color: #263241;
  }

  .item.active {
    border-color: #2f7196;
    background: #12212e;
  }

  .open {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
    align-items: flex-start;
    text-align: left;
    background: none;
    border: none;
    padding: 9px 10px;
    cursor: pointer;
  }

  .name {
    font-size: 13px;
    color: #e6edf5;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }

  .meta {
    font-size: 11px;
    color: #6f8499;
    font-variant-numeric: tabular-nums;
  }

  .remove {
    background: none;
    border: none;
    color: #5d7186;
    font-size: 18px;
    line-height: 1;
    padding: 0 9px;
    cursor: pointer;
  }

  .remove:hover {
    color: #ff8f9e;
    background: rgba(255, 143, 158, 0.08);
  }

  .empty {
    margin: 12px 6px;
    color: #6f8499;
    font-size: 12px;
    line-height: 1.5;
  }

  .bottom {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
    padding: 10px 12px;
    border-top: 1px solid #1d2632;
  }

  button {
    background: #18202b;
    color: #dbe6f1;
    border: 1px solid #2a3847;
    border-radius: 6px;
    padding: 6px 9px;
    font-size: 12px;
    cursor: pointer;
  }

  button:hover:not(:disabled) {
    border-color: #3d5266;
    background: #1d2835;
  }

  button:disabled {
    opacity: 0.5;
    cursor: default;
  }

  button.primary {
    background: linear-gradient(180deg, #1f6f9c, #17567a);
    border-color: #2b81b3;
    color: #eaf7ff;
  }
</style>
