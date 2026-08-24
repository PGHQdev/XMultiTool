import { describe, expect, it } from 'vitest'
import { defaultsOf } from '../../src/core/settings/schema'
import {
  type DiagnosticsSettings,
  diagnosticsTool,
} from '../../src/core/tools/diagnostics'
import type { Post, ToolCtx } from '../../src/core/types'

const post = { id: '1001', source: 'graphql', isPromoted: false } as Post
const node = () => document.createElement('div')

function ctx(settings: DiagnosticsSettings): ToolCtx<DiagnosticsSettings> {
  return {
    settings,
    storage: { get: async () => undefined, set: async () => {} },
    log: { info() {}, warn() {}, error() {} },
    bus: {
      request: async () => undefined,
      handle: () => () => {},
      emit: async () => {},
      on: () => () => {},
    },
  } as ToolCtx<DiagnosticsSettings>
}

describe('diagnosticsTool', () => {
  it('is off by default', () => {
    expect(defaultsOf(diagnosticsTool.settings)).toEqual({ explain: false })
  })

  it('passes when explain is off', () => {
    expect(
      diagnosticsTool.onPost?.(post, node(), ctx({ explain: false })),
    ).toEqual({ action: 'pass' })
  })

  it('badges the record source when explain is on', () => {
    expect(
      diagnosticsTool.onPost?.(post, node(), ctx({ explain: true })),
    ).toEqual({
      action: 'badge',
      reason: 'post 1001 from graphql',
      label: 'graphql',
    })
  })

  it('belongs to the core module', () => {
    expect(diagnosticsTool.id).toBe('core:diagnostics')
    expect(diagnosticsTool.module).toBe('core')
  })
})
