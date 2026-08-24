import { describe, expect, it } from 'vitest'
import { SelectorHealth } from '../../src/core/adapter/health'
import { BRIDGE_TAG } from '../../src/core/adapter/intercept'
import { PostStore } from '../../src/core/adapter/post-store'
import { createContentRuntime } from '../../src/core/runtime'
import { StatsCounter } from '../../src/core/stats'
import { ToolRegistry } from '../../src/core/tools/registry'
import type { Post, ToolCtx, Verdict } from '../../src/core/types'
import fixture from '../fixtures/home-timeline.json'

const bus = {
  request: async () => undefined,
  handle: () => () => {},
  emit: async () => {},
  on: () => () => {},
}

function setup(onPost?: (post: Post) => Verdict | void) {
  const applied: Array<{ node: HTMLElement; verdict: Verdict }> = []
  const stats = new StatsCounter()
  const health = new SelectorHealth(() => 0)
  const registry = new ToolRegistry({
    tools: onPost
      ? [
          {
            id: 't',
            name: 't',
            description: '',
            module: 'core',
            settings: {} as any,
            onPost: (p) => onPost(p),
          },
        ]
      : [],
    isEnabled: () => true,
    contextFor: () =>
      ({
        settings: {},
        storage: { get: async () => undefined, set: async () => {} },
        log: { info() {}, warn() {}, error() {} },
        bus,
      }) as ToolCtx<any>,
    onDisable: () => {},
  })

  let store!: PostStore
  const runtime = createContentRuntime({
    registry,
    stats,
    health,
    onRecord: (post) => store.addRecord(post),
    onVerdict: (node, verdict) => applied.push({ node, verdict }),
  })
  store = new PostStore({ onPair: (pair) => runtime.handlePair(pair) })
  return { runtime, store, stats, health, applied }
}

describe('createContentRuntime', () => {
  it('ignores a message that is not from the bridge', () => {
    const { runtime, stats } = setup()
    runtime.handleBridgeMessage({
      tag: 'other',
      op: 'HomeTimeline',
      payload: fixture,
    })
    expect(stats.snapshot().seen).toBe(0)
  })

  it('feeds normalized records into the store', () => {
    const { runtime, store } = setup()
    runtime.handleBridgeMessage({
      tag: BRIDGE_TAG,
      op: 'HomeTimeline',
      url: '',
      payload: fixture,
    })
    expect(store.size().records).toBe(3)
  })

  it('records unknown entry types in the stats', () => {
    const { runtime, stats } = setup()
    runtime.handleBridgeMessage({
      tag: BRIDGE_TAG,
      op: 'HomeTimeline',
      url: '',
      payload: fixture,
    })
    expect(stats.snapshot().unknownEntryTypes).toEqual([
      'TimelineTimelineCursor',
    ])
  })

  it('applies the merged verdict when a pair completes', () => {
    const { runtime, store, applied } = setup(() => ({
      action: 'hide',
      reason: 'promoted',
    }))
    runtime.handleBridgeMessage({
      tag: BRIDGE_TAG,
      op: 'HomeTimeline',
      url: '',
      payload: fixture,
    })
    store.addNode('1001', document.createElement('div'))
    expect(applied).toHaveLength(1)
    expect(applied[0]?.verdict).toEqual({ action: 'hide', reason: 'promoted' })
  })

  it('counts every judged post', () => {
    const { runtime, store, stats } = setup(() => ({ action: 'pass' }))
    runtime.handleBridgeMessage({
      tag: BRIDGE_TAG,
      op: 'HomeTimeline',
      url: '',
      payload: fixture,
    })
    store.addNode('1001', document.createElement('div'))
    store.addNode('2002', document.createElement('div'))
    expect(stats.snapshot().seen).toBe(2)
  })

  it('ignores a message whose op is not a string', () => {
    const { runtime, health } = setup()
    runtime.handleBridgeMessage({
      tag: BRIDGE_TAG,
      op: { toString: () => 'HomeTimeline' },
      url: '',
      payload: fixture,
    })
    expect(health.report()).toEqual([])
  })

  it('ignores a message that carries no url', () => {
    const { runtime, health } = setup()
    runtime.handleBridgeMessage({
      tag: BRIDGE_TAG,
      op: 'HomeTimeline',
      payload: fixture,
    })
    expect(health.report()).toEqual([])
  })

  it('survives a payload it cannot read', () => {
    const { runtime } = setup()
    expect(() =>
      runtime.handleBridgeMessage({
        tag: BRIDGE_TAG,
        op: 'HomeTimeline',
        url: '',
        payload: 'junk',
      }),
    ).not.toThrow()
  })
})
