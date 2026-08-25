import {
  type CleanSettings,
  DEFAULT_CLEAN_SETTINGS as D,
  judge,
  type Reason,
} from '../reading/rules'
import type { Schema } from '../settings/schema'
import type { Tool } from '../types'

const settings: Schema<CleanSettings> = {
  promoted: {
    type: 'boolean',
    default: D.promoted,
    label: 'Ads and promoted posts',
  },
  bait: {
    type: 'boolean',
    default: D.bait,
    label: 'Engagement bait',
    help: 'Posts that ask for a like, a repost, a reply or a follow.',
  },
  ragebait: {
    type: 'boolean',
    default: D.ragebait,
    label: 'Ragebait',
    help: 'Posts that drew far more replies than likes.',
  },
  reposts: { type: 'boolean', default: D.reposts, label: 'Reposts' },
  replies: {
    type: 'boolean',
    default: D.replies,
    label: 'Replies in the timeline',
  },
  mutedWords: {
    type: 'stringList',
    default: D.mutedWords,
    label: 'Muted words',
    help: 'One per line. A plain word matches whole words only.',
  },
  mutedHandles: {
    type: 'stringList',
    default: D.mutedHandles,
    label: 'Muted accounts',
    help: 'One handle per line, with or without the @.',
  },
  minFollowers: {
    type: 'number',
    default: D.minFollowers,
    min: 0,
    label: 'Follower floor',
    help: 'Dims an account you do not follow below this count. 0 turns it off.',
  },
}

// The panel counts dimmed posts by reason. This is the one place that ties a
// settings field to the reason its rule writes, so the UI stays free of rule knowledge.
export const REASON_BY_FIELD: Record<keyof CleanSettings, Reason> = {
  promoted: 'promoted',
  bait: 'engagement bait',
  ragebait: 'ragebait',
  reposts: 'repost',
  replies: 'reply',
  mutedWords: 'muted word',
  mutedHandles: 'muted account',
  minFollowers: 'small account',
}

export const cleanTool: Tool<CleanSettings> = {
  id: 'reading:clean',
  name: 'Timeline cleaner',
  description: 'Dims ads, bait and anything you muted.',
  module: 'reading',
  defaultEnabled: true,
  settings,
  onPost(post, _node, ctx) {
    const reason = judge(post, ctx.settings)
    return reason ? { action: 'dim', reason } : { action: 'pass' }
  },
}
