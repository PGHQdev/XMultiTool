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
