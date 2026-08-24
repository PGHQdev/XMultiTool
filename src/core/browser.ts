import { type BusTransport, NOT_HANDLED } from './bus'
import type { StorageArea } from './settings/store'

export interface StorageApi {
  get(key: string): Promise<Record<string, unknown>>
  set(items: Record<string, unknown>): Promise<void>
  addChangeListener(cb: (keys: string[]) => void): () => void
}

export function createStorageArea(api: StorageApi): StorageArea {
  return {
    async get(key) {
      const result = await api.get(key)
      return result[key]
    },
    async set(key, value) {
      await api.set({ [key]: value })
    },
    onChanged(cb) {
      return api.addChangeListener((keys) => {
        for (const key of keys) cb(key)
      })
    },
  }
}

type RawRuntimeListener = (
  message: unknown,
  sender: unknown,
  sendResponse: (response?: unknown) => void,
) => boolean | void

export interface RuntimeMessagingApi {
  sendMessage(message: unknown): Promise<unknown>
  onMessage: {
    addListener(listener: RawRuntimeListener): void
    removeListener(listener: RawRuntimeListener): void
  }
}

// Chrome only began honouring a Promise returned from an onMessage listener in
// version 148, and that support is still a gradual rollout; this extension's
// minimum_chrome_version is 114. Across that whole range a listener must
// return `true` synchronously and call sendResponse itself once its async
// work settles, or the reply channel closes before the caller can use it.
export function createRuntimeTransport(api: RuntimeMessagingApi): BusTransport {
  return {
    send: (message) => api.sendMessage(message),
    onMessage(cb) {
      const listener = (
        message: unknown,
        _sender: unknown,
        sendResponse: (response?: unknown) => void,
      ) => {
        const result = cb(message)
        // Every extension context receives the same broadcast. Returning false here
        // leaves the channel to the context that owns the type; returning true would
        // reply undefined first and the owner's reply would be dropped.
        if (result === NOT_HANDLED) return false
        void Promise.resolve(result).then(sendResponse)
        return true
      }
      api.onMessage.addListener(listener)
      return () => api.onMessage.removeListener(listener)
    },
  }
}
