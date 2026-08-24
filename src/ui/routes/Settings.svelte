<script lang="ts">
import { bus } from '../../core/browser-live'
import type { ThemeChoice } from '../../core/settings/store'
import { loadAll, setTheme, ui } from '../state.svelte'

const themes: ThemeChoice[] = ['auto', 'light', 'dim', 'lights-out']
let importText = $state('')

async function exportConfig() {
  const text = await bus.request<string>('config:export', {
    exportedAt: new Date().toISOString(),
  })
  const url = URL.createObjectURL(
    new Blob([text], { type: 'application/json' }),
  )
  const link = document.createElement('a')
  link.href = url
  link.download = 'xmultitool-config.json'
  link.click()
  URL.revokeObjectURL(url)
}

async function importConfig() {
  await bus.request('config:import', { text: importText })
  importText = ''
  await loadAll()
}
</script>

<section>
  <h2>Theme</h2>
  <div class="row">
    <select value={ui.settings?.ui.theme ?? 'auto'} onchange={(e) => setTheme(e.currentTarget.value as ThemeChoice)}>
      {#each themes as theme (theme)}<option value={theme}>{theme}</option>{/each}
    </select>
  </div>

  <h2>Config</h2>
  <div class="row"><button onclick={exportConfig}>Export config</button></div>
  <div class="row">
    <textarea rows="4" bind:value={importText} placeholder="Paste a config file"></textarea>
    <button onclick={importConfig} disabled={!importText}>Import</button>
  </div>

  <h2>Selector health</h2>
  {#each ui.health as entry (entry.id)}
    <div class="row"><span>{entry.id}</span><span>{entry.healthy ? 'ok' : 'stale'} ({entry.matches})</span></div>
  {:else}
    <p class="empty">No readings yet.</p>
  {/each}

  {#if ui.error}<p class="error">{ui.error}</p>{/if}
</section>

<style>
  h2 { font-size: var(--xmt-text-size); padding: 16px 16px 4px; margin: 0; color: var(--xmt-text-muted); }
  .row { display: flex; gap: 12px; justify-content: space-between; padding: 12px 16px; border-bottom: 1px solid var(--xmt-border); }
  .empty { padding: 16px; color: var(--xmt-text-muted); }
  .error { padding: 16px; color: var(--xmt-danger); }
  button { border-radius: var(--xmt-radius-pill); border: 0; background: var(--xmt-accent); color: var(--xmt-accent-text); padding: 8px 16px; font-weight: 700; cursor: pointer; }
  button:disabled { opacity: 0.5; cursor: default; }
</style>
