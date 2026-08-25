<script lang="ts">
import { ui } from '../state.svelte'

const byReason = $derived(
  Object.entries(ui.stats?.byReason ?? {}).sort((a, b) => b[1] - a[1]),
)
</script>

{#if ui.stats}
  <dl>
    <div><dt>Posts read</dt><dd>{ui.stats.seen}</dd></div>
    <div><dt>Dimmed</dt><dd>{ui.stats.dimmed}</dd></div>
    {#if ui.stats.hidden > 0}<div><dt>Hidden</dt><dd>{ui.stats.hidden}</dd></div>{/if}
    {#if ui.stats.badged > 0}<div><dt>Marked</dt><dd>{ui.stats.badged}</dd></div>{/if}
  </dl>

  <h2>By rule</h2>
  {#each byReason as [reason, count] (reason)}
    <div class="row"><span>{reason}</span><span class="count">{count}</span></div>
  {:else}
    <p class="empty">Nothing caught yet on this tab.</p>
  {/each}

  {#if ui.stats.unknownEntryTypes.length > 0}
    <h2>Unread entry types</h2>
    <p class="empty">{ui.stats.unknownEntryTypes.join(', ')}</p>
  {/if}
{:else}
  <p class="empty">Open an x.com tab to see what XMultiTool is doing.</p>
{/if}

<style>
  dl { margin: 0; }
  dl div, .row { display: flex; justify-content: space-between; padding: 12px 16px; border-bottom: 1px solid var(--xmt-border); }
  dt, .row span:first-child { color: var(--xmt-text-muted); }
  dd, .count { margin: 0; font-weight: 700; font-variant-numeric: tabular-nums; }
  h2 { font-size: var(--xmt-text-size-small); text-transform: uppercase; letter-spacing: 0.06em; padding: 18px 16px 6px; margin: 0; color: var(--xmt-text-muted); }
  .empty { padding: 12px 16px; color: var(--xmt-text-muted); }
</style>
