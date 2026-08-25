import { describe, expect, it } from 'vitest'
import { DEFAULT_CLEAN_SETTINGS } from '../../src/core/reading/rules'
import { defaultsOf } from '../../src/core/settings/schema'
import { cleanTool, REASON_BY_FIELD } from '../../src/core/tools/clean'
import { CORE_TOOLS } from '../../src/core/tools/index'
import type { Post, ToolCtx } from '../../src/core/types'

const post = (patch: Partial<Post> = {}): Post => ({
  id: '1',
  source: 'graphql',
  createdAt: null,
  text: 'hello',
  lang: 'en',
  author: {
    id: 'u1',
    handle: 'someone',
    displayName: 'Someone',
    verifiedType: 'none',
    followedByUser: false,
    followerCount: 5000,
  },
  counts: { reply: 1, repost: 0, like: 3, quote: 0, view: 10 },
  media: [],
  links: [],
  isPromoted: false,
  isReply: false,
  quotedId: null,
  repostOfId: null,
  ...patch,
})

const ctx = (patch: Partial<typeof DEFAULT_CLEAN_SETTINGS> = {}) =>
  ({ settings: { ...DEFAULT_CLEAN_SETTINGS, ...patch } }) as ToolCtx<
    typeof DEFAULT_CLEAN_SETTINGS
  >

const node = () => ({}) as HTMLElement

describe('the timeline cleaner', () => {
  it('is registered and belongs to the reading module', () => {
    expect(CORE_TOOLS).toContain(cleanTool)
    expect(cleanTool.module).toBe('reading')
  })

  it('ships on, so a fresh install cleans without a visit to the panel', () => {
    expect(cleanTool.defaultEnabled).toBe(true)
  })

  it('keeps its schema defaults and the rule defaults in step', () => {
    expect(defaultsOf(cleanTool.settings)).toEqual(DEFAULT_CLEAN_SETTINGS)
  })

  it('passes a post no rule catches', () => {
    expect(cleanTool.onPost?.(post(), node(), ctx())).toEqual({
      action: 'pass',
    })
  })

  it('dims a caught post and names the rule', () => {
    expect(
      cleanTool.onPost?.(post({ isPromoted: true }), node(), ctx()),
    ).toEqual({
      action: 'dim',
      reason: 'promoted',
    })
  })

  it('needs no permission beyond the host', () => {
    expect(cleanTool.permissions ?? []).toEqual([])
  })

  it('names the reason each rule produces, so the panel can count by rule', () => {
    expect(Object.keys(REASON_BY_FIELD).sort()).toEqual(
      Object.keys(cleanTool.settings).sort(),
    )
    expect(new Set(Object.values(REASON_BY_FIELD)).size).toBe(
      Object.keys(cleanTool.settings).length,
    )
  })
})
