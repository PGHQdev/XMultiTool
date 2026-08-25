import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { StoredSettings } from '../../src/core/settings/store'

// The extension build compiles state.svelte.ts with the Svelte plugin, which vitest does
// not load, so $state stays an undeclared global here. The panel state is a plain object
// after compilation too, so a pass-through is enough to drive these functions.
vi.hoisted(() => {
  ;(globalThis as unknown as { $state: <T>(value: T) => T }).$state = (value) =>
    value
})

const { request, requestPermissions, listeners } = vi.hoisted(() => ({
  request: vi.fn(),
  requestPermissions: vi.fn(),
  listeners: new Map<string, (payload: unknown) => void>(),
}))

vi.mock('../../src/core/browser-live', () => ({
  bus: {
    request,
    on(type: string, listener: (payload: unknown) => void) {
      listeners.set(type, listener)
      return () => listeners.delete(type)
    },
  },
  requestPermissions,
}))

// One tool that declares a permission and one that declares none, so the enable path
// can be driven both ways. The shipped CORE_TOOLS declares no permission today.
vi.mock('../../src/core/tools/index', () => ({
  CORE_TOOLS: [
    {
      id: 'needs',
      name: 'needs',
      module: 'core',
      settings: {},
      permissions: ['downloads'],
    },
    { id: 'plain', name: 'plain', module: 'core', settings: {} },
  ],
}))

const { exportConfig, importConfig, loadAll, refreshStats, setEnabled, ui } =
  await import('../../src/ui/state.svelte')

function settings(theme: StoredSettings['ui']['theme']): StoredSettings {
  return { version: 1, enabled: {}, tools: {}, ui: { theme } }
}

function replies(map: Record<string, unknown>): void {
  request.mockImplementation(async (type: string) => {
    if (!(type in map)) throw new Error(`no reply for "${type}"`)
    const reply = map[type]
    if (reply instanceof Error) throw reply
    return reply
  })
}

beforeEach(() => {
  request.mockReset()
  requestPermissions.mockReset()
  ui.settings = null
  ui.stats = null
  ui.health = []
  ui.detectedTheme = null
  ui.error = null
})

describe('loadAll', () => {
  it('reads the theme X is showing', async () => {
    replies({
      'settings:get': settings('auto'),
      'stats:get': null,
      'health:get': [],
      'theme:get': 'dim',
    })
    await loadAll()
    expect(ui.detectedTheme).toBe('dim')
    expect(ui.error).toBeNull()
  })

  it('stays quiet when no x.com tab answers', async () => {
    replies({
      'settings:get': settings('auto'),
      'stats:get': null,
      'health:get': [],
      'theme:get': new Error('Open an x.com tab first.'),
    })
    await loadAll()
    expect(ui.detectedTheme).toBeNull()
    expect(ui.error).toBeNull()
  })

  it('still reports a failure the user can act on', async () => {
    replies({
      'settings:get': new Error('storage is unreadable'),
      'stats:get': null,
      'health:get': [],
      'theme:get': null,
    })
    await loadAll()
    expect(ui.error).toBe('storage is unreadable')
  })
})

describe('refreshStats', () => {
  it('reads the counters again', async () => {
    replies({
      'stats:get': {
        seen: 3,
        hidden: 0,
        dimmed: 1,
        badged: 0,
        byReason: { promoted: 1 },
        unknownEntryTypes: [],
      },
      'health:get': [{ id: 'dom:cell', healthy: true, matches: 4, at: 1 }],
    })
    await refreshStats()
    expect(ui.stats?.dimmed).toBe(1)
    expect(ui.health).toHaveLength(1)
  })

  it('keeps the last reading and stays quiet when the tab stops answering', async () => {
    replies({
      'stats:get': {
        seen: 3,
        hidden: 0,
        dimmed: 1,
        badged: 0,
        byReason: {},
        unknownEntryTypes: [],
      },
      'health:get': [],
    })
    await refreshStats()
    replies({
      'stats:get': new Error('Open an x.com tab first.'),
      'health:get': new Error('Open an x.com tab first.'),
    })
    await refreshStats()
    expect(ui.stats?.seen).toBe(3)
    expect(ui.error).toBeNull()
  })
})

describe('exportConfig', () => {
  it('returns the file text', async () => {
    replies({ 'config:export': '{"version":1}' })
    expect(await exportConfig()).toBe('{"version":1}')
  })

  it('reports a failure and returns nothing to download', async () => {
    replies({ 'config:export': new Error('export failed') })
    expect(await exportConfig()).toBeNull()
    expect(ui.error).toBe('export failed')
  })

  it('clears an error left by an earlier run', async () => {
    ui.error = 'export failed'
    replies({ 'config:export': '{"version":1}' })
    await exportConfig()
    expect(ui.error).toBeNull()
  })
})

describe('importConfig', () => {
  it('applies the settings the worker returns', async () => {
    replies({ 'config:import': settings('dim') })
    expect(await importConfig('{"version":1}')).toBe(true)
    expect(ui.settings?.ui.theme).toBe('dim')
  })

  it('shows the worker error for a malformed paste', async () => {
    ui.settings = settings('auto')
    replies({
      'config:import': new Error('This file is not a valid XMultiTool config.'),
    })
    expect(await importConfig('nonsense')).toBe(false)
    expect(ui.error).toBe('This file is not a valid XMultiTool config.')
    expect(ui.settings?.ui.theme).toBe('auto')
  })

  it('clears the error once a fixed paste lands', async () => {
    ui.error = 'This file is not a valid XMultiTool config.'
    replies({ 'config:import': settings('light') })
    await importConfig('{"version":1}')
    expect(ui.error).toBeNull()
  })
})

describe('settings:changed', () => {
  it('takes the snapshot a write in another surface broadcast', () => {
    listeners.get('settings:changed')?.(settings('lights-out'))
    expect(ui.settings?.ui.theme).toBe('lights-out')
  })
})

describe('setEnabled', () => {
  it('asks for the permissions a tool declares before the write', async () => {
    requestPermissions.mockResolvedValue(true)
    replies({ 'settings:setEnabled': settings('auto') })
    expect(await setEnabled('needs', true)).toBe(true)
    expect(requestPermissions).toHaveBeenCalledWith(['downloads'])
    expect(request).toHaveBeenCalledWith('settings:setEnabled', {
      id: 'needs',
      on: true,
    })
  })

  it('skips the write and says what is missing when the user refuses', async () => {
    requestPermissions.mockResolvedValue(false)
    expect(await setEnabled('needs', true)).toBe(false)
    expect(request).not.toHaveBeenCalled()
    expect(ui.error).toBe('XMultiTool needs downloads to turn this on.')
  })

  it('asks for nothing when the tool declares no permission', async () => {
    replies({ 'settings:setEnabled': settings('auto') })
    await setEnabled('plain', true)
    expect(requestPermissions).not.toHaveBeenCalled()
  })

  it('asks for nothing when the user is turning a tool off', async () => {
    replies({ 'settings:setEnabled': settings('auto') })
    await setEnabled('needs', false)
    expect(requestPermissions).not.toHaveBeenCalled()
  })
})
