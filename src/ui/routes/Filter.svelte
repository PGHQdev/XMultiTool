<script lang="ts">
import type { Field } from '../../core/settings/schema'
import { coerce } from '../../core/settings/schema'
import { toolEnabled } from '../../core/settings/store'
import { cleanTool, REASON_BY_FIELD } from '../../core/tools/clean'
import { restoreControl } from '../controls/restore-control'
import { patchTool, setEnabled, ui } from '../state.svelte'

type Entry = [string, Field]

const entries = Object.entries(cleanTool.settings) as Entry[]
const rules = entries.filter(([, field]) => field.type === 'boolean')
const lists = entries.filter(([, field]) => field.type === 'stringList')
const numbers = entries.filter(([, field]) => field.type === 'number')

const on = $derived(ui.settings ? toolEnabled(ui.settings, cleanTool) : false)
const values = $derived(
  coerce(
    cleanTool.settings,
    ui.settings?.tools[cleanTool.id] ?? {},
  ) as unknown as Record<string, unknown>,
)

const countFor = (key: string): number =>
  ui.stats?.byReason[REASON_BY_FIELD[key as keyof typeof REASON_BY_FIELD]] ?? 0

const lines = (value: unknown): string =>
  ((value as string[] | undefined) ?? []).join('\n')

const toList = (text: string): string[] =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
</script>

<header class="hero">
  <div class="reading">
    {#if ui.stats}
      <p class="figure">{ui.stats.dimmed}</p>
      <p class="caption">dimmed of {ui.stats.seen} posts read on this tab</p>
    {:else}
      <p class="waiting">Open an x.com tab to see what it caught.</p>
    {/if}
  </div>
  <input
    type="checkbox"
    checked={on}
    aria-label={cleanTool.name}
    onchange={async (e) => {
      const target = e.currentTarget
      const previous = on
      const ok = await setEnabled(cleanTool.id, target.checked)
      if (!ok) restoreControl(target, previous)
    }}
  />
</header>

<section class:off={!on}>
  <h2>Rules</h2>
  {#each rules as [key, field] (key)}
    <label class="row">
      <span class="labels">
        <span class="label">{field.label}</span>
        {#if field.help}<span class="help">{field.help}</span>{/if}
      </span>
      <span class="controls">
        {#if countFor(key) > 0}<span class="count">{countFor(key)}</span>{/if}
        <input
          type="checkbox"
          checked={values[key] === true}
          onchange={async (e) => {
            const target = e.currentTarget
            const previous = values[key] === true
            const ok = await patchTool(cleanTool.id, { [key]: target.checked })
            if (!ok) restoreControl(target, previous)
          }}
        />
      </span>
    </label>
  {/each}

  {#each lists as [key, field] (key)}
    <div class="block">
      <div class="labels">
        <span class="label">{field.label}</span>
        {#if countFor(key) > 0}<span class="count">{countFor(key)}</span>{/if}
      </div>
      {#if field.help}<span class="help">{field.help}</span>{/if}
      <textarea
        rows="3"
        aria-label={field.label}
        value={lines(values[key])}
        onchange={async (e) => {
          const target = e.currentTarget
          const previous = lines(values[key])
          const ok = await patchTool(cleanTool.id, {
            [key]: toList(target.value),
          })
          if (!ok) restoreControl(target, previous)
        }}
      ></textarea>
    </div>
  {/each}

  {#each numbers as [key, field] (key)}
    <label class="row">
      <span class="labels">
        <span class="label">{field.label}</span>
        {#if field.help}<span class="help">{field.help}</span>{/if}
      </span>
      <span class="controls">
        {#if countFor(key) > 0}<span class="count">{countFor(key)}</span>{/if}
        <input
          type="number"
          min={field.type === 'number' ? field.min : undefined}
          value={values[key] as number}
          onchange={async (e) => {
            const target = e.currentTarget
            const previous = values[key] as number
            const ok = await patchTool(cleanTool.id, {
              [key]: Number(target.value),
            })
            if (!ok) restoreControl(target, String(previous))
          }}
        />
      </span>
    </label>
  {/each}
</section>

<style>
  .hero { display: flex; align-items: center; gap: 16px; padding: 20px 16px; border-bottom: 1px solid var(--xmt-border); }
  .reading { flex: 1; }
  .figure { font-size: 40px; font-weight: 800; line-height: 1; margin: 0; letter-spacing: -0.02em; }
  .waiting { margin: 0; color: var(--xmt-text-muted); }
  .caption { margin: 6px 0 0; color: var(--xmt-text-muted); font-size: var(--xmt-text-size-small); }
  section { transition: opacity var(--xmt-motion); }
  section.off { opacity: 0.4; pointer-events: none; }
  h2 { font-size: var(--xmt-text-size-small); text-transform: uppercase; letter-spacing: 0.06em; padding: 18px 16px 6px; margin: 0; color: var(--xmt-text-muted); }
  .row { display: flex; gap: 12px; align-items: center; justify-content: space-between; padding: 12px 16px; border-bottom: 1px solid var(--xmt-border); cursor: pointer; }
  .row:hover { background: var(--xmt-bg-hover); }
  .block { display: flex; flex-direction: column; gap: 6px; padding: 12px 16px; border-bottom: 1px solid var(--xmt-border); }
  .labels { display: flex; flex-direction: column; gap: 2px; }
  .block .labels { flex-direction: row; align-items: center; gap: 8px; }
  .label { font-weight: 700; }
  .help { color: var(--xmt-text-muted); font-size: var(--xmt-text-size-small); }
  .controls { display: flex; align-items: center; gap: 12px; }
  .count { font-variant-numeric: tabular-nums; font-weight: 700; font-size: var(--xmt-text-size-small); color: var(--xmt-accent); background: color-mix(in srgb, var(--xmt-accent) 14%, transparent); border-radius: var(--xmt-radius-pill); padding: 2px 8px; }
</style>
