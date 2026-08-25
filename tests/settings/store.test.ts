import { describe, expect, it, vi } from 'vitest'
import { runMigrations } from '../../src/core/settings/migrations'
import type { StorageArea } from '../../src/core/settings/store'
import {
  migrate,
  SETTINGS_KEY,
  SETTINGS_VERSION,
  SettingsStore,
  toolEnabled,
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

  it('refuses a version from the future instead of dropping the data', () => {
    expect(() =>
      migrate({ version: SETTINGS_VERSION + 99, enabled: { a: true } }),
    ).toThrow(/newer version/i)
  })
})

describe('runMigrations', () => {
  const trail = (name: string) => (raw: Record<string, unknown>) => ({
    ...raw,
    seen: [...((raw.seen as string[]) ?? []), name],
  })

  it('does nothing when from equals to', () => {
    const raw = { a: 1 }
    const steps = { 1: trail('one') }
    expect(runMigrations(raw, 1, 1, steps)).toBe(raw)
  })

  it('applies a step to the object', () => {
    expect(
      runMigrations({ a: 1 }, 1, 2, {
        1: (raw) => ({ ...raw, b: 2 }),
      }),
    ).toEqual({ a: 1, b: 2 })
  })

  it('runs the steps in ascending order', () => {
    const steps = { 1: trail('one'), 2: trail('two'), 3: trail('three') }
    expect(runMigrations({}, 1, 4, steps).seen).toEqual(['one', 'two', 'three'])
  })

  it('skips a version with no step and keeps going', () => {
    const steps = { 1: trail('one'), 3: trail('three') }
    expect(runMigrations({}, 1, 4, steps).seen).toEqual(['one', 'three'])
  })

  it('returns the object every step produced', () => {
    const steps = {
      1: (raw: Record<string, unknown>) => ({ ...raw, a: 1 }),
      2: (raw: Record<string, unknown>) => ({ ...raw, b: 2 }),
    }
    expect(runMigrations({ start: true }, 1, 3, steps)).toEqual({
      start: true,
      a: 1,
      b: 2,
    })
  })
})

describe('SettingsStore', () => {
  it('loads defaults on a fresh profile', async () => {
    const store = new SettingsStore(fakeArea())
    await store.load()
    expect(store.snapshot().version).toBe(SETTINGS_VERSION)
  })

  it('starts fresh when storage holds a version from the future', async () => {
    const area = fakeArea({
      [SETTINGS_KEY]: { version: SETTINGS_VERSION + 99, enabled: { a: true } },
    })
    const store = new SettingsStore(area)
    await expect(store.load()).resolves.toEqual({
      version: SETTINGS_VERSION,
      enabled: {},
      tools: {},
      ui: { theme: 'auto' },
    })
    expect(area.data[SETTINGS_KEY]).toEqual({
      version: SETTINGS_VERSION + 99,
      enabled: { a: true },
    })
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

describe('toolEnabled', () => {
  const settings = (enabled: Record<string, boolean>) =>
    migrate({ version: SETTINGS_VERSION, enabled, tools: {}, ui: {} })

  it('is off for a tool the user never met', () => {
    expect(toolEnabled(settings({}), { id: 'a' })).toBe(false)
  })

  it('is on for a tool that ships enabled', () => {
    expect(toolEnabled(settings({}), { id: 'a', defaultEnabled: true })).toBe(
      true,
    )
  })

  it('lets the stored choice beat the default in both directions', () => {
    expect(
      toolEnabled(settings({ a: false }), { id: 'a', defaultEnabled: true }),
    ).toBe(false)
    expect(toolEnabled(settings({ a: true }), { id: 'a' })).toBe(true)
  })
})
