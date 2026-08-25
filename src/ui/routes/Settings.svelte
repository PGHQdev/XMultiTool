<script lang="ts">
import type { ThemeChoice } from '../../core/settings/store'
import { restoreControl } from '../controls/restore-control'
import { exportConfig, importConfig, setTheme, ui } from '../state.svelte'

const themes: ThemeChoice[] = ['auto', 'light', 'dim', 'lights-out']
let importText = $state('')

async function downloadConfig() {
  const text = await exportConfig()
  if (text === null) return
  const url = URL.createObjectURL(
    new Blob([text], { type: 'application/json' }),
  )
  const link = document.createElement('a')
  link.href = url
  link.download = 'xmultitool-config.json'
  // Firefox follows a download click only on an anchor that is in the document, and
  // revoking the URL in the same tick can cancel the download before it starts.
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

async function submitImport() {
  if (await importConfig(importText)) importText = ''
}
</script>

<section>
  <h2>Theme</h2>
  <div class="row">
    <select
      aria-label="Theme"
      value={ui.settings?.ui.theme ?? 'auto'}
      onchange={async (e) => {
        const target = e.currentTarget
        const previous = ui.settings?.ui.theme ?? 'auto'
        const ok = await setTheme(target.value as ThemeChoice)
        if (!ok) restoreControl(target, previous)
      }}
    >
      {#each themes as theme (theme)}<option value={theme}>{theme}</option>{/each}
    </select>
  </div>

  <h2>Config</h2>
  <div class="row"><button onclick={downloadConfig}>Export config</button></div>
  <div class="row">
    <textarea rows="4" bind:value={importText} placeholder="Paste a config file"></textarea>
    <button onclick={submitImport} disabled={!importText}>Import</button>
  </div>

  <h2>Selector health</h2>
  {#each ui.health as entry (entry.id)}
    <div class="row"><span>{entry.id}</span><span>{entry.healthy ? 'ok' : 'stale'} ({entry.matches})</span></div>
  {:else}
    <p class="empty">No readings yet.</p>
  {/each}
</section>

<style>
  h2 { font-size: var(--xmt-text-size); padding: 16px 16px 4px; margin: 0; color: var(--xmt-text-muted); }
  .row { display: flex; gap: 12px; justify-content: space-between; padding: 12px 16px; border-bottom: 1px solid var(--xmt-border); }
  .empty { padding: 16px; color: var(--xmt-text-muted); }
</style>
