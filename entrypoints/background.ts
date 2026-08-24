import {
  bus,
  requestActiveTab,
  setSidePanelOpensOnActionClick,
  storage,
} from '../src/core/browser-live'
import { exportConfig, importConfig } from '../src/core/settings/config-file'
import { SettingsStore, type ThemeChoice } from '../src/core/settings/store'

export default defineBackground(() => {
  const settings = new SettingsStore(storage)
  const ready = settings.load()

  void setSidePanelOpensOnActionClick()

  bus.handle('settings:get', async () => {
    await ready
    return settings.snapshot()
  })

  // Relays into the x.com tab, where the content script holds these counters.
  bus.handle('stats:get', () => requestActiveTab('stats:get', undefined))
  bus.handle('health:get', () => requestActiveTab('health:get', undefined))
  bus.handle('theme:get', () => requestActiveTab('theme:get', undefined))

  bus.handle(
    'settings:setEnabled',
    async (payload: { id: string; on: boolean }) => {
      await ready
      await settings.setEnabled(payload.id, payload.on)
      await bus.emit('settings:changed', settings.snapshot())
      return settings.snapshot()
    },
  )

  bus.handle(
    'settings:patchTool',
    async (payload: { id: string; patch: Record<string, unknown> }) => {
      await ready
      await settings.patchTool(payload.id, payload.patch)
      await bus.emit('settings:changed', settings.snapshot())
      return settings.snapshot()
    },
  )

  bus.handle('settings:setTheme', async (payload: { theme: ThemeChoice }) => {
    await ready
    await settings.setTheme(payload.theme)
    await bus.emit('settings:changed', settings.snapshot())
    return settings.snapshot()
  })

  bus.handle('config:export', async (payload: { exportedAt: string }) => {
    await ready
    return exportConfig(settings.snapshot(), payload.exportedAt)
  })

  bus.handle('config:import', async (payload: { text: string }) => {
    await ready
    await settings.replace(importConfig(payload.text))
    await bus.emit('settings:changed', settings.snapshot())
    return settings.snapshot()
  })
})
