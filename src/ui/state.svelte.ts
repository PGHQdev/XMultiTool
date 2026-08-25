import type { HealthEntry } from '../core/adapter/health'
import { bus, requestPermissions } from '../core/browser-live'
import type { StoredSettings, ThemeChoice } from '../core/settings/store'
import type { Stats } from '../core/stats'
import { CORE_TOOLS } from '../core/tools/index'
import type { XTheme } from '../core/ui/theme'

export const ui = $state({
  settings: null as StoredSettings | null,
  stats: null as Stats | null,
  health: [] as HealthEntry[],
  detectedTheme: null as XTheme | null,
  error: null as string | null,
})

async function safe<T>(
  run: () => Promise<T>,
  options?: { quiet?: boolean },
): Promise<T | null> {
  try {
    return await run()
  } catch (error) {
    if (!options?.quiet)
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
// restoreControl in controls/restore-control.ts.
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
  await refreshStats()
  // The reply travels through the worker into the x.com tab, so it rejects whenever no
  // such tab is open. That is the normal state of the panel, not a failure to report.
  ui.detectedTheme = await safe(
    () => bus.request<XTheme | null>('theme:get', undefined),
    { quiet: true },
  )
}

// The panel polls these while it is open, so a rejection is the ordinary answer of a
// browser with no x.com tab in front of it. A failed read keeps the last one on screen.
export async function refreshStats(): Promise<void> {
  const stats = await safe(() => bus.request<Stats>('stats:get', undefined), {
    quiet: true,
  })
  if (stats) ui.stats = stats
  const health = await safe(
    () => bus.request<HealthEntry[]>('health:get', undefined),
    { quiet: true },
  )
  if (health) ui.health = health
}

// The worker broadcasts every settings write it makes. The options page and the side
// panel can be open at the same time, so a write in one surface updates the other.
bus.on('settings:changed', (next: StoredSettings) => {
  ui.settings = next
})

// Each returns whether the write landed, so the control that triggered it can restore
// its own DOM state on failure instead of showing the user's unsaved click.

// permissions.request prompts only from the user gesture that reached this call, so it
// runs before the first await and the panel is the one surface that can ask.
async function granted(id: string): Promise<boolean> {
  const names = CORE_TOOLS.find((t) => t.id === id)?.permissions
  if (!names?.length) return true
  const answer = await safe(() => requestPermissions(names))
  if (answer) return true
  if (answer === false)
    ui.error = `XMultiTool needs ${names.join(', ')} to turn this on.`
  return false
}

export async function setEnabled(id: string, on: boolean): Promise<boolean> {
  if (on && !(await granted(id))) return false
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

// Null means the export failed; the caller has nothing to hand the user.
export async function exportConfig(): Promise<string | null> {
  const text = await safe(() =>
    bus.request<string>('config:export', {
      exportedAt: new Date().toISOString(),
    }),
  )
  if (text !== null) ui.error = null
  return text
}

export async function importConfig(text: string): Promise<boolean> {
  const next = await safe(() =>
    bus.request<StoredSettings>('config:import', { text }),
  )
  applySettingsReply(next)
  if (next) ui.error = null
  return next !== null
}
