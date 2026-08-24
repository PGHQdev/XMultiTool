// tests/adapter/normalize.test.ts
import { describe, expect, it } from 'vitest'
import {
  normalizeTimeline,
  normalizeTweetResult,
} from '../../src/core/adapter/normalize'
import fixture from '../fixtures/home-timeline.json'

describe('normalizeTimeline', () => {
  const result = normalizeTimeline(fixture)

  it('returns one record per tweet entry', () => {
    expect(result.posts.map((p) => p.id)).toEqual(['1001', '2002'])
  })

  it('reads the author', () => {
    expect(result.posts[0]?.author).toEqual({
      id: 'u1',
      handle: 'jack',
      displayName: 'Jack',
      verifiedType: 'blue',
      followedByUser: false,
      followerCount: 7000000,
    })
  })

  it('reads counts and views', () => {
    expect(result.posts[0]?.counts).toEqual({
      reply: 3,
      repost: 5,
      like: 9,
      quote: 1,
      view: 4200,
    })
  })

  it('reads media and links', () => {
    expect(result.posts[0]?.media).toEqual([
      { type: 'photo', url: 'https://pbs.example/a.jpg', alt: 'a photo' },
    ])
    expect(result.posts[0]?.links).toEqual(['https://example.com/a'])
  })

  it('marks a promoted post', () => {
    expect(result.posts[1]?.isPromoted).toBe(true)
    expect(result.posts[0]?.isPromoted).toBe(false)
  })

  it('marks the source as graphql', () => {
    expect(result.posts[0]?.source).toBe('graphql')
  })

  it('counts an unknown entry type instead of throwing', () => {
    expect(result.unknownEntryTypes).toEqual(['TimelineTimelineModule'])
  })

  it('survives an empty payload', () => {
    expect(normalizeTimeline({})).toEqual({ posts: [], unknownEntryTypes: [] })
  })

  it('survives a null payload', () => {
    expect(normalizeTimeline(null)).toEqual({
      posts: [],
      unknownEntryTypes: [],
    })
  })

  it('defaults missing view counts to null', () => {
    expect(result.posts[1]?.counts.view).toBeNull()
  })

  it('does not leak a non-string retweeted rest_id into repostOfId', () => {
    const post = normalizeTweetResult(
      {
        rest_id: '9001',
        legacy: {
          retweeted_status_result: { result: { rest_id: 12345 } },
        },
      },
      false,
    )
    expect(post?.repostOfId).toBeNull()
  })

  it('does not produce NaN when the view count is not numeric', () => {
    const post = normalizeTweetResult(
      {
        rest_id: '9002',
        legacy: {},
        views: { count: 'not-a-number' },
      },
      false,
    )
    expect(post?.counts.view).toBeNull()
  })
})
