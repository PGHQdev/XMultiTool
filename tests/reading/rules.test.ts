import { describe, expect, it } from 'vitest'
import { DEFAULT_CLEAN_SETTINGS, judge } from '../../src/core/reading/rules'
import type { Post } from '../../src/core/types'

function post(patch: Partial<Post> = {}): Post {
  return {
    id: '1',
    source: 'graphql',
    createdAt: null,
    text: 'a normal post about a normal thing',
    lang: 'en',
    author: {
      id: 'u1',
      handle: 'someone',
      displayName: 'Someone',
      verifiedType: 'none',
      followedByUser: false,
      followerCount: 5000,
    },
    counts: { reply: 2, repost: 1, like: 40, quote: 0, view: 900 },
    media: [],
    links: [],
    isPromoted: false,
    isReply: false,
    quotedId: null,
    repostOfId: null,
    ...patch,
  }
}

const settings = (patch: Partial<typeof DEFAULT_CLEAN_SETTINGS> = {}) => ({
  ...DEFAULT_CLEAN_SETTINGS,
  ...patch,
})

describe('judge', () => {
  it('passes an ordinary post', () => {
    expect(judge(post(), settings())).toBeNull()
  })

  it('catches a promoted post', () => {
    expect(judge(post({ isPromoted: true }), settings())).toBe('promoted')
  })

  it('leaves a promoted post alone when the rule is off', () => {
    expect(
      judge(post({ isPromoted: true }), settings({ promoted: false })),
    ).toBeNull()
  })

  it('catches engagement bait', () => {
    const texts = [
      'Like if you agree with this',
      'RT if you want the full guide',
      'Comment YES and I will send it to you',
      'Follow me and I will follow back',
      'Tag someone who needs to see this',
      'Bookmark this before it is gone',
      "Don't scroll past this one",
      'Link in bio for the whole thread',
    ]
    for (const text of texts) {
      expect(judge(post({ text }), settings()), text).toBe('engagement bait')
    }
  })

  it('does not call an ordinary sentence bait', () => {
    const texts = [
      'I like ice cream and I will not apologise',
      'We shipped the new build today',
      'Following the release notes closely',
    ]
    for (const text of texts) {
      expect(judge(post({ text }), settings()), text).toBeNull()
    }
  })

  it('catches ragebait only when the rule is on', () => {
    const angry = post({
      counts: { reply: 800, repost: 3, like: 100, quote: 9, view: 1 },
    })
    expect(judge(angry, settings())).toBeNull()
    expect(judge(angry, settings({ ragebait: true }))).toBe('ragebait')
  })

  it('leaves a busy post alone when replies stay under the ratio', () => {
    const busy = post({
      counts: { reply: 300, repost: 10, like: 900, quote: 4, view: 1 },
    })
    expect(judge(busy, settings({ ragebait: true }))).toBeNull()
  })

  it('leaves a small argument alone', () => {
    const small = post({
      counts: { reply: 6, repost: 0, like: 1, quote: 0, view: 1 },
    })
    expect(judge(small, settings({ ragebait: true }))).toBeNull()
  })

  it('catches a muted word on a word boundary', () => {
    const muted = settings({ mutedWords: ['crypto'] })
    expect(judge(post({ text: 'another crypto scam' }), muted)).toBe(
      'muted word',
    )
    expect(judge(post({ text: 'cryptography is fine' }), muted)).toBeNull()
  })

  it('catches a muted phrase anywhere in the text', () => {
    const muted = settings({ mutedWords: ['#nft'] })
    expect(judge(post({ text: 'buy my #nft now' }), muted)).toBe('muted word')
  })

  it('ignores a blank muted word', () => {
    expect(judge(post(), settings({ mutedWords: ['  '] }))).toBeNull()
  })

  it('catches a muted account whatever the case and the at sign', () => {
    const muted = settings({ mutedHandles: ['@Spammer'] })
    expect(
      judge(post({ author: { ...post().author, handle: 'spammer' } }), muted),
    ).toBe('muted account')
  })

  it('catches an account under the follower floor', () => {
    const floor = settings({ minFollowers: 100 })
    const tiny = { ...post().author, followerCount: 12 }
    expect(judge(post({ author: tiny }), floor)).toBe('small account')
  })

  it('never judges an account the user follows', () => {
    const floor = settings({ minFollowers: 100 })
    const followed = {
      ...post().author,
      followerCount: 12,
      followedByUser: true,
    }
    expect(judge(post({ author: followed }), floor)).toBeNull()
  })

  it('leaves an unknown follower count alone', () => {
    const floor = settings({ minFollowers: 100 })
    const unknown = { ...post().author, followerCount: null }
    expect(judge(post({ author: unknown }), floor)).toBeNull()
  })

  it('catches reposts and replies only when asked', () => {
    expect(judge(post({ repostOfId: '9' }), settings())).toBeNull()
    expect(judge(post({ repostOfId: '9' }), settings({ reposts: true }))).toBe(
      'repost',
    )
    expect(judge(post({ isReply: true }), settings())).toBeNull()
    expect(judge(post({ isReply: true }), settings({ replies: true }))).toBe(
      'reply',
    )
  })

  it('reports the most certain reason first', () => {
    const both = post({ isPromoted: true, text: 'like if you agree' })
    expect(judge(both, settings())).toBe('promoted')
  })
})
