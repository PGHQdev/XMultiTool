import { describe, expect, it, vi } from 'vitest'
import type { StorageArea } from '../../src/core/settings/store'
import {
  migrate,
  SETTINGS_KEY,
  SETTINGS_VERSION,
  SettingsStore,
} from '../../src/core/settings/store'

function fakeArea(
  initial: Record<string, unknown> = {},
): StorageArea & { data: Record<string, unknown> } {
  const listeners: Array<(key: string) => void> = []
  return {
    data: { ...initial },
    async get(key) {
      return this.data[key]
    },
    async set(key, value) {
      this.data[key] = value
      for (const listener of listeners) listener(key)
    },
    onChanged(cb) {
      listeners.push(cb)
      return () => listeners.splice(listeners.indexOf(cb), 1)
    },
  }
}

describe('migrate', () => {
  it('builds a fresh object from nothing', () => {
    expect(migrate(undefined)).toEqual({
      version: SETTINGS_VERSION,
      enabled: {},
      tools: {},
      ui: { theme: 'auto' },
    })
  })

  it('keeps known data from a current-version object', () => {
    const stored = {
      version: SETTINGS_VERSION,
      enabled: { a: true },
      tools: { a: { x: 1 } },
      ui: { theme: 'dim' },
    }
    expect(migrate(stored)).toEqual(stored)
  })

  it('repairs a corrupt object instead of throwing', () => {
    expect(
      migrate({ version: SETTINGS_VERSION, enabled: 'no', tools: null, ui: 5 }),
    ).toEqual({
      version: SETTINGS_VERSION,
      enabled: {},
      tools: {},
      ui: { theme: 'auto' },
    })
  })

  it('refuses a version from the future and starts fresh', () => {
    expect(
      migrate({ version: SETTINGS_VERSION + 99, enabled: { a: true } }).enabled,
    ).toEqual({})
  })
})

describe('SettingsStore', () => {
  it('loads defaults on a fresh profile', async () => {
    const store = new SettingsStore(fakeArea())
    await store.load()
    expect(store.snapshot().version).toBe(SETTINGS_VERSION)
  })

  it('writes and reads a tool enable flag', async () => {
    const area = fakeArea()
    const store = new SettingsStore(area)
    await store.load()
    await store.setEnabled('core:diagnostics', true)
    expect(store.isEnabled('core:diagnostics')).toBe(true)
    expect((area.data[SETTINGS_KEY] as any).enabled['core:diagnostics']).toBe(
      true,
    )
  })

  it('treats an unknown tool as disabled', async () => {
    const store = new SettingsStore(fakeArea())
    await store.load()
    expect(store.isEnabled('nope')).toBe(false)
  })

  it('merges a tool settings patch', async () => {
    const store = new SettingsStore(fakeArea())
    await store.load()
    await store.patchTool('a', { x: 1 })
    await store.patchTool('a', { y: 2 })
    expect(store.rawToolSettings('a')).toEqual({ x: 1, y: 2 })
  })

  it('tells subscribers about a change', async () => {
    const store = new SettingsStore(fakeArea())
    await store.load()
    const seen = vi.fn()
    store.subscribe(seen)
    await store.setEnabled('a', true)
    expect(seen).toHaveBeenCalledTimes(1)
  })

  it('keeps notifying later subscribers when an earlier one throws', async () => {
    const area = fakeArea()
    const store = new SettingsStore(area)
    await store.load()
    const first = vi.fn()
    const second = vi.fn(() => {
      throw new Error('boom')
    })
    const third = vi.fn()
    store.subscribe(first)
    store.subscribe(second)
    store.subscribe(third)
    await expect(store.setEnabled('a', true)).resolves.toBeUndefined()
    expect(first).toHaveBeenCalledTimes(1)
    expect(third).toHaveBeenCalledTimes(1)
    expect((area.data[SETTINGS_KEY] as any).enabled.a).toBe(true)
  })
})
