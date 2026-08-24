import { describe, expect, it, vi } from 'vitest'
import {
  createRuntimeTransport,
  createStorageArea,
  type RuntimeMessagingApi,
  type StorageApi,
} from '../../src/core/browser'

type RawListener = (
  message: unknown,
  sender: unknown,
  sendResponse: (response?: unknown) => void,
) => boolean | void

// Models Chrome's real onMessage contract: the listener gets (message, sender,
// sendResponse), and a reply only arrives if the listener returned exactly
// `true` synchronously and later called sendResponse. Anything else closes
// the channel immediately, whether or not sendResponse is called after.
function fakeRuntimeMessaging(): {
  api: RuntimeMessagingApi
  fire(message: unknown): Promise<unknown>
} {
  let listener: RawListener | undefined
  return {
    api: {
      sendMessage: async () => undefined,
      onMessage: {
        addListener(l) {
          listener = l as RawListener
        },
        removeListener(l) {
          if (listener === l) listener = undefined
        },
      },
    },
    fire(message) {
      return new Promise((resolve) => {
        if (!listener) {
          resolve(undefined)
          return
        }
        let settled = false
        const sendResponse = (response?: unknown) => {
          if (settled) return
          settled = true
          resolve(response)
        }
        const keptOpen = listener(message, {}, sendResponse) === true
        if (!keptOpen) {
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
})
