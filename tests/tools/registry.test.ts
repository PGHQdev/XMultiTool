import { describe, expect, it, vi } from 'vitest'
import { ToolRegistry } from '../../src/core/tools/registry'
import type { Post, Tool, ToolCtx } from '../../src/core/types'

const post = { id: '1' } as Post
const node = () => document.createElement('div')
const ctx = {
  settings: {},
  storage: { get: async () => undefined, set: async () => {} },
  log: { info() {}, warn() {}, error() {} },
  bus: {
    request: async () => undefined,
    handle: () => () => {},
    emit: async () => {},
    on: () => () => {},
  },
} as ToolCtx<any>

function tool(id: string, onPost: Tool<any>['onPost']): Tool<any> {
  return {
    id,
    name: id,
    description: '',
    module: 'core',
    settings: {} as any,
    onPost,
  }
}

function registry(
  tools: Tool<any>[],
  overrides: Partial<ConstructorParameters<typeof ToolRegistry>[0]> = {},
) {
  return new ToolRegistry({
    tools,
    isEnabled: () => true,
    contextFor: () => ctx,
    onDisable: () => {},
    ...overrides,
  })
}

describe('ToolRegistry', () => {
  it('merges the verdicts of every enabled tool', () => {
    const r = registry([
      tool('a', () => ({ action: 'dim', reason: 'a' })),
      tool('b', () => ({ action: 'hide', reason: 'b' })),
    ])
    expect(r.runPost(post, node())).toEqual({ action: 'hide', reason: 'b' })
  })

  it('skips a disabled tool', () => {
    const seen: string[] = []
    const r = registry(
      [
        tool('a', () => {
          seen.push('a')
        }),
        tool('b', () => {
          seen.push('b')
        }),
      ],
      { isEnabled: (id) => id === 'b' },
    )
    r.runPost(post, node())
    expect(seen).toEqual(['b'])
  })

  it('keeps running the other tools when one throws', () => {
    const r = registry([
      tool('bad', () => {
        throw new Error('boom')
      }),
      tool('good', () => ({ action: 'hide', reason: 'good' })),
    ])
    expect(r.runPost(post, node())).toEqual({ action: 'hide', reason: 'good' })
  })

  it('counts failures per tool', () => {
    const r = registry([
      tool('bad', () => {
        throw new Error('boom')
      }),
    ])
    r.runPost(post, node())
    r.runPost(post, node())
    expect(r.failures('bad')).toBe(2)
    expect(r.isDisabled('bad')).toBe(false)
  })

  it('disables a tool after three failures and reports once', () => {
    const onDisable = vi.fn()
    const r = registry(
      [
        tool('bad', () => {
          throw new Error('boom')
        }),
      ],
      { onDisable },
    )
    for (let i = 0; i < 5; i += 1) r.runPost(post, node())
    expect(r.isDisabled('bad')).toBe(true)
    expect(onDisable).toHaveBeenCalledTimes(1)
    expect(onDisable.mock.calls[0]?.[0]).toBe('bad')
  })

  it('stops calling a disabled tool', () => {
    const onPost = vi.fn(() => {
      throw new Error('boom')
    })
    const r = registry([tool('bad', onPost)])
    for (let i = 0; i < 6; i += 1) r.runPost(post, node())
    expect(onPost).toHaveBeenCalledTimes(3)
  })

  it('contains a throw in onRoute and onCommand', () => {
    const r = registry([
      {
        id: 'bad',
        name: 'bad',
        description: '',
        module: 'core',
        settings: {} as any,
        onRoute: () => {
          throw new Error('boom')
        },
        onCommand: () => {
          throw new Error('boom')
        },
      },
    ])
    expect(() => r.runRoute({ kind: 'home', params: {} })).not.toThrow()
    expect(() => r.runCommand({ id: 'x' })).not.toThrow()
    expect(r.failures('bad')).toBe(2)
  })

  it('contains a throw in onInit', async () => {
    const r = registry([
      {
        id: 'bad',
        name: 'bad',
        description: '',
        module: 'core',
        settings: {} as any,
        onInit: () => {
          throw new Error('boom')
        },
      },
    ])
    await expect(r.init()).resolves.toBeUndefined()
    expect(r.failures('bad')).toBe(1)
  })
})
