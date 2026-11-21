<script lang="ts">
  import { logs } from '../lib/log.svelte'
  import type { SelfTestItem } from '../lib/types'

  interface Props {
    open: boolean
    selfTest: SelfTestItem[]
    onClose: () => void
    onClear: () => void
    onSelfTest: () => void
    onCopy: () => void
  }

  let { open, selfTest, onClose, onClear, onSelfTest, onCopy }: Props = $props()
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
      aria-label="Logs"
      tabindex="-1"
      onkeydown={(event) => {
        if (event.key === 'Escape') onClose()
      }}
    >
      <header>
        <h2>Troubleshooting log</h2>
        <div class="actions">
          <button onclick={onSelfTest}>Run self-test</button>
          <button onclick={onCopy}>Copy</button>
          <button onclick={onClear}>Clear</button>
          <button class="icon" onclick={onClose} aria-label="Close logs">×</button>
        </div>
      </header>

      {#if selfTest.length > 0}
        <div class="self-test">
          {#each selfTest as item}
            <div class="test" class:ok={item.ok}>
              <span class="mark">{item.ok ? '✓' : '✕'}</span>
              <span class="name">{item.name}</span>
              <span class="detail">{item.detail}</span>
            </div>
          {/each}
        </div>
      {/if}

      <div class="entries">
        {#if logs.entries.length === 0}
          <p class="empty">No log entries yet.</p>
        {:else}
          {#each logs.entries as entry (entry.id)}
            <div class="entry {entry.level}">
              <span class="time">{entry.time}</span>
              <span class="level">{entry.level}</span>
              <span class="message">{entry.message}</span>
              {#if entry.detail}<pre>{entry.detail}</pre>{/if}
            </div>
          {/each}
        {/if}
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
    width: min(860px, 100%);
    max-height: min(84vh, 900px);
    display: flex;
    flex-direction: column;
    background: #0d1319;
    border: 1px solid #263241;
    border-radius: 12px;
    box-shadow: 0 30px 80px rgba(0, 0, 0, 0.6);
    overflow: hidden;
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 14px 18px;
    border-bottom: 1px solid #1d2632;
  }

  h2 {
    margin: 0;
    font-size: 15px;
    color: #e6edf5;
  }

  .actions {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  button {
    background: #18202b;
    color: #dbe6f1;
    border: 1px solid #2a3847;
    border-radius: 6px;
    padding: 5px 9px;
    font-size: 12px;
    cursor: pointer;
  }

  button:hover {
    border-color: #3d5266;
    background: #1d2835;
  }

  button.icon {
    background: none;
    border: none;
    color: #8fa3b8;
    font-size: 22px;
    line-height: 1;
    padding: 0 4px;
  }

  .self-test {
    padding: 12px 18px;
    border-bottom: 1px solid #1d2632;
    display: flex;
    flex-direction: column;
    gap: 4px;
    max-height: 220px;
    overflow: auto;
    background: #0b1015;
  }

  .test {
    display: grid;
    grid-template-columns: 18px 190px 1fr;
    gap: 8px;
    font-size: 12px;
    color: #c3d2e1;
  }

  .test .mark {
    color: #ff8f9e;
    font-weight: 700;
  }

  .test.ok .mark {
    color: #5fd39a;
  }

  .test .name {
    color: #9fb3c8;
  }

  .test .detail {
    color: #7f94a9;
    overflow-wrap: anywhere;
  }

  .entries {
    overflow: auto;
    padding: 10px 18px 18px;
    font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
    font-size: 12px;
    line-height: 1.5;
  }

  .empty {
    color: #6f8499;
    font-family: inherit;
  }

  .entry {
    display: grid;
    grid-template-columns: 84px 58px 1fr;
    gap: 8px;
    padding: 2px 0;
    border-bottom: 1px solid rgba(29, 38, 50, 0.4);
    color: #c3d2e1;
  }

  .entry .time {
    color: #6f8499;
  }

  .entry .level {
    text-transform: uppercase;
    font-size: 10px;
    letter-spacing: 0.05em;
    padding-top: 2px;
    color: #7f94a9;
  }

  .entry.error .level,
  .entry.error .message {
    color: #ff8f9e;
  }

  .entry.warn .level {
    color: #ffd25a;
  }

  .entry.success .level {
    color: #5fd39a;
  }

  pre {
    grid-column: 1 / -1;
    margin: 2px 0 6px;
    padding: 6px 8px;
    background: #0a0f14;
    border-radius: 4px;
    color: #8fa3b8;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
</style>
