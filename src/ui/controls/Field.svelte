<script lang="ts">
import type { Field } from '../../core/settings/schema'
import { controlFor } from './control-for'

let {
  field,
  value,
  onchange,
}: {
  field: Field
  value: unknown
  onchange: (next: unknown) => Promise<boolean>
} = $props()

const control = $derived(controlFor(field))
</script>

<label class="row">
  <span class="labels">
    <span class="label">{field.label}</span>
    {#if field.help}<span class="help">{field.help}</span>{/if}
  </span>

  {#if control === 'switch'}
    <input
      type="checkbox"
      checked={value === true}
      onchange={async (e) => {
        const target = e.currentTarget
        const previous = value === true
        const ok = await onchange(target.checked)
        if (!ok) target.checked = previous
      }}
    />
  {:else if control === 'number'}
    <input
      type="number"
      value={value as number}
      onchange={async (e) => {
        const target = e.currentTarget
        const previous = value as number
        const ok = await onchange(Number(target.value))
        if (!ok) target.value = String(previous)
      }}
    />
  {:else if control === 'text'}
    <input
      type="text"
      value={value as string}
      onchange={async (e) => {
        const target = e.currentTarget
        const previous = value as string
        const ok = await onchange(target.value)
        if (!ok) target.value = previous
      }}
    />
  {:else if control === 'select' && field.type === 'enum'}
    <select
      value={value as string}
      onchange={async (e) => {
        const target = e.currentTarget
        const previous = value as string
        const ok = await onchange(target.value)
        if (!ok) target.value = previous
      }}
    >
      {#each field.options as option (option.value)}
        <option value={option.value}>{option.label}</option>
      {/each}
    </select>
  {:else if control === 'list'}
    <textarea
      rows="4"
      value={(value as string[] | undefined)?.join('\n') ?? ''}
      onchange={async (e) => {
        const target = e.currentTarget
        const previous = (value as string[] | undefined)?.join('\n') ?? ''
        const ok = await onchange(
          target.value
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean),
        )
        if (!ok) target.value = previous
      }}
    ></textarea>
  {/if}
</label>

<style>
  .row {
    display: flex;
    gap: 12px;
    align-items: flex-start;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid var(--xmt-border);
  }
  .labels { display: flex; flex-direction: column; gap: 2px; }
  .label { font-weight: 700; }
  .help { color: var(--xmt-text-muted); font-size: var(--xmt-text-size-small); }
</style>
