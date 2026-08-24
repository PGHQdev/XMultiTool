import { observeCells } from '../src/core/adapter/dom'
import { SelectorHealth } from '../src/core/adapter/health'
import { PostStore } from '../src/core/adapter/post-store'
import { parseRoute } from '../src/core/adapter/route'
import { X_SELECTORS } from '../src/core/adapter/x-selectors'
import { bus, storage } from '../src/core/browser-live'
import { createContentRuntime } from '../src/core/runtime'
import { coerce } from '../src/core/settings/schema'
import { SETTINGS_KEY, SettingsStore } from '../src/core/settings/store'
import { StatsCounter } from '../src/core/stats'
import { applyVerdict } from '../src/core/tools/apply'
import { CORE_TOOLS } from '../src/core/tools/index'
import { ToolRegistry } from '../src/core/tools/registry'
import type { ToolCtx } from '../src/core/types'
import '../src/core/ui/content.css'

export default defineContentScript({
  matches: ['https://x.com/*'],
  runAt: 'document_start',
  cssInjectionMode: 'manifest',

  async main() {
    await injectScript('/xmt-main-world.js', { keepInDom: true })

    const settings = new SettingsStore(storage)
    await settings.load()

    const stats = new StatsCounter()
    const health = new SelectorHealth(() => Date.now())
    const registry = new ToolRegistry({
      tools: CORE_TOOLS,
      isEnabled: (id) => settings.isEnabled(id),
      contextFor: (id) => {
        const tool = CORE_TOOLS.find((t) => t.id === id)
        return {
          settings: tool
            ? coerce(tool.settings, settings.rawToolSettings(id))
            : {},
          storage: {
            get: (key) => storage.get(`xmt:tool:${id}:${key}`),
            set: (key, value) => storage.set(`xmt:tool:${id}:${key}`, value),
          },
          log: console,
          bus,
        } as ToolCtx<any>
      },
      onDisable: (id, error) => {
        void bus.emit('tool:disabled', { id, error: String(error) })
      },
    })

    let store!: PostStore
    const runtime = createContentRuntime({
      registry,
      stats,
      health,
      onRecord: (post) => store.addRecord(post),
      onVerdict: applyVerdict,
    })
    store = new PostStore({ onPair: (pair) => runtime.handlePair(pair) })

    window.addEventListener('message', (event) => {
      if (event.source !== window) return
      runtime.handleBridgeMessage(event.data)
    })

    const startObserver = (): void => {
      const root =
        document.querySelector(X_SELECTORS.dom.primaryColumn) ?? document.body
      observeCells(root, (id, node) => store.addNode(id, node))
      health.record(
        'dom:cell',
        document.querySelectorAll(X_SELECTORS.dom.cell).length,
      )
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', startObserver, {
        once: true,
      })
    } else {
      startObserver()
    }

    let lastPath = location.pathname
    registry.runRoute(parseRoute(lastPath))
    setInterval(() => {
      if (location.pathname === lastPath) return
      lastPath = location.pathname
      registry.runRoute(parseRoute(lastPath))
    }, 500)

    // The side panel cannot message a content script directly, so the background
    // relays these two requests into the active tab.
    bus.handle('stats:get', () => stats.snapshot())
    bus.handle('health:get', () => health.report())

    // A settings write in the worker reaches the tab as a storage change, which is
    // the one signal both browsers deliver to a content script.
    storage.onChanged((key) => {
      if (key === SETTINGS_KEY) void settings.load()
    })

    await registry.init()
  },
})
