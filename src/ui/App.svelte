<script lang="ts">
import { onMount } from 'svelte'
import { applyTheme, resolveTheme } from '../core/ui/theme'
import Settings from './routes/Settings.svelte'
import Status from './routes/Status.svelte'
import Tools from './routes/Tools.svelte'
import { loadAll, ui } from './state.svelte'

type Tab = 'status' | 'tools' | 'settings'
let tab = $state<Tab>('status')

onMount(loadAll)

$effect(() => {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  applyTheme(
    document.documentElement,
    resolveTheme(ui.settings?.ui.theme ?? 'auto', null, prefersDark),
  )
})
</script>

<nav>
  {#each ['status', 'tools', 'settings'] as name (name)}
    <button class:active={tab === name} onclick={() => (tab = name as Tab)}>{name}</button>
  {/each}
</nav>

{#if ui.error}<p class="error">{ui.error}</p>{/if}

<main>
  {#if tab === 'status'}<Status />{:else if tab === 'tools'}<Tools />{:else}<Settings />{/if}
</main>

<style>
  nav { display: flex; border-bottom: 1px solid var(--xmt-border); position: sticky; top: 0; background: var(--xmt-bg); }
  nav button { flex: 1; background: none; border: 0; color: var(--xmt-text-muted); font: inherit; font-weight: 700; padding: 14px 0; cursor: pointer; text-transform: capitalize; transition: color var(--xmt-motion); }
  nav button.active { color: var(--xmt-text); box-shadow: inset 0 -3px 0 var(--xmt-accent); }
  main { max-width: 720px; margin: 0 auto; }
  .error { padding: 16px; color: var(--xmt-danger); }
</style>
