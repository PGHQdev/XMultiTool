<script lang="ts">
import { coerce } from '../../core/settings/schema'
import { toolEnabled } from '../../core/settings/store'
import type { Tool } from '../../core/types'
import { patchTool, setEnabled, ui } from '../state.svelte'
import Field from './Field.svelte'
import { restoreControl } from './restore-control'

// The generic renderer, for any tool without a screen of its own.
let { tool }: { tool: Tool<any> } = $props()

const enabled = $derived(ui.settings ? toolEnabled(ui.settings, tool) : false)
const values = $derived(
  coerce(tool.settings, ui.settings?.tools[tool.id] ?? {}) as Record<
    string,
    unknown
  >,
)
</script>

<section>
  <header class="row">
    <span class="labels">
      <span class="label">{tool.name}</span>
      <span class="help">{tool.description}</span>
    </span>
    <input
      type="checkbox"
      checked={enabled}
      aria-label={tool.name}
      onchange={async (e) => {
        const target = e.currentTarget
        const previous = enabled
        const ok = await setEnabled(tool.id, target.checked)
        if (!ok) restoreControl(target, previous)
      }}
    />
  </header>

  {#if enabled}
    {#each Object.entries(tool.settings) as [key, field] (key)}
      <Field {field} value={values[key]} onchange={(next) => patchTool(tool.id, { [key]: next })} />
    {/each}
  {/if}
</section>

<style>
  .row { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 12px 16px; border-bottom: 1px solid var(--xmt-border); }
  .labels { display: flex; flex-direction: column; gap: 2px; }
  .label { font-weight: 700; }
  .help { color: var(--xmt-text-muted); font-size: var(--xmt-text-size-small); }
</style>
