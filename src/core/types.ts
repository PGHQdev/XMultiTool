export type PostSource = 'graphql' | 'dom'
export type VerifiedType = 'none' | 'blue' | 'business' | 'government'

export interface PostAuthor {
  id: string | null
  handle: string
  displayName: string
  verifiedType: VerifiedType | null
  followedByUser: boolean | null
  followerCount: number | null
}

export interface PostCounts {
  reply: number
  repost: number
  like: number
  quote: number
  view: number | null
}

export interface PostMedia {
  type: 'photo' | 'video' | 'gif'
  url: string
  alt: string | null
}

export interface Post {
  id: string
  source: PostSource
  createdAt: string | null
  text: string
  lang: string | null
  author: PostAuthor
  counts: PostCounts
  media: PostMedia[]
  links: string[]
  isPromoted: boolean
  isReply: boolean
  quotedId: string | null
  repostOfId: string | null
  raw?: unknown // kept only while a diagnostics session is active
}

export type RouteKind =
  | 'home'
  | 'profile'
  | 'post'
  | 'search'
  | 'bookmarks'
  | 'list'
  | 'other'

export interface Route {
  kind: RouteKind
  params: Record<string, string>
}

export interface Command {
  id: string
  payload?: unknown
}

export type Verdict =
  | { action: 'pass' }
  | { action: 'hide'; reason: string }
  | { action: 'dim'; reason: string }
  | { action: 'badge'; reason: string; label: string }

export interface Logger {
  info(message: string, data?: unknown): void
  warn(message: string, data?: unknown): void
  error(message: string, data?: unknown): void
}

export interface ToolStorage {
  get<T>(key: string): Promise<T | undefined>
  set<T>(key: string, value: T): Promise<void>
}

export interface ToolCtx<S> {
  settings: S
  storage: ToolStorage
  log: Logger
}

export interface Tool<S = Record<string, never>> {
  id: string
  name: string
  description: string
  module: 'core' | 'reading' | 'export' | 'author'
  settings: import('./settings/schema').Schema<S>
  permissions?: string[]
  onInit?(ctx: ToolCtx<S>): void | Promise<void>
  onPost?(post: Post, node: HTMLElement, ctx: ToolCtx<S>): Verdict | void
  onRoute?(route: Route, ctx: ToolCtx<S>): void
  onCommand?(cmd: Command, ctx: ToolCtx<S>): void
}
