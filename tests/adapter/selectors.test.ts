import { describe, expect, it } from 'vitest'
import {
  isTrackedOperation,
  operationFromUrl,
  X_SELECTORS,
} from '../../src/core/adapter/x-selectors'

describe('operationFromUrl', () => {
  it('reads the operation name out of a graphql url', () => {
    const url =
      'https://x.com/i/api/graphql/AbC-123_x/HomeTimeline?variables=%7B%7D'
    expect(operationFromUrl(url)).toBe('HomeTimeline')
  })

  it('returns null for a non-graphql url', () => {
    expect(
      operationFromUrl('https://x.com/i/api/2/notifications/all.json'),
    ).toBeNull()
  })

  it('returns null for a url from another host', () => {
    expect(
      operationFromUrl('https://example.com/i/api/graphql/x/HomeTimeline'),
    ).toBeNull()
  })
})

describe('isTrackedOperation', () => {
  it('accepts a tracked operation', () => {
    expect(isTrackedOperation('HomeTimeline')).toBe(true)
  })

  it('rejects an untracked operation', () => {
    expect(isTrackedOperation('CreateTweet')).toBe(false)
  })
})

describe('X_SELECTORS', () => {
  it('is frozen so a tool cannot mutate it', () => {
    expect(Object.isFrozen(X_SELECTORS)).toBe(true)
  })
})
