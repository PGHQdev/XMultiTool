import type { Route, RouteKind } from '../types'

const RESERVED = new Set([
  'home',
  'explore',
  'notifications',
  'messages',
  'settings',
  'compose',
  'search',
  'i',
])

export function parseRoute(pathname: string): Route {
  const parts = pathname.split('/').filter(Boolean)
  if (parts.length === 0) return { kind: 'other', params: {} }

  const [first, second, third] = parts as [
    string,
    string | undefined,
    string | undefined,
  ]

  if (first === 'home') return { kind: 'home', params: {} }
  if (first === 'search') return { kind: 'search', params: {} }
  if (first === 'i' && second === 'bookmarks')
    return { kind: 'bookmarks', params: {} }
  if (first === 'i' && second === 'lists' && third) {
    return { kind: 'list', params: { listId: third } }
  }
  if (second === 'status' && third) {
    return { kind: 'post', params: { handle: first, postId: third } }
  }
  if (parts.length === 1 && !RESERVED.has(first)) {
    return { kind: 'profile', params: { handle: first } }
  }
  return { kind: 'other', params: {} }
}

const CELL_ROUTES = new Set<RouteKind>([
  'home',
  'profile',
  'post',
  'search',
  'bookmarks',
  'list',
])

// Messages, notifications and settings render no timeline, so a cell count of 0
// there is the truth about the page, not a broken selector.
export function rendersCells(route: Route): boolean {
  return CELL_ROUTES.has(route.kind)
}
