import { describe, expect, it, vi } from 'vitest'
import { createStorageArea, type StorageApi } from '../../src/core/browser'

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
