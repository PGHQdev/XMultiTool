<script lang="ts">
import { coerce } from '../../core/settings/schema'
import { CORE_TOOLS } from '../../core/tools/index'
import Field from '../controls/Field.svelte'
import { restoreControl } from '../controls/restore-control'
import { patchTool, setEnabled, ui } from '../state.svelte'

const modules = ['core', 'reading', 'export', 'author'] as const
</script>

{#each modules as module (module)}
  {@const tools = CORE_TOOLS.filter((t) => t.module === module)}
  {#if tools.length > 0}
    <h2>{module}</h2>
    {#each tools as tool (tool.id)}
      {@const enabled = ui.settings?.enabled[tool.id] === true}
      {@const values = coerce(tool.settings, ui.settings?.tools[tool.id] ?? {}) as Record<string, unknown>}
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
    {/each}
  {/if}
{/each}

<style>
  h2 { text-transform: capitalize; font-size: var(--xmt-text-size); padding: 16px 16px 4px; margin: 0; color: var(--xmt-text-muted); }
  .row { display: flex; justify-content: space-between; gap: 12px; padding: 12px 16px; border-bottom: 1px solid var(--xmt-border); }
  .labels { display: flex; flex-direction: column; gap: 2px; }
  .label { font-weight: 700; }
  .help { color: var(--xmt-text-muted); font-size: var(--xmt-text-size-small); }
</style>
