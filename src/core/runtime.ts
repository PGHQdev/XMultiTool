import type { SelectorHealth } from './adapter/health'
import { BRIDGE_TAG, type BridgeMessage } from './adapter/intercept'
import { normalizeTimeline } from './adapter/normalize'
import type { PostPair } from './adapter/post-store'
import type { StatsCounter } from './stats'
import type { ToolRegistry } from './tools/registry'
import type { Post, Verdict } from './types'

export interface RuntimeDeps {
  registry: ToolRegistry
  stats: StatsCounter
  health: SelectorHealth
  onRecord(post: Post): void
  onVerdict(node: HTMLElement, verdict: Verdict): void
}

const isBridgeMessage = (m: unknown): m is BridgeMessage =>
  typeof m === 'object' && m !== null && (m as BridgeMessage).tag === BRIDGE_TAG

export function createContentRuntime(deps: RuntimeDeps) {
  return {
    handleBridgeMessage(message: unknown): void {
      if (!isBridgeMessage(message)) return
      const { posts, unknownEntryTypes } = normalizeTimeline(message.payload)
      deps.stats.noteUnknownEntryTypes(unknownEntryTypes)
      deps.health.record(`graphql:${message.op}`, posts.length)
      for (const post of posts) deps.onRecord(post)
    },

    handlePair(pair: PostPair): void {
      const verdict = deps.registry.runPost(pair.post, pair.node)
      deps.stats.count(verdict)
      deps.onVerdict(pair.node, verdict)
    },
  }
}
