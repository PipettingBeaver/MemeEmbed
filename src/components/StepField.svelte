<script lang="ts">
  interface Props {
    value: number
    axis: 'x' | 'y'
    step?: number
    min?: number
    max?: number
    ariaLabel?: string
    onchange: (value: number) => void
  }

  let { value, axis, step = 1, min, max, ariaLabel, onchange }: Props = $props()

  function commit(next: number): void {
    let result = next
    if (min !== undefined) result = Math.max(min, result)
    if (max !== undefined) result = Math.min(max, result)
    onchange(result)
  }

  function input(event: Event): void {
    commit(Number((event.currentTarget as HTMLInputElement).value))
  }
</script>

<div class="stepper {axis}">
  <input
    type="number"
    {value}
    {step}
    aria-label={ariaLabel}
    oninput={input}
  />

  {#if axis === 'x'}
    <div class="row">
      <button
        type="button"
        class="arrow"
        aria-label={`${ariaLabel ?? 'Value'} decrease`}
        title="Decrease"
        onclick={() => commit(value - step)}
      >
        ◀
      </button>
      <button
        type="button"
        class="arrow"
        aria-label={`${ariaLabel ?? 'Value'} increase`}
        title="Increase"
        onclick={() => commit(value + step)}
      >
        ▶
      </button>
    </div>
  {:else}
    <div class="stack">
      <button
        type="button"
        class="arrow"
        aria-label={`${ariaLabel ?? 'Value'} decrease`}
        title="Decrease"
        onclick={() => commit(value - step)}
      >
        ▲
      </button>
      <button
        type="button"
        class="arrow"
        aria-label={`${ariaLabel ?? 'Value'} increase`}
        title="Increase"
        onclick={() => commit(value + step)}
      >
        ▼
      </button>
    </div>
  {/if}
</div>

<style>
  .stepper {
    display: flex;
    align-items: stretch;
    gap: 2px;
    min-width: 0;
  }

  input {
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
    background: #0f141b;
    color: #e6edf5;
    border: 1px solid #263241;
    border-radius: 6px;
    padding: 6px 6px;
    font-size: 13px;
    appearance: textfield;
    -moz-appearance: textfield;
  }

  input::-webkit-outer-spin-button,
  input::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  .arrow {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 20px;
    padding: 0;
    background: #18202b;
    color: #9fb3c8;
    border: 1px solid #2a3847;
    border-radius: 6px;
    font-size: 9px;
    line-height: 1;
    cursor: pointer;
  }

  .arrow:hover {
    border-color: #3d5266;
    background: #1d2835;
    color: #dbe6f1;
  }

  .row {
    display: flex;
    gap: 1px;
  }

  .row .arrow {
    flex: 1 1 0;
    min-width: 18px;
  }

  .stack {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .stack .arrow {
    flex: 1 1 0;
    min-height: 0;
  }
</style>
