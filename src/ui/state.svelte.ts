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

export async function loadAll(): Promise<void> {
  ui.settings = await safe(() =>
    bus.request<StoredSettings>('settings:get', undefined),
  )
  ui.stats = await safe(() => bus.request<Stats>('stats:get', undefined))
  ui.health =
    (await safe(() => bus.request<HealthEntry[]>('health:get', undefined))) ??
    []
}

export async function setEnabled(id: string, on: boolean): Promise<void> {
  const next = await safe(() =>
    bus.request<StoredSettings>('settings:setEnabled', { id, on }),
  )
  if (next) ui.settings = next
}

export async function patchTool(
  id: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const next = await safe(() =>
    bus.request<StoredSettings>('settings:patchTool', { id, patch }),
  )
  if (next) ui.settings = next
}

export async function setTheme(theme: ThemeChoice): Promise<void> {
  const next = await safe(() =>
    bus.request<StoredSettings>('settings:setTheme', { theme }),
  )
  if (next) ui.settings = next
}
