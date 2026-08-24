import type { HealthEntry } from '../core/adapter/health'
import { bus } from '../core/browser-live'
import type { StoredSettings, ThemeChoice } from '../core/settings/store'
import type { Stats } from '../core/stats'

export const ui = $state({
  settings: null as StoredSettings | null,
  stats: null as Stats | null,
  health: [] as HealthEntry[],
  error: null as string | null,
})

async function safe<T>(run: () => Promise<T>): Promise<T | null> {
  try {
    return await run()
  } catch (error) {
    ui.error = error instanceof Error ? error.message : String(error)
    return null
  }
}

// A null reply means the write failed. Assigning the fetched value keeps the panel in
// sync with the worker; on failure, replacing ui.settings with a shallow copy of itself
// re-triggers the effects reading it, which keeps any genuinely changed value in sync.
// It does not by itself restore a control's own DOM state after a failed write -
// checked={...}/value={...} diff against Svelte's own last-written cache, which already
// equals the unchanged data, so callers restore the control imperatively instead; see
// Field.svelte, Tools.svelte and Settings.svelte.
function applySettingsReply(next: StoredSettings | null): void {
  if (next) {
    ui.settings = next
  } else if (ui.settings) {
    ui.settings = { ...ui.settings }
  }
}

export async function loadAll(): Promise<void> {
  ui.settings = await safe(() =>
    bus.request<StoredSettings>('settings:get', undefined),
  )
  ui.stats = await safe(() => bus.request<Stats>('stats:get', undefined))
  ui.health =
    (await safe(() => bus.request<HealthEntry[]>('health:get', undefined))) ??
    []
}

// Each returns whether the write landed, so the control that triggered it can restore
// its own DOM state on failure instead of showing the user's unsaved click.

export async function setEnabled(id: string, on: boolean): Promise<boolean> {
  const next = await safe(() =>
    bus.request<StoredSettings>('settings:setEnabled', { id, on }),
  )
  applySettingsReply(next)
  return next !== null
}

export async function patchTool(
  id: string,
  patch: Record<string, unknown>,
): Promise<boolean> {
  const next = await safe(() =>
    bus.request<StoredSettings>('settings:patchTool', { id, patch }),
  )
  applySettingsReply(next)
  return next !== null
}

export async function setTheme(theme: ThemeChoice): Promise<boolean> {
  const next = await safe(() =>
    bus.request<StoredSettings>('settings:setTheme', { theme }),
  )
  applySettingsReply(next)
  return next !== null
}
