<script lang="ts">
import { onMount } from 'svelte'
import { applyTheme, resolveTheme } from '../core/ui/theme'
import Activity from './routes/Activity.svelte'
import Filter from './routes/Filter.svelte'
import Settings from './routes/Settings.svelte'
import { loadAll, refreshStats, ui } from './state.svelte'

type Tab = 'filter' | 'activity' | 'settings'
let tab = $state<Tab>('filter')

// The counters change while the user scrolls x.com, so the panel keeps reading them
// for as long as it is open.
const POLL_MS = 2_000

onMount(() => {
  void loadAll()
  const timer = setInterval(() => void refreshStats(), POLL_MS)
  return () => clearInterval(timer)
})

$effect(() => {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  applyTheme(
    document.documentElement,
    resolveTheme(
      ui.settings?.ui.theme ?? 'auto',
      ui.detectedTheme,
      prefersDark,
    ),
  )
})
</script>

<nav>
  {#each ['filter', 'activity', 'settings'] as name (name)}
    <button class:active={tab === name} onclick={() => (tab = name as Tab)}>{name}</button>
  {/each}
</nav>

{#if ui.error}<p class="error">{ui.error}</p>{/if}

<main>
  {#if tab === 'filter'}<Filter />{:else if tab === 'activity'}<Activity />{:else}<Settings />{/if}
</main>

<style>
  nav { display: flex; border-bottom: 1px solid var(--xmt-border); position: sticky; top: 0; background: var(--xmt-bg); }
  nav button { flex: 1; background: none; border: 0; color: var(--xmt-text-muted); font: inherit; font-weight: 700; padding: 14px 0; cursor: pointer; text-transform: capitalize; transition: color var(--xmt-motion); }
  nav button.active { color: var(--xmt-text); box-shadow: inset 0 -3px 0 var(--xmt-accent); }
  main { max-width: 720px; margin: 0 auto; }
  .error { padding: 16px; color: var(--xmt-danger); }
</style>
