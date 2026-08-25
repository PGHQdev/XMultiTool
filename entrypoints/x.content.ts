import { observeCells } from '../src/core/adapter/dom'
import { postFromCell } from '../src/core/adapter/dom-record'
import { SelectorHealth } from '../src/core/adapter/health'
import { PostStore } from '../src/core/adapter/post-store'
import { parseRoute, rendersCells } from '../src/core/adapter/route'
import { X_SELECTORS } from '../src/core/adapter/x-selectors'
import { bus, hasPermissions, storage } from '../src/core/browser-live'
import { createContentRuntime } from '../src/core/runtime'
import { coerce } from '../src/core/settings/schema'
import { SETTINGS_KEY, SettingsStore } from '../src/core/settings/store'
import { StatsCounter } from '../src/core/stats'
import { applyVerdict } from '../src/core/tools/apply'
import { CORE_TOOLS } from '../src/core/tools/index'
import { ToolRegistry } from '../src/core/tools/registry'
import type { ToolCtx } from '../src/core/types'
import { themeFromCookie } from '../src/core/ui/theme'
import { HOST_MATCH } from '../src/manifest.config'
import '../src/core/ui/content.css'

const DOM_FALLBACK_MS = 1_500
const PENDING_MAX = 50

export default defineContentScript({
  matches: [HOST_MATCH],
  runAt: 'document_start',
  cssInjectionMode: 'manifest',

  async main() {
    // postMessage does not queue for a listener that is not attached yet, so this
    // registers before the two awaits below. Buffering beats late-binding a handler
    // here: a response landing during the injection is exactly what would be lost.
    const pending: unknown[] = []
    let deliver = (message: unknown): void => {
      if (pending.length < PENDING_MAX) pending.push(message)
    }
    window.addEventListener('message', (event) => {
      if (event.source !== window) return
      deliver(event.data)
    })

    await injectScript('/xmt-main-world.js', { keepInDom: true })

    const settings = new SettingsStore(storage)
    await settings.load()

    const stats = new StatsCounter()
    const health = new SelectorHealth(() => Date.now())
    const registry = new ToolRegistry({
      tools: CORE_TOOLS,
      isEnabled: (id) =>
        settings.isEnabled(CORE_TOOLS.find((t) => t.id === id) ?? id),
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
      // The panel prompts for a tool's permissions when the user turns it on. Here the
      // registry only confirms they are still granted, since a content script cannot
      // prompt and the user can revoke a permission at any time.
      hasPermissions,
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
    store = new PostStore({
      onPair: (pair) => runtime.handlePair(pair),
      domFallback: {
        build: (id, node) => postFromCell(id, node),
        afterMs: DOM_FALLBACK_MS,
        setTimer: (run, ms) => setTimeout(run, ms) as unknown as number,
        clearTimer: (handle) => clearTimeout(handle),
      },
    })

    deliver = (message) => runtime.handleBridgeMessage(message)
    for (const message of pending) deliver(message)
    pending.length = 0

    const startObserver = (): void => {
      observeCells(document.body, (id, node) => store.addNode(id, node))
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
    // Body is never replaced, but x.com rebuilds the timeline route on client-side
    // navigation, so the DOM selector's live health is sampled on every tick here
    // rather than once at start.
    setInterval(() => {
      const path = location.pathname
      const route = parseRoute(path)
      if (rendersCells(route)) {
        health.record(
          'dom:cell',
          document.querySelectorAll(X_SELECTORS.dom.cell).length,
        )
      }
      if (path === lastPath) return
      lastPath = path
      registry.runRoute(route)
    }, 500)

    // The side panel cannot message a content script directly, so the background
    // relays these requests into the active tab.
    bus.handle('stats:get', () => stats.snapshot())
    bus.handle('health:get', () => health.report())
    bus.handle('theme:get', () => themeFromCookie(document.cookie))

    // A settings write in the worker reaches the tab as a storage change, which is
    // the one signal both browsers deliver to a content script.
    storage.onChanged((key) => {
      if (key === SETTINGS_KEY) void settings.load()
    })

    await registry.init()
  },
})
