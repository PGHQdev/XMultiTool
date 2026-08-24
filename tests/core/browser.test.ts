import { describe, expect, it, vi } from 'vitest'
import {
  createRuntimeTransport,
  createStorageArea,
  type RuntimeMessagingApi,
  type StorageApi,
} from '../../src/core/browser'
import { createBus, NOT_HANDLED } from '../../src/core/bus'

type RawListener = (
  message: unknown,
  sender: unknown,
  sendResponse: (response?: unknown) => void,
) => boolean | void

// Models Chrome's real onMessage contract: one message reaches every listener, a
// reply only arrives if a listener returned exactly `true` synchronously and later
// called sendResponse, and the first such reply is the one the sender gets. A
// listener that returns anything else gives up its claim on the reply channel.
function fakeRuntimeMessaging(): {
  api: RuntimeMessagingApi
  fire(message: unknown): Promise<unknown>
} {
  const listeners: RawListener[] = []
  return {
    api: {
      sendMessage: async () => undefined,
      onMessage: {
        addListener(l) {
          listeners.push(l as RawListener)
        },
        removeListener(l) {
          const at = listeners.indexOf(l as RawListener)
          if (at >= 0) listeners.splice(at, 1)
        },
      },
    },
    fire(message) {
      return new Promise((resolve) => {
        let settled = false
        const sendResponse = (response?: unknown) => {
          if (settled) return
          settled = true
          resolve(response)
        }
        let anyKeptOpen = false
        for (const listener of [...listeners]) {
          if (listener(message, {}, sendResponse) === true) anyKeptOpen = true
        }
        if (!anyKeptOpen) {
          settled = true
          resolve(undefined)
        }
      })
    },
  }
}

function fakeApi(): StorageApi & { store: Record<string, unknown> } {
  const listeners: Array<(keys: string[]) => void> = []
  return {
    store: {},
    async get(key) {
      return key in this.store ? { [key]: this.store[key] } : {}
    },
    async set(items) {
      Object.assign(this.store, items)
      for (const listener of listeners) listener(Object.keys(items))
    },
    addChangeListener(cb) {
      listeners.push(cb)
      return () => listeners.splice(listeners.indexOf(cb), 1)
    },
  }
}

describe('createStorageArea', () => {
  it('returns undefined for a missing key', async () => {
    const area = createStorageArea(fakeApi())
    expect(await area.get('nope')).toBeUndefined()
  })

  it('round-trips a value', async () => {
    const area = createStorageArea(fakeApi())
    await area.set('k', { a: 1 })
    expect(await area.get('k')).toEqual({ a: 1 })
  })

  it('reports a change for the written key only', async () => {
    const area = createStorageArea(fakeApi())
    const seen = vi.fn()
    area.onChanged(seen)
    await area.set('k', 1)
    expect(seen).toHaveBeenCalledWith('k')
  })

  it('stops reporting after unsubscribe', async () => {
    const area = createStorageArea(fakeApi())
    const seen = vi.fn()
    area.onChanged(seen)()
    await area.set('k', 1)
    expect(seen).not.toHaveBeenCalled()
  })
})

describe('createRuntimeTransport', () => {
  it('delivers a reply when the listener keeps the channel open and calls sendResponse', async () => {
    const { api, fire } = fakeRuntimeMessaging()
    const transport = createRuntimeTransport(api)
    transport.onMessage(async (message) => ({ echoed: message }))
    expect(await fire('ping')).toEqual({ echoed: 'ping' })
  })

  it('drops a reply sent after the listener returns without keeping the channel open', async () => {
    const { api, fire } = fakeRuntimeMessaging()
    api.onMessage.addListener(((_message, _sender, sendResponse) => {
      void Promise.resolve().then(() => sendResponse('too late'))
      // no `return true`: the channel is closed before this reply can land
    }) as RawListener)
    expect(await fire('ping')).toBeUndefined()
  })

  it('leaves the reply channel to another context when the callback says NOT_HANDLED', async () => {
    const { api, fire } = fakeRuntimeMessaging()
    createRuntimeTransport(api).onMessage(() => NOT_HANDLED)
    createRuntimeTransport(api).onMessage(async () => 'from the owner')
    expect(await fire('ping')).toBe('from the owner')
  })

  it('answers NOT_HANDLED with no reply at all when nothing else listens', async () => {
    const { api, fire } = fakeRuntimeMessaging()
    const sendResponse = vi.fn()
    createRuntimeTransport(api).onMessage(() => NOT_HANDLED)
    api.onMessage.addListener(((_m, _s, respond) => {
      sendResponse(respond)
    }) as RawListener)
    expect(await fire('ping')).toBeUndefined()
    expect(sendResponse).toHaveBeenCalled()
  })
})

// A UI page that listens for an event registers a runtime.onMessage listener of its
// own, so every request another page sends reaches it too.
describe('two contexts on one runtime', () => {
  it('routes a request to the context that handles it, not the one that only listens', async () => {
    const { api, fire } = fakeRuntimeMessaging()
    const panel = createBus(createRuntimeTransport(api))
    panel.on('settings:changed', () => {})
    const worker = createBus(createRuntimeTransport(api))
    worker.handle('settings:get', async () => {
      await Promise.resolve()
      return { version: 1 }
    })

    const reply = await fire({
      xmt: 'request',
      type: 'settings:get',
      payload: undefined,
    })
    expect(reply).toEqual({ ok: true, value: { version: 1 } })
  })
})
