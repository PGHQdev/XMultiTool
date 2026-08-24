import type { Schema } from '../settings/schema'
import type { Tool } from '../types'

export interface DiagnosticsSettings {
  explain: boolean
}

const settings: Schema<DiagnosticsSettings> = {
  explain: {
    type: 'boolean',
    default: false,
    label: 'Explain every post',
    help: 'Marks each post with the source of its record. Use it to check the adapter.',
  },
}

export const diagnosticsTool: Tool<DiagnosticsSettings> = {
  id: 'core:diagnostics',
  name: 'Diagnostics',
  description: 'Shows where each post record came from.',
  module: 'core',
  settings,
  onPost(post, _node, ctx) {
    if (!ctx.settings.explain) return { action: 'pass' }
    return {
      action: 'badge',
      reason: `post ${post.id} from ${post.source}`,
      label: post.source,
    }
  },
}
