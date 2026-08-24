import { describe, expect, it } from 'vitest'
import { parseRoute, rendersCells } from '../../src/core/adapter/route'

describe('parseRoute', () => {
  it('reads the home timeline', () => {
    expect(parseRoute('/home')).toEqual({ kind: 'home', params: {} })
  })

  it('reads a post permalink', () => {
    expect(parseRoute('/jack/status/20')).toEqual({
      kind: 'post',
      params: { handle: 'jack', postId: '20' },
    })
  })

  it('reads a profile', () => {
    expect(parseRoute('/jack')).toEqual({
      kind: 'profile',
      params: { handle: 'jack' },
    })
  })

  it('reads bookmarks', () => {
    expect(parseRoute('/i/bookmarks')).toEqual({
      kind: 'bookmarks',
      params: {},
    })
  })

  it('reads search', () => {
    expect(parseRoute('/search')).toEqual({ kind: 'search', params: {} })
  })

  it('reads a list', () => {
    expect(parseRoute('/i/lists/12345')).toEqual({
      kind: 'list',
      params: { listId: '12345' },
    })
  })

  it('does not treat a reserved path as a profile', () => {
    expect(parseRoute('/settings/account')).toEqual({
      kind: 'other',
      params: {},
    })
  })

  it('handles a trailing slash', () => {
    expect(parseRoute('/home/')).toEqual({ kind: 'home', params: {} })
  })
})

describe('rendersCells', () => {
  it('accepts every route that renders a timeline', () => {
    const paths = [
      '/home',
      '/jack',
      '/jack/status/20',
      '/search',
      '/i/bookmarks',
      '/i/lists/12345',
    ]
    expect(paths.map((p) => rendersCells(parseRoute(p)))).toEqual(
      paths.map(() => true),
    )
  })

  it('rejects a route that renders no cell', () => {
    expect(rendersCells(parseRoute('/messages'))).toBe(false)
    expect(rendersCells(parseRoute('/notifications'))).toBe(false)
    expect(rendersCells(parseRoute('/settings/account'))).toBe(false)
  })
})
