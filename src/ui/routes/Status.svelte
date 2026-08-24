<script lang="ts">
import { ui } from '../state.svelte'
</script>

{#if ui.stats}
  <dl>
    <div><dt>Posts seen</dt><dd>{ui.stats.seen}</dd></div>
    <div><dt>Hidden</dt><dd>{ui.stats.hidden}</dd></div>
    <div><dt>Dimmed</dt><dd>{ui.stats.dimmed}</dd></div>
    <div><dt>Marked</dt><dd>{ui.stats.badged}</dd></div>
  </dl>
{:else}
  <p class="empty">Open an x.com tab to see what XMultiTool is doing.</p>
{/if}

<style>
  dl { margin: 0; }
  div { display: flex; justify-content: space-between; padding: 12px 16px; border-bottom: 1px solid var(--xmt-border); }
  dt { color: var(--xmt-text-muted); }
  dd { margin: 0; font-weight: 700; }
  .empty { padding: 16px; color: var(--xmt-text-muted); }
</style>
