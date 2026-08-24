# XMultiTool Platform Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build sub-project 0 of XMultiTool: an MV3 extension shell that turns X's GraphQL traffic into stable `Post` records, pairs them with their DOM nodes, and runs registered tools that return verdicts.

**Architecture:** A page-world script patches `fetch` and `XHR` and forwards X's GraphQL responses over `postMessage`. An isolated content script normalizes those responses into `Post` records, joins each record with its rendered cell, and passes both to every enabled tool. Tools return verdicts; the core is the only writer to the DOM, to storage and to browser APIs. A Svelte side panel and options page render tool settings from each tool's schema.

**Tech Stack:** WXT, Svelte 5, TypeScript, Tailwind 4, BitsUI, Phosphor, Bun, `idb`, Vitest, happy-dom, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-24-xmultitool-core-design.md`

## Global Constraints

- Manifest V3. Chrome is the shipping target; a Firefox build must come from the same source.
- The extension makes no network request to any host except `x.com`. No telemetry, ever.
- No automated posting, following, liking, scheduling or DM sending anywhere in the codebase.
- Every X-specific string (test id, GraphQL operation name, JSON path, cookie name) lives in `src/core/adapter/x-selectors.ts`. An architecture test fails the build if one appears elsewhere.
- Tools never write to the DOM, never call `chrome.*`, and never read storage directly. They return verdicts and use the context object.
- The page-world interceptor is read-only: it never alters a request or a response body, and a failure inside it must fall through to the original function.
- All browser API access goes through `src/core/browser.ts`.
- Licence MIT. Conventional Commits. No Claude or AI references in commits, code or docs.
- Runtime target: Chrome 114+ (`chrome.sidePanel` floor).

## Out of scope for this plan

These belong to later sub-projects and must not appear in this work: timeline filter rules, mute lists, export jobs, the archive UI, the IndexedDB layer, the composer, drafts, hotkeys. The `Archive` and `Compose` routes exist in the spec's route table but are built by modules 2 and 3. This plan builds Status, Tools and Settings only.

## File Structure

```
wxt.config.ts                          WXT config; imports the manifest object
src/manifest.config.ts                 manifest fields as a testable object
src/core/types.ts                      Post, Verdict, Route, Command, Tool, ToolCtx
src/core/browser.ts                    the only file that touches chrome.*
src/core/bus.ts                        typed request/response and events
src/core/adapter/x-selectors.ts        every X-specific string
src/core/adapter/intercept.ts          fetch/XHR patch, testable against a fake window
src/core/adapter/normalize.ts          GraphQL payload -> Post[]
src/core/adapter/route.ts              pathname -> Route
src/core/adapter/dom.ts                cell observer, post id from permalink
src/core/adapter/post-store.ts         joins records and nodes
src/core/adapter/health.ts             selector health check
src/core/tools/registry.ts             registration, hooks, containment
src/core/tools/verdict.ts              verdict merge
src/core/tools/apply.ts                the only DOM writer
src/core/tools/diagnostics.ts          the core:diagnostics tool
src/core/settings/schema.ts            Field, Schema, defaultsOf, coerce
src/core/settings/store.ts             load, save, subscribe, migrations
src/core/settings/migrations.ts        numbered migrations
src/core/settings/config-file.ts       config export and import
src/core/ui/tokens.css                 the three X themes
src/core/ui/theme.ts                   night_mode cookie -> theme
src/ui/App.svelte                      shell, shared by both entrypoints
src/ui/routes/Status.svelte
src/ui/routes/Tools.svelte
src/ui/routes/Settings.svelte
src/ui/controls/Field.svelte           renders one schema field
src/ui/controls/control-for.ts         schema field -> control name
entrypoints/xmt-main-world.ts          unlisted script, page world
entrypoints/x.content.ts               isolated content script, wiring only
entrypoints/background.ts              settings owner, bus host
entrypoints/sidepanel/index.html       side panel entrypoint
entrypoints/options/index.html         options entrypoint
tests/architecture/selectors.test.ts   forbids X strings outside the registry
tests/fixtures/home-timeline.json      synthetic HomeTimeline response
tests/fixtures/timeline.html           saved timeline markup for DOM tests
e2e/options.spec.ts                    Playwright smoke
```

---

### Task 1: Project scaffold and build

**Files:**
- Create: whole project skeleton, `wxt.config.ts`, `src/manifest.config.ts`, `vitest.config.ts`, `biome.json`, `.github/workflows/ci.yml`, `LICENSE`
- Test: `tests/manifest.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `src/manifest.config.ts` exporting `manifest` (a `chrome.runtime.ManifestV3`-shaped plain object) and `HOST_MATCH = 'https://x.com/*'`. Scripts `bun run dev`, `bun run build`, `bun run build:firefox`, `bun run test`, `bun run lint`.

- [ ] **Step 1: Scaffold the project**

Run in the repo root. The directory already contains `docs/` and `.git/`, so answer the "directory is not empty" prompt with overwrite-nothing and pick the **Svelte** template and **bun**:

```bash
bunx wxt@latest init . --template svelte
bun install
```

If the initializer refuses a non-empty directory, scaffold aside and move the files in:

```bash
bunx wxt@latest init .xmt-scaffold --template svelte
cp -R .xmt-scaffold/. . && rm -rf .xmt-scaffold
bun install
```

- [ ] **Step 2: Add the remaining dependencies**

```bash
bun add -d tailwindcss @tailwindcss/vite @biomejs/biome vitest happy-dom @playwright/test
bun add bits-ui phosphor-svelte idb
```

`idb` is installed now because the manifest and settings store are shared with module 2; no IndexedDB code is written in this plan.

- [ ] **Step 3: Write the failing manifest test**

```ts
// tests/manifest.test.ts
import { describe, expect, it } from 'vitest'
import { HOST_MATCH, manifest } from '../src/manifest.config'

describe('manifest', () => {
  it('targets x.com only', () => {
    expect(manifest.host_permissions).toEqual([HOST_MATCH])
  })

  it('requests the minimum permissions', () => {
    expect(manifest.permissions.sort()).toEqual(['scripting', 'sidePanel', 'storage', 'tabs'])
  })

  it('exposes the main-world script to x.com only', () => {
    expect(manifest.web_accessible_resources).toEqual([
      { resources: ['xmt-main-world.js'], matches: [HOST_MATCH] },
    ])
  })

  it('declares no remote code and no content security policy escape', () => {
    expect(JSON.stringify(manifest)).not.toMatch(/https?:\/\/(?!x\.com)/)
  })
})
```

- [ ] **Step 4: Run the test and confirm it fails**

Run: `bun run test tests/manifest.test.ts`
Expected: FAIL, cannot resolve `../src/manifest.config`.

- [ ] **Step 5: Write the manifest object**

```ts
// src/manifest.config.ts
export const HOST_MATCH = 'https://x.com/*'

export const manifest = {
  name: 'XMultiTool',
  description: 'Reading control, data export and author tools for X.',
  permissions: ['storage', 'sidePanel', 'tabs', 'scripting'] as string[],
  host_permissions: [HOST_MATCH],
  minimum_chrome_version: '114',
  side_panel: { default_path: 'sidepanel.html' },
  action: { default_title: 'XMultiTool' },
  web_accessible_resources: [{ resources: ['xmt-main-world.js'], matches: [HOST_MATCH] }],
}
```

- [ ] **Step 6: Wire the config files**

```ts
// wxt.config.ts
import { defineConfig } from 'wxt'
import tailwind from '@tailwindcss/vite'
import { manifest } from './src/manifest.config'

export default defineConfig({
  srcDir: '.',
  modules: ['@wxt-dev/module-svelte'],
  manifest,
  vite: () => ({ plugins: [tailwind()] }),
})
```

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'happy-dom',
    include: ['tests/**/*.test.ts'],
  },
})
```

Add to `package.json` scripts: `"test": "vitest run"`, `"test:watch": "vitest"`, `"lint": "biome check ."`, `"format": "biome format --write ."`, `"build:firefox": "wxt build -b firefox"`, `"e2e": "playwright test"`.

- [ ] **Step 7: Run the test and confirm it passes**

Run: `bun run test tests/manifest.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 8: Confirm both targets build**

```bash
bun run build && bun run build:firefox
```
Expected: `.output/chrome-mv3/manifest.json` and `.output/firefox-mv2/manifest.json` exist. Open the Chrome manifest and confirm `host_permissions` is `["https://x.com/*"]`.

- [ ] **Step 9: Add CI and the licence**

```yaml
# .github/workflows/ci.yml
name: ci
on: [push, pull_request]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - run: bun run lint
      - run: bunx tsc --noEmit
      - run: bun run test
      - run: bun run build
      - run: bun run build:firefox
```

Write `LICENSE` with the MIT text, copyright `2026 XMultiTool contributors`.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "chore: scaffold wxt extension with chrome and firefox builds"
```

---

### Task 2: Selector registry and the architecture test

**Files:**
- Create: `src/core/adapter/x-selectors.ts`, `tests/architecture/selectors.test.ts`
- Test: `tests/architecture/selectors.test.ts`, `tests/adapter/selectors.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `X_SELECTORS` (frozen object: `graphqlOperations`, `dom`, `cookies`)
  - `GRAPHQL_URL_RE: RegExp`
  - `operationFromUrl(url: string): string | null`
  - `isTrackedOperation(op: string): boolean`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/adapter/selectors.test.ts
import { describe, expect, it } from 'vitest'
import { isTrackedOperation, operationFromUrl, X_SELECTORS } from '../../src/core/adapter/x-selectors'

describe('operationFromUrl', () => {
  it('reads the operation name out of a graphql url', () => {
    const url = 'https://x.com/i/api/graphql/AbC-123_x/HomeTimeline?variables=%7B%7D'
    expect(operationFromUrl(url)).toBe('HomeTimeline')
  })

  it('returns null for a non-graphql url', () => {
    expect(operationFromUrl('https://x.com/i/api/2/notifications/all.json')).toBeNull()
  })

  it('returns null for a url from another host', () => {
    expect(operationFromUrl('https://example.com/i/api/graphql/x/HomeTimeline')).toBeNull()
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
```

```ts
// tests/architecture/selectors.test.ts
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const REGISTRY = 'src/core/adapter/x-selectors.ts'
const FORBIDDEN = [/data-testid/, /\/i\/api\/graphql/, /night_mode/, /\bHomeTimeline\b/, /\bTweetDetail\b/]

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) sources(path, out)
    else if (/\.(ts|svelte)$/.test(name)) out.push(path)
  }
  return out
}

describe('selector registry', () => {
  it('holds every X-specific string in the project', () => {
    const offenders: string[] = []
    for (const file of sources('src')) {
      if (file.replace(/\\/g, '/') === REGISTRY) continue
      const text = readFileSync(file, 'utf8')
      for (const pattern of FORBIDDEN) {
        if (pattern.test(text)) offenders.push(`${file} matches ${pattern}`)
      }
    }
    expect(offenders).toEqual([])
  })
})
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `bun run test tests/adapter/selectors.test.ts tests/architecture/selectors.test.ts`
Expected: FAIL, cannot resolve `x-selectors`.

- [ ] **Step 3: Write the registry**

```ts
// src/core/adapter/x-selectors.ts
export const X_HOST = 'x.com'

export const X_SELECTORS = Object.freeze({
  graphqlOperations: Object.freeze({
    homeTimeline: 'HomeTimeline',
    homeLatestTimeline: 'HomeLatestTimeline',
    userTweets: 'UserTweets',
    userTweetsAndReplies: 'UserTweetsAndReplies',
    tweetDetail: 'TweetDetail',
    bookmarks: 'Bookmarks',
    likes: 'Likes',
    searchTimeline: 'SearchTimeline',
  }),
  dom: Object.freeze({
    primaryColumn: '[data-testid="primaryColumn"]',
    cell: '[data-testid="cellInnerDiv"]',
    tweet: 'article[data-testid="tweet"]',
    statusLink: 'a[href*="/status/"]',
    postMenuButton: '[data-testid="caret"]',
  }),
  cookies: Object.freeze({ theme: 'night_mode' }),
})

export const GRAPHQL_URL_RE = /^https:\/\/x\.com\/i\/api\/graphql\/[^/]+\/([A-Za-z0-9_]+)/

const TRACKED = new Set<string>(Object.values(X_SELECTORS.graphqlOperations))

export function operationFromUrl(url: string): string | null {
  const match = GRAPHQL_URL_RE.exec(url)
  return match ? match[1] : null
}

export function isTrackedOperation(op: string): boolean {
  return TRACKED.has(op)
}
```

The architecture test's `FORBIDDEN` list names `HomeTimeline` and `TweetDetail` on purpose: they must appear in this file and nowhere else.

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `bun run test tests/adapter tests/architecture`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/core/adapter/x-selectors.ts tests/adapter/selectors.test.ts tests/architecture/selectors.test.ts
git commit -m "feat(adapter): add selector registry with architecture guard"
```

---

### Task 3: Core types and route parsing

**Files:**
- Create: `src/core/types.ts`, `src/core/adapter/route.ts`
- Test: `tests/adapter/route.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: every shared type, plus `parseRoute(pathname: string): Route`

- [ ] **Step 1: Write the types**

These are types only, so they carry no test of their own. Every later task depends on these exact names.

```ts
// src/core/types.ts
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
}

export type RouteKind = 'home' | 'profile' | 'post' | 'search' | 'bookmarks' | 'list' | 'other'

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
```

- [ ] **Step 2: Write the failing route test**

```ts
// tests/adapter/route.test.ts
import { describe, expect, it } from 'vitest'
import { parseRoute } from '../../src/core/adapter/route'

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
    expect(parseRoute('/jack')).toEqual({ kind: 'profile', params: { handle: 'jack' } })
  })

  it('reads bookmarks', () => {
    expect(parseRoute('/i/bookmarks')).toEqual({ kind: 'bookmarks', params: {} })
  })

  it('reads search', () => {
    expect(parseRoute('/search')).toEqual({ kind: 'search', params: {} })
  })

  it('reads a list', () => {
    expect(parseRoute('/i/lists/12345')).toEqual({ kind: 'list', params: { listId: '12345' } })
  })

  it('does not treat a reserved path as a profile', () => {
    expect(parseRoute('/settings/account')).toEqual({ kind: 'other', params: {} })
  })

  it('handles a trailing slash', () => {
    expect(parseRoute('/home/')).toEqual({ kind: 'home', params: {} })
  })
})
```

- [ ] **Step 3: Run it and confirm it fails**

Run: `bun run test tests/adapter/route.test.ts`
Expected: FAIL, cannot resolve `route`.

- [ ] **Step 4: Write the parser**

```ts
// src/core/adapter/route.ts
import type { Route } from '../types'

const RESERVED = new Set([
  'home', 'explore', 'notifications', 'messages', 'settings', 'compose', 'search', 'i',
])

export function parseRoute(pathname: string): Route {
  const parts = pathname.split('/').filter(Boolean)
  if (parts.length === 0) return { kind: 'other', params: {} }

  const [first, second, third] = parts

  if (first === 'home') return { kind: 'home', params: {} }
  if (first === 'search') return { kind: 'search', params: {} }
  if (first === 'i' && second === 'bookmarks') return { kind: 'bookmarks', params: {} }
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
```

- [ ] **Step 5: Run it and confirm it passes**

Run: `bun run test tests/adapter/route.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 6: Commit**

```bash
git add src/core/types.ts src/core/adapter/route.ts tests/adapter/route.test.ts
git commit -m "feat(core): add shared types and route parser"
```

---

### Task 4: Normalizer and fixtures

**Files:**
- Create: `src/core/adapter/normalize.ts`, `tests/fixtures/home-timeline.json`
- Test: `tests/adapter/normalize.test.ts`

**Interfaces:**
- Consumes: `Post` from `src/core/types.ts`, `X_SELECTORS` from the registry
- Produces:
  - `interface NormalizeResult { posts: Post[]; unknownEntryTypes: string[] }`
  - `normalizeTimeline(payload: unknown): NormalizeResult`

- [ ] **Step 1: Write the fixture**

X wraps timeline results in `data.home.home_timeline_urt.instructions[]`, each instruction holding `entries[]`, each entry holding `content.itemContent.tweet_results.result`. This synthetic fixture carries one normal post, one promoted post, and one entry of an unknown type.

```json
{
  "data": {
    "home": {
      "home_timeline_urt": {
        "instructions": [
          {
            "type": "TimelineAddEntries",
            "entries": [
              {
                "entryId": "tweet-1001",
                "content": {
                  "entryType": "TimelineTimelineItem",
                  "itemContent": {
                    "itemType": "TimelineTweet",
                    "tweet_results": {
                      "result": {
                        "__typename": "Tweet",
                        "rest_id": "1001",
                        "core": {
                          "user_results": {
                            "result": {
                              "rest_id": "u1",
                              "is_blue_verified": true,
                              "legacy": {
                                "screen_name": "jack",
                                "name": "Jack",
                                "followers_count": 7000000,
                                "following": false
                              }
                            }
                          }
                        },
                        "views": { "count": "4200" },
                        "legacy": {
                          "created_at": "Tue Mar 21 20:50:14 +0000 2006",
                          "full_text": "just setting up my twttr https://t.co/abc",
                          "lang": "en",
                          "reply_count": 3,
                          "retweet_count": 5,
                          "favorite_count": 9,
                          "quote_count": 1,
                          "in_reply_to_status_id_str": null,
                          "entities": {
                            "urls": [{ "expanded_url": "https://example.com/a" }],
                            "media": [
                              {
                                "type": "photo",
                                "media_url_https": "https://pbs.example/a.jpg",
                                "ext_alt_text": "a photo"
                              }
                            ]
                          }
                        }
                      }
                    }
                  }
                }
              },
              {
                "entryId": "promoted-2002",
                "content": {
                  "entryType": "TimelineTimelineItem",
                  "itemContent": {
                    "itemType": "TimelineTweet",
                    "promotedMetadata": { "advertiser_results": {} },
                    "tweet_results": {
                      "result": {
                        "__typename": "Tweet",
                        "rest_id": "2002",
                        "core": {
                          "user_results": {
                            "result": {
                              "rest_id": "u2",
                              "legacy": { "screen_name": "brand", "name": "Brand" }
                            }
                          }
                        },
                        "legacy": {
                          "created_at": "Mon Jan 06 12:00:00 +0000 2025",
                          "full_text": "buy this",
                          "lang": "en",
                          "reply_count": 0,
                          "retweet_count": 0,
                          "favorite_count": 0,
                          "quote_count": 0
                        }
                      }
                    }
                  }
                }
              },
              {
                "entryId": "who-to-follow-3",
                "content": { "entryType": "TimelineTimelineModule", "items": [] }
              }
            ]
          }
        ]
      }
    }
  }
}
```

- [ ] **Step 2: Write the failing test**

```ts
// tests/adapter/normalize.test.ts
import { describe, expect, it } from 'vitest'
import fixture from '../fixtures/home-timeline.json'
import { normalizeTimeline } from '../../src/core/adapter/normalize'

describe('normalizeTimeline', () => {
  const result = normalizeTimeline(fixture)

  it('returns one record per tweet entry', () => {
    expect(result.posts.map((p) => p.id)).toEqual(['1001', '2002'])
  })

  it('reads the author', () => {
    expect(result.posts[0].author).toEqual({
      id: 'u1',
      handle: 'jack',
      displayName: 'Jack',
      verifiedType: 'blue',
      followedByUser: false,
      followerCount: 7000000,
    })
  })

  it('reads counts and views', () => {
    expect(result.posts[0].counts).toEqual({
      reply: 3, repost: 5, like: 9, quote: 1, view: 4200,
    })
  })

  it('reads media and links', () => {
    expect(result.posts[0].media).toEqual([
      { type: 'photo', url: 'https://pbs.example/a.jpg', alt: 'a photo' },
    ])
    expect(result.posts[0].links).toEqual(['https://example.com/a'])
  })

  it('marks a promoted post', () => {
    expect(result.posts[1].isPromoted).toBe(true)
    expect(result.posts[0].isPromoted).toBe(false)
  })

  it('marks the source as graphql', () => {
    expect(result.posts[0].source).toBe('graphql')
  })

  it('counts an unknown entry type instead of throwing', () => {
    expect(result.unknownEntryTypes).toEqual(['TimelineTimelineModule'])
  })

  it('survives an empty payload', () => {
    expect(normalizeTimeline({})).toEqual({ posts: [], unknownEntryTypes: [] })
  })

  it('survives a null payload', () => {
    expect(normalizeTimeline(null)).toEqual({ posts: [], unknownEntryTypes: [] })
  })

  it('defaults missing view counts to null', () => {
    expect(result.posts[1].counts.view).toBeNull()
  })
})
```

- [ ] **Step 3: Run it and confirm it fails**

Run: `bun run test tests/adapter/normalize.test.ts`
Expected: FAIL, cannot resolve `normalize`.

- [ ] **Step 4: Write the normalizer**

```ts
// src/core/adapter/normalize.ts
import type { Post, PostMedia, VerifiedType } from '../types'

export interface NormalizeResult {
  posts: Post[]
  unknownEntryTypes: string[]
}

type Dict = Record<string, unknown>

const isDict = (v: unknown): v is Dict => typeof v === 'object' && v !== null

function get(root: unknown, path: string[]): unknown {
  let node: unknown = root
  for (const key of path) {
    if (!isDict(node)) return undefined
    node = node[key]
  }
  return node
}

function collectInstructions(payload: unknown): Dict[] {
  const found: Dict[] = []
  const walk = (node: unknown, depth: number): void => {
    if (depth > 8 || !isDict(node)) return
    for (const [key, value] of Object.entries(node)) {
      if (key === 'instructions' && Array.isArray(value)) {
        for (const item of value) if (isDict(item)) found.push(item)
      } else walk(value, depth + 1)
    }
  }
  walk(payload, 0)
  return found
}

function verifiedTypeOf(user: Dict): VerifiedType | null {
  if (user.is_blue_verified === true) return 'blue'
  const legacyType = get(user, ['verified_type'])
  if (legacyType === 'Business') return 'business'
  if (legacyType === 'Government') return 'government'
  if (user.legacy || user.rest_id) return 'none'
  return null
}

function mediaOf(legacy: Dict): PostMedia[] {
  const raw = get(legacy, ['entities', 'media'])
  if (!Array.isArray(raw)) return []
  return raw.filter(isDict).map((m) => ({
    type: m.type === 'video' ? 'video' : m.type === 'animated_gif' ? 'gif' : 'photo',
    url: typeof m.media_url_https === 'string' ? m.media_url_https : '',
    alt: typeof m.ext_alt_text === 'string' ? m.ext_alt_text : null,
  }))
}

function linksOf(legacy: Dict): string[] {
  const raw = get(legacy, ['entities', 'urls'])
  if (!Array.isArray(raw)) return []
  return raw
    .filter(isDict)
    .map((u) => u.expanded_url)
    .filter((u): u is string => typeof u === 'string')
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' ? value : fallback
}

export function normalizeTweetResult(result: unknown, isPromoted: boolean): Post | null {
  if (!isDict(result)) return null
  const inner = isDict(result.tweet) ? (result.tweet as Dict) : result
  const id = inner.rest_id
  const legacy = get(inner, ['legacy'])
  if (typeof id !== 'string' || !isDict(legacy)) return null

  const user = get(inner, ['core', 'user_results', 'result'])
  const userLegacy = isDict(user) ? get(user, ['legacy']) : undefined
  const viewCount = get(inner, ['views', 'count'])

  return {
    id,
    source: 'graphql',
    createdAt: typeof legacy.created_at === 'string' ? legacy.created_at : null,
    text: typeof legacy.full_text === 'string' ? legacy.full_text : '',
    lang: typeof legacy.lang === 'string' ? legacy.lang : null,
    author: {
      id: isDict(user) && typeof user.rest_id === 'string' ? user.rest_id : null,
      handle: isDict(userLegacy) && typeof userLegacy.screen_name === 'string' ? userLegacy.screen_name : '',
      displayName: isDict(userLegacy) && typeof userLegacy.name === 'string' ? userLegacy.name : '',
      verifiedType: isDict(user) ? verifiedTypeOf(user) : null,
      followedByUser: isDict(userLegacy) && typeof userLegacy.following === 'boolean' ? userLegacy.following : null,
      followerCount: isDict(userLegacy) && typeof userLegacy.followers_count === 'number' ? userLegacy.followers_count : null,
    },
    counts: {
      reply: numberOr(legacy.reply_count, 0),
      repost: numberOr(legacy.retweet_count, 0),
      like: numberOr(legacy.favorite_count, 0),
      quote: numberOr(legacy.quote_count, 0),
      view: typeof viewCount === 'string' ? Number(viewCount) : null,
    },
    media: mediaOf(legacy),
    links: linksOf(legacy),
    isPromoted,
    isReply: typeof legacy.in_reply_to_status_id_str === 'string',
    quotedId: typeof legacy.quoted_status_id_str === 'string' ? legacy.quoted_status_id_str : null,
    repostOfId: (get(legacy, ['retweeted_status_result', 'result', 'rest_id']) as string) ?? null,
  }
}

export function normalizeTimeline(payload: unknown): NormalizeResult {
  const posts: Post[] = []
  const unknownEntryTypes: string[] = []

  for (const instruction of collectInstructions(payload)) {
    const entries = instruction.entries
    if (!Array.isArray(entries)) continue

    for (const entry of entries) {
      if (!isDict(entry)) continue
      const content = get(entry, ['content'])
      if (!isDict(content)) continue

      const itemContent = get(content, ['itemContent'])
      if (!isDict(itemContent) || itemContent.itemType !== 'TimelineTweet') {
        const type = content.entryType
        if (typeof type === 'string' && !unknownEntryTypes.includes(type)) {
          unknownEntryTypes.push(type)
        }
        continue
      }

      const post = normalizeTweetResult(
        get(itemContent, ['tweet_results', 'result']),
        isDict(itemContent.promotedMetadata),
      )
      if (post) posts.push(post)
    }
  }

  return { posts, unknownEntryTypes }
}
```

- [ ] **Step 5: Run it and confirm it passes**

Run: `bun run test tests/adapter/normalize.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 6: Record the fixture limit**

Add to `tests/fixtures/README.md`:

```markdown
# Fixtures

`home-timeline.json` is synthetic. It matches the shape of X's HomeTimeline response
as of 2026-08. Before each release, capture a real response from a logged-in session,
scrub account data, and add it beside this file. A synthetic fixture proves the
normalizer's logic; only a captured one proves the shape is still current.
```

- [ ] **Step 7: Commit**

```bash
git add src/core/adapter/normalize.ts tests/adapter/normalize.test.ts tests/fixtures
git commit -m "feat(adapter): normalize graphql timeline payloads into post records"
```

---

### Task 5: PostStore join

**Files:**
- Create: `src/core/adapter/post-store.ts`
- Test: `tests/adapter/post-store.test.ts`

**Interfaces:**
- Consumes: `Post` from `src/core/types.ts`
- Produces:
  - `interface PostPair { post: Post; node: HTMLElement }`
  - `interface PostStoreOptions { onPair(pair: PostPair): void; max?: number }`
  - `class PostStore` with `addRecord(post: Post): void`, `addNode(id: string, node: HTMLElement): void`, `size(): { records: number; nodes: number }`

- [ ] **Step 1: Write the failing test**

```ts
// tests/adapter/post-store.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Post, PostPair } from '../../src/core/types'
import { PostStore } from '../../src/core/adapter/post-store'

function makePost(id: string): Post {
  return {
    id, source: 'graphql', createdAt: null, text: '', lang: null,
    author: { id: null, handle: 'a', displayName: 'A', verifiedType: null, followedByUser: null, followerCount: null },
    counts: { reply: 0, repost: 0, like: 0, quote: 0, view: null },
    media: [], links: [], isPromoted: false, isReply: false, quotedId: null, repostOfId: null,
  }
}

describe('PostStore', () => {
  let pairs: PostPair[]
  let store: PostStore

  beforeEach(() => {
    pairs = []
    store = new PostStore({ onPair: (p) => pairs.push(p), max: 3 })
  })

  it('emits when the record arrives after the node', () => {
    const node = document.createElement('div')
    store.addNode('1', node)
    expect(pairs).toHaveLength(0)
    store.addRecord(makePost('1'))
    expect(pairs).toEqual([{ post: makePost('1'), node }])
  })

  it('emits when the node arrives after the record', () => {
    const node = document.createElement('div')
    store.addRecord(makePost('2'))
    expect(pairs).toHaveLength(0)
    store.addNode('2', node)
    expect(pairs).toHaveLength(1)
  })

  it('does not emit twice for the same record and node', () => {
    const node = document.createElement('div')
    store.addRecord(makePost('3'))
    store.addNode('3', node)
    store.addNode('3', node)
    expect(pairs).toHaveLength(1)
  })

  it('emits again when X re-renders the post into a new node', () => {
    store.addRecord(makePost('4'))
    store.addNode('4', document.createElement('div'))
    store.addNode('4', document.createElement('div'))
    expect(pairs).toHaveLength(2)
  })

  it('drops the oldest entries past the limit', () => {
    for (const id of ['a', 'b', 'c', 'd']) store.addRecord(makePost(id))
    expect(store.size().records).toBe(3)
    store.addNode('a', document.createElement('div'))
    expect(pairs).toHaveLength(0)
  })

  it('never throws when a consumer throws', () => {
    const angry = new PostStore({ onPair: () => { throw new Error('tool blew up') } })
    angry.addRecord(makePost('5'))
    expect(() => angry.addNode('5', document.createElement('div'))).not.toThrow()
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `bun run test tests/adapter/post-store.test.ts`
Expected: FAIL, cannot resolve `post-store`.

- [ ] **Step 3: Write the store**

```ts
// src/core/adapter/post-store.ts
import type { Post } from '../types'

export interface PostPair {
  post: Post
  node: HTMLElement
}

export interface PostStoreOptions {
  onPair(pair: PostPair): void
  max?: number
}

class Bounded<V> extends Map<string, V> {
  constructor(private readonly max: number) {
    super()
  }

  put(key: string, value: V): void {
    if (this.has(key)) this.delete(key)
    this.set(key, value)
    while (this.size > this.max) {
      const oldest = this.keys().next().value as string
      this.delete(oldest)
    }
  }
}

export class PostStore {
  private readonly records: Bounded<Post>
  private readonly nodes: Bounded<HTMLElement>
  private readonly paired = new Map<string, HTMLElement>()

  constructor(private readonly options: PostStoreOptions) {
    const max = options.max ?? 500
    this.records = new Bounded<Post>(max)
    this.nodes = new Bounded<HTMLElement>(max)
  }

  addRecord(post: Post): void {
    this.records.put(post.id, post)
    this.tryPair(post.id)
  }

  addNode(id: string, node: HTMLElement): void {
    this.nodes.put(id, node)
    this.tryPair(id)
  }

  size(): { records: number; nodes: number } {
    return { records: this.records.size, nodes: this.nodes.size }
  }

  private tryPair(id: string): void {
    const post = this.records.get(id)
    const node = this.nodes.get(id)
    if (!post || !node) return
    if (this.paired.get(id) === node) return

    this.paired.set(id, node)
    try {
      this.options.onPair({ post, node })
    } catch {
      // A consumer failure must never break the timeline. The registry reports it.
    }
  }
}
```

- [ ] **Step 4: Run it and confirm it passes**

Run: `bun run test tests/adapter/post-store.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/core/adapter/post-store.ts tests/adapter/post-store.test.ts
git commit -m "feat(adapter): join post records with their rendered nodes"
```

---

### Task 6: Verdict merge and the DOM writer

**Files:**
- Create: `src/core/tools/verdict.ts`, `src/core/tools/apply.ts`, `src/core/ui/content.css`
- Test: `tests/tools/verdict.test.ts`, `tests/tools/apply.test.ts`

**Interfaces:**
- Consumes: `Verdict` from `src/core/types.ts`
- Produces:
  - `mergeVerdicts(verdicts: Array<Verdict | void>): Verdict`
  - `ATTR_ACTION = 'data-xmt'`, `ATTR_REASON = 'data-xmt-reason'`, `ATTR_LABEL = 'data-xmt-label'`
  - `applyVerdict(node: HTMLElement, verdict: Verdict): void`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/tools/verdict.test.ts
import { describe, expect, it } from 'vitest'
import { mergeVerdicts } from '../../src/core/tools/verdict'

describe('mergeVerdicts', () => {
  it('passes when there is nothing to say', () => {
    expect(mergeVerdicts([])).toEqual({ action: 'pass' })
  })

  it('ignores hooks that returned nothing', () => {
    expect(mergeVerdicts([undefined, undefined])).toEqual({ action: 'pass' })
  })

  it('lets hide beat dim and badge', () => {
    expect(
      mergeVerdicts([
        { action: 'dim', reason: 'low signal' },
        { action: 'hide', reason: 'promoted' },
        { action: 'badge', reason: 'bait', label: 'bait' },
      ]),
    ).toEqual({ action: 'hide', reason: 'promoted' })
  })

  it('lets dim beat badge', () => {
    expect(
      mergeVerdicts([
        { action: 'badge', reason: 'bait', label: 'bait' },
        { action: 'dim', reason: 'muted word' },
      ]),
    ).toEqual({ action: 'dim', reason: 'muted word' })
  })

  it('keeps the first verdict when two tools agree on the action', () => {
    expect(
      mergeVerdicts([
        { action: 'hide', reason: 'first' },
        { action: 'hide', reason: 'second' },
      ]),
    ).toEqual({ action: 'hide', reason: 'first' })
  })
})
```

```ts
// tests/tools/apply.test.ts
import { describe, expect, it } from 'vitest'
import { ATTR_ACTION, ATTR_LABEL, ATTR_REASON, applyVerdict } from '../../src/core/tools/apply'

describe('applyVerdict', () => {
  it('marks a hidden node with its reason', () => {
    const node = document.createElement('div')
    applyVerdict(node, { action: 'hide', reason: 'promoted' })
    expect(node.getAttribute(ATTR_ACTION)).toBe('hide')
    expect(node.getAttribute(ATTR_REASON)).toBe('promoted')
  })

  it('carries the label of a badge', () => {
    const node = document.createElement('div')
    applyVerdict(node, { action: 'badge', reason: 'engagement bait', label: 'bait' })
    expect(node.getAttribute(ATTR_LABEL)).toBe('bait')
  })

  it('clears every mark on pass', () => {
    const node = document.createElement('div')
    applyVerdict(node, { action: 'hide', reason: 'promoted' })
    applyVerdict(node, { action: 'pass' })
    expect(node.hasAttribute(ATTR_ACTION)).toBe(false)
    expect(node.hasAttribute(ATTR_REASON)).toBe(false)
    expect(node.hasAttribute(ATTR_LABEL)).toBe(false)
  })

  it('never sets an inline style', () => {
    const node = document.createElement('div')
    applyVerdict(node, { action: 'dim', reason: 'muted' })
    expect(node.getAttribute('style')).toBeNull()
  })
})
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `bun run test tests/tools`
Expected: FAIL, cannot resolve `verdict` and `apply`.

- [ ] **Step 3: Write the merge and the writer**

```ts
// src/core/tools/verdict.ts
import type { Verdict } from '../types'

const PRECEDENCE: Record<Verdict['action'], number> = { hide: 3, dim: 2, badge: 1, pass: 0 }

export function mergeVerdicts(verdicts: Array<Verdict | void>): Verdict {
  let winner: Verdict = { action: 'pass' }
  for (const verdict of verdicts) {
    if (!verdict) continue
    if (PRECEDENCE[verdict.action] > PRECEDENCE[winner.action]) winner = verdict
  }
  return winner
}
```

```ts
// src/core/tools/apply.ts
import type { Verdict } from '../types'

export const ATTR_ACTION = 'data-xmt'
export const ATTR_REASON = 'data-xmt-reason'
export const ATTR_LABEL = 'data-xmt-label'

export function applyVerdict(node: HTMLElement, verdict: Verdict): void {
  if (verdict.action === 'pass') {
    node.removeAttribute(ATTR_ACTION)
    node.removeAttribute(ATTR_REASON)
    node.removeAttribute(ATTR_LABEL)
    return
  }

  node.setAttribute(ATTR_ACTION, verdict.action)
  node.setAttribute(ATTR_REASON, verdict.reason)
  if (verdict.action === 'badge') node.setAttribute(ATTR_LABEL, verdict.label)
  else node.removeAttribute(ATTR_LABEL)
}
```

```css
/* src/core/ui/content.css — the only styles injected into x.com */
[data-xmt='hide'] {
  display: none !important;
}

[data-xmt='dim'] {
  opacity: 0.35;
  transition: opacity 120ms ease;
}

[data-xmt='dim']:hover {
  opacity: 1;
}
```

The badge element itself is built by module 1, which owns the in-page affordances. The core only marks the node.

- [ ] **Step 4: Run them and confirm they pass**

Run: `bun run test tests/tools`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add src/core/tools/verdict.ts src/core/tools/apply.ts src/core/ui/content.css tests/tools
git commit -m "feat(tools): merge verdicts and mark nodes from one writer"
```

---

### Task 7: Tool registry and containment

**Files:**
- Create: `src/core/tools/registry.ts`
- Test: `tests/tools/registry.test.ts`

**Interfaces:**
- Consumes: `Tool`, `ToolCtx`, `Post`, `Route`, `Command`, `Verdict`; `mergeVerdicts`
- Produces:
  - `interface RegistryOptions { tools: Array<Tool<any>>; isEnabled(id: string): boolean; contextFor(id: string): ToolCtx<any>; onDisable(id: string, error: unknown): void; maxFailures?: number }`
  - `class ToolRegistry` with `init(): Promise<void>`, `runPost(post, node): Verdict`, `runRoute(route): void`, `runCommand(cmd): void`, `isDisabled(id): boolean`, `failures(id): number`

- [ ] **Step 1: Write the failing test**

```ts
// tests/tools/registry.test.ts
import { describe, expect, it, vi } from 'vitest'
import type { Post, Tool, ToolCtx } from '../../src/core/types'
import { ToolRegistry } from '../../src/core/tools/registry'

const post = { id: '1' } as Post
const node = () => document.createElement('div')
const ctx = { settings: {}, storage: { get: async () => undefined, set: async () => {} }, log: { info() {}, warn() {}, error() {} } } as ToolCtx<any>

function tool(id: string, onPost: Tool<any>['onPost']): Tool<any> {
  return { id, name: id, description: '', module: 'core', settings: {} as any, onPost }
}

function registry(tools: Tool<any>[], overrides: Partial<ConstructorParameters<typeof ToolRegistry>[0]> = {}) {
  return new ToolRegistry({
    tools,
    isEnabled: () => true,
    contextFor: () => ctx,
    onDisable: () => {},
    ...overrides,
  })
}

describe('ToolRegistry', () => {
  it('merges the verdicts of every enabled tool', () => {
    const r = registry([
      tool('a', () => ({ action: 'dim', reason: 'a' })),
      tool('b', () => ({ action: 'hide', reason: 'b' })),
    ])
    expect(r.runPost(post, node())).toEqual({ action: 'hide', reason: 'b' })
  })

  it('skips a disabled tool', () => {
    const seen: string[] = []
    const r = registry(
      [tool('a', () => { seen.push('a') }), tool('b', () => { seen.push('b') })],
      { isEnabled: (id) => id === 'b' },
    )
    r.runPost(post, node())
    expect(seen).toEqual(['b'])
  })

  it('keeps running the other tools when one throws', () => {
    const r = registry([
      tool('bad', () => { throw new Error('boom') }),
      tool('good', () => ({ action: 'hide', reason: 'good' })),
    ])
    expect(r.runPost(post, node())).toEqual({ action: 'hide', reason: 'good' })
  })

  it('counts failures per tool', () => {
    const r = registry([tool('bad', () => { throw new Error('boom') })])
    r.runPost(post, node())
    r.runPost(post, node())
    expect(r.failures('bad')).toBe(2)
    expect(r.isDisabled('bad')).toBe(false)
  })

  it('disables a tool after three failures and reports once', () => {
    const onDisable = vi.fn()
    const r = registry([tool('bad', () => { throw new Error('boom') })], { onDisable })
    for (let i = 0; i < 5; i += 1) r.runPost(post, node())
    expect(r.isDisabled('bad')).toBe(true)
    expect(onDisable).toHaveBeenCalledTimes(1)
    expect(onDisable.mock.calls[0][0]).toBe('bad')
  })

  it('stops calling a disabled tool', () => {
    const onPost = vi.fn(() => { throw new Error('boom') })
    const r = registry([tool('bad', onPost)])
    for (let i = 0; i < 6; i += 1) r.runPost(post, node())
    expect(onPost).toHaveBeenCalledTimes(3)
  })

  it('contains a throw in onRoute and onCommand', () => {
    const r = registry([{
      id: 'bad', name: 'bad', description: '', module: 'core', settings: {} as any,
      onRoute: () => { throw new Error('boom') },
      onCommand: () => { throw new Error('boom') },
    }])
    expect(() => r.runRoute({ kind: 'home', params: {} })).not.toThrow()
    expect(() => r.runCommand({ id: 'x' })).not.toThrow()
    expect(r.failures('bad')).toBe(2)
  })

  it('contains a throw in onInit', async () => {
    const r = registry([{
      id: 'bad', name: 'bad', description: '', module: 'core', settings: {} as any,
      onInit: () => { throw new Error('boom') },
    }])
    await expect(r.init()).resolves.toBeUndefined()
    expect(r.failures('bad')).toBe(1)
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `bun run test tests/tools/registry.test.ts`
Expected: FAIL, cannot resolve `registry`.

- [ ] **Step 3: Write the registry**

```ts
// src/core/tools/registry.ts
import type { Command, Post, Route, Tool, ToolCtx, Verdict } from '../types'
import { mergeVerdicts } from './verdict'

export interface RegistryOptions {
  tools: Array<Tool<any>>
  isEnabled(id: string): boolean
  contextFor(id: string): ToolCtx<any>
  onDisable(id: string, error: unknown): void
  maxFailures?: number
}

export class ToolRegistry {
  private readonly failureCount = new Map<string, number>()
  private readonly disabled = new Set<string>()
  private readonly maxFailures: number

  constructor(private readonly options: RegistryOptions) {
    this.maxFailures = options.maxFailures ?? 3
  }

  async init(): Promise<void> {
    for (const tool of this.active()) {
      try {
        await tool.onInit?.(this.options.contextFor(tool.id))
      } catch (error) {
        this.recordFailure(tool.id, error)
      }
    }
  }

  runPost(post: Post, node: HTMLElement): Verdict {
    const verdicts: Array<Verdict | void> = []
    for (const tool of this.active()) {
      if (!tool.onPost) continue
      try {
        verdicts.push(tool.onPost(post, node, this.options.contextFor(tool.id)))
      } catch (error) {
        this.recordFailure(tool.id, error)
      }
    }
    return mergeVerdicts(verdicts)
  }

  runRoute(route: Route): void {
    this.each((tool, ctx) => tool.onRoute?.(route, ctx))
  }

  runCommand(cmd: Command): void {
    this.each((tool, ctx) => tool.onCommand?.(cmd, ctx))
  }

  isDisabled(id: string): boolean {
    return this.disabled.has(id)
  }

  failures(id: string): number {
    return this.failureCount.get(id) ?? 0
  }

  private each(run: (tool: Tool<any>, ctx: ToolCtx<any>) => void): void {
    for (const tool of this.active()) {
      try {
        run(tool, this.options.contextFor(tool.id))
      } catch (error) {
        this.recordFailure(tool.id, error)
      }
    }
  }

  private *active(): Generator<Tool<any>> {
    for (const tool of this.options.tools) {
      if (this.disabled.has(tool.id)) continue
      if (!this.options.isEnabled(tool.id)) continue
      yield tool
    }
  }

  private recordFailure(id: string, error: unknown): void {
    const count = this.failures(id) + 1
    this.failureCount.set(id, count)
    if (count >= this.maxFailures && !this.disabled.has(id)) {
      this.disabled.add(id)
      this.options.onDisable(id, error)
    }
  }
}
```

- [ ] **Step 4: Run it and confirm it passes**

Run: `bun run test tests/tools/registry.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/core/tools/registry.ts tests/tools/registry.test.ts
git commit -m "feat(tools): add registry with per-tool failure containment"
```

---

### Task 8: Settings schema, store and migrations

**Files:**
- Create: `src/core/settings/schema.ts`, `src/core/settings/migrations.ts`, `src/core/settings/store.ts`
- Test: `tests/settings/schema.test.ts`, `tests/settings/store.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `type Field` (union of `boolean`, `number`, `string`, `enum`, `stringList` entries)
  - `type Schema<S> = { [K in keyof S]: Field }`
  - `defaultsOf<S>(schema: Schema<S>): S`
  - `coerce<S>(schema: Schema<S>, raw: unknown): S`
  - `SETTINGS_KEY`, `SETTINGS_VERSION`, `interface StoredSettings`, `migrate(raw: unknown): StoredSettings`
  - `interface StorageArea { get(key): Promise<unknown>; set(key, value): Promise<void>; onChanged(cb: (key: string) => void): () => void }`
  - `class SettingsStore`

- [ ] **Step 1: Write the failing schema test**

```ts
// tests/settings/schema.test.ts
import { describe, expect, it } from 'vitest'
import { coerce, defaultsOf, type Schema } from '../../src/core/settings/schema'

interface Demo {
  on: boolean
  limit: number
  label: string
  mode: string
  words: string[]
}

const schema: Schema<Demo> = {
  on: { type: 'boolean', default: true, label: 'On' },
  limit: { type: 'number', default: 5, min: 0, max: 10, label: 'Limit' },
  label: { type: 'string', default: 'hi', label: 'Label' },
  mode: { type: 'enum', default: 'a', options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }], label: 'Mode' },
  words: { type: 'stringList', default: [], label: 'Words' },
}

describe('defaultsOf', () => {
  it('builds an object from the declared defaults', () => {
    expect(defaultsOf(schema)).toEqual({ on: true, limit: 5, label: 'hi', mode: 'a', words: [] })
  })

  it('copies list defaults so two tools cannot share an array', () => {
    const first = defaultsOf(schema)
    first.words.push('x')
    expect(defaultsOf(schema).words).toEqual([])
  })
})

describe('coerce', () => {
  it('fills missing fields with defaults', () => {
    expect(coerce(schema, { limit: 2 })).toEqual({ on: true, limit: 2, label: 'hi', mode: 'a', words: [] })
  })

  it('drops unknown keys', () => {
    expect(coerce(schema, { nope: 1 })).not.toHaveProperty('nope')
  })

  it('replaces a value of the wrong type with the default', () => {
    expect(coerce(schema, { on: 'yes' }).on).toBe(true)
  })

  it('clamps a number to its range', () => {
    expect(coerce(schema, { limit: 99 }).limit).toBe(10)
    expect(coerce(schema, { limit: -4 }).limit).toBe(0)
  })

  it('rejects an enum value that is not an option', () => {
    expect(coerce(schema, { mode: 'z' }).mode).toBe('a')
  })

  it('keeps only strings inside a list', () => {
    expect(coerce(schema, { words: ['a', 3, null, 'b'] }).words).toEqual(['a', 'b'])
  })

  it('survives a non-object input', () => {
    expect(coerce(schema, null)).toEqual(defaultsOf(schema))
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `bun run test tests/settings/schema.test.ts`
Expected: FAIL, cannot resolve `schema`.

- [ ] **Step 3: Write the schema module**

```ts
// src/core/settings/schema.ts
export interface FieldBase {
  label: string
  help?: string
}

export type Field =
  | (FieldBase & { type: 'boolean'; default: boolean })
  | (FieldBase & { type: 'number'; default: number; min?: number; max?: number })
  | (FieldBase & { type: 'string'; default: string; placeholder?: string })
  | (FieldBase & { type: 'enum'; default: string; options: Array<{ value: string; label: string }> })
  | (FieldBase & { type: 'stringList'; default: string[] })

export type Schema<S> = { [K in keyof S]: Field }

function defaultOf(field: Field): unknown {
  return field.type === 'stringList' ? [...field.default] : field.default
}

export function defaultsOf<S>(schema: Schema<S>): S {
  const out: Record<string, unknown> = {}
  for (const [key, field] of Object.entries(schema) as Array<[string, Field]>) {
    out[key] = defaultOf(field)
  }
  return out as S
}

function coerceField(field: Field, value: unknown): unknown {
  switch (field.type) {
    case 'boolean':
      return typeof value === 'boolean' ? value : field.default
    case 'number': {
      if (typeof value !== 'number' || Number.isNaN(value)) return field.default
      const min = field.min ?? Number.NEGATIVE_INFINITY
      const max = field.max ?? Number.POSITIVE_INFINITY
      return Math.min(max, Math.max(min, value))
    }
    case 'string':
      return typeof value === 'string' ? value : field.default
    case 'enum':
      return field.options.some((o) => o.value === value) ? value : field.default
    case 'stringList':
      return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [...field.default]
  }
}

export function coerce<S>(schema: Schema<S>, raw: unknown): S {
  const source = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
  const out: Record<string, unknown> = {}
  for (const [key, field] of Object.entries(schema) as Array<[string, Field]>) {
    out[key] = key in source ? coerceField(field, source[key]) : defaultOf(field)
  }
  return out as S
}
```

- [ ] **Step 4: Run it and confirm it passes**

Run: `bun run test tests/settings/schema.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Write the failing store test**

```ts
// tests/settings/store.test.ts
import { describe, expect, it, vi } from 'vitest'
import type { StorageArea } from '../../src/core/settings/store'
import { SETTINGS_KEY, SETTINGS_VERSION, SettingsStore, migrate } from '../../src/core/settings/store'

function fakeArea(initial: Record<string, unknown> = {}): StorageArea & { data: Record<string, unknown> } {
  const listeners: Array<(key: string) => void> = []
  return {
    data: { ...initial },
    async get(key) {
      return this.data[key]
    },
    async set(key, value) {
      this.data[key] = value
      for (const listener of listeners) listener(key)
    },
    onChanged(cb) {
      listeners.push(cb)
      return () => listeners.splice(listeners.indexOf(cb), 1)
    },
  }
}

describe('migrate', () => {
  it('builds a fresh object from nothing', () => {
    expect(migrate(undefined)).toEqual({
      version: SETTINGS_VERSION, enabled: {}, tools: {}, ui: { theme: 'auto' },
    })
  })

  it('keeps known data from a current-version object', () => {
    const stored = { version: SETTINGS_VERSION, enabled: { a: true }, tools: { a: { x: 1 } }, ui: { theme: 'dim' } }
    expect(migrate(stored)).toEqual(stored)
  })

  it('repairs a corrupt object instead of throwing', () => {
    expect(migrate({ version: SETTINGS_VERSION, enabled: 'no', tools: null, ui: 5 })).toEqual({
      version: SETTINGS_VERSION, enabled: {}, tools: {}, ui: { theme: 'auto' },
    })
  })

  it('refuses a version from the future and starts fresh', () => {
    expect(migrate({ version: SETTINGS_VERSION + 99, enabled: { a: true } }).enabled).toEqual({})
  })
})

describe('SettingsStore', () => {
  it('loads defaults on a fresh profile', async () => {
    const store = new SettingsStore(fakeArea())
    await store.load()
    expect(store.snapshot().version).toBe(SETTINGS_VERSION)
  })

  it('writes and reads a tool enable flag', async () => {
    const area = fakeArea()
    const store = new SettingsStore(area)
    await store.load()
    await store.setEnabled('core:diagnostics', true)
    expect(store.isEnabled('core:diagnostics')).toBe(true)
    expect((area.data[SETTINGS_KEY] as any).enabled['core:diagnostics']).toBe(true)
  })

  it('treats an unknown tool as disabled', async () => {
    const store = new SettingsStore(fakeArea())
    await store.load()
    expect(store.isEnabled('nope')).toBe(false)
  })

  it('merges a tool settings patch', async () => {
    const store = new SettingsStore(fakeArea())
    await store.load()
    await store.patchTool('a', { x: 1 })
    await store.patchTool('a', { y: 2 })
    expect(store.rawToolSettings('a')).toEqual({ x: 1, y: 2 })
  })

  it('tells subscribers about a change', async () => {
    const store = new SettingsStore(fakeArea())
    await store.load()
    const seen = vi.fn()
    store.subscribe(seen)
    await store.setEnabled('a', true)
    expect(seen).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 6: Run it and confirm it fails**

Run: `bun run test tests/settings/store.test.ts`
Expected: FAIL, cannot resolve `store`.

- [ ] **Step 7: Write the migrations and the store**

```ts
// src/core/settings/migrations.ts
import type { StoredSettings } from './store'

// One entry per version step. A migration receives the object at version N
// and returns the object at version N + 1. Add entries; never edit an old one.
export const migrations: Record<number, (raw: Record<string, unknown>) => Record<string, unknown>> = {}

export function runMigrations(raw: Record<string, unknown>, from: number, to: number): Record<string, unknown> {
  let current = raw
  for (let version = from; version < to; version += 1) {
    const step = migrations[version]
    if (step) current = step(current)
  }
  return current
}
```

```ts
// src/core/settings/store.ts
import { runMigrations } from './migrations'

export const SETTINGS_KEY = 'xmt:settings'
export const SETTINGS_VERSION = 1

export type ThemeChoice = 'auto' | 'light' | 'dim' | 'lights-out'

export interface StoredSettings {
  version: number
  enabled: Record<string, boolean>
  tools: Record<string, Record<string, unknown>>
  ui: { theme: ThemeChoice }
}

export interface StorageArea {
  get(key: string): Promise<unknown>
  set(key: string, value: unknown): Promise<void>
  onChanged(cb: (key: string) => void): () => void
}

const THEMES: ThemeChoice[] = ['auto', 'light', 'dim', 'lights-out']

function fresh(): StoredSettings {
  return { version: SETTINGS_VERSION, enabled: {}, tools: {}, ui: { theme: 'auto' } }
}

const isDict = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

export function migrate(raw: unknown): StoredSettings {
  if (!isDict(raw)) return fresh()
  const version = typeof raw.version === 'number' ? raw.version : 0
  if (version > SETTINGS_VERSION) return fresh()

  const migrated = runMigrations(raw, version, SETTINGS_VERSION)
  const enabled = isDict(migrated.enabled) ? migrated.enabled : {}
  const tools = isDict(migrated.tools) ? migrated.tools : {}
  const ui = isDict(migrated.ui) ? migrated.ui : {}
  const theme = THEMES.includes(ui.theme as ThemeChoice) ? (ui.theme as ThemeChoice) : 'auto'

  return {
    version: SETTINGS_VERSION,
    enabled: Object.fromEntries(
      Object.entries(enabled).filter(([, v]) => typeof v === 'boolean'),
    ) as Record<string, boolean>,
    tools: Object.fromEntries(
      Object.entries(tools).filter(([, v]) => isDict(v)),
    ) as Record<string, Record<string, unknown>>,
    ui: { theme },
  }
}

export class SettingsStore {
  private state: StoredSettings = fresh()
  private readonly listeners = new Set<(state: StoredSettings) => void>()

  constructor(private readonly area: StorageArea) {}

  async load(): Promise<StoredSettings> {
    this.state = migrate(await this.area.get(SETTINGS_KEY))
    return this.state
  }

  snapshot(): StoredSettings {
    return this.state
  }

  isEnabled(toolId: string): boolean {
    return this.state.enabled[toolId] === true
  }

  rawToolSettings(toolId: string): Record<string, unknown> {
    return this.state.tools[toolId] ?? {}
  }

  async setEnabled(toolId: string, on: boolean): Promise<void> {
    this.state = { ...this.state, enabled: { ...this.state.enabled, [toolId]: on } }
    await this.persist()
  }

  async patchTool(toolId: string, patch: Record<string, unknown>): Promise<void> {
    const merged = { ...this.rawToolSettings(toolId), ...patch }
    this.state = { ...this.state, tools: { ...this.state.tools, [toolId]: merged } }
    await this.persist()
  }

  async setTheme(theme: ThemeChoice): Promise<void> {
    this.state = { ...this.state, ui: { ...this.state.ui, theme } }
    await this.persist()
  }

  async replace(next: StoredSettings): Promise<void> {
    this.state = migrate(next)
    await this.persist()
  }

  subscribe(listener: (state: StoredSettings) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private async persist(): Promise<void> {
    await this.area.set(SETTINGS_KEY, this.state)
    for (const listener of this.listeners) listener(this.state)
  }
}
```

- [ ] **Step 8: Run the settings tests and confirm they pass**

Run: `bun run test tests/settings`
Expected: PASS, 15 tests.

- [ ] **Step 9: Commit**

```bash
git add src/core/settings tests/settings
git commit -m "feat(settings): add schema, migrations and settings store"
```

---

### Task 9: Browser wrapper and typed bus

**Files:**
- Create: `src/core/browser.ts`, `src/core/browser-live.ts`, `src/core/bus.ts`
- Test: `tests/core/browser.test.ts`, `tests/core/bus.test.ts`

**Interfaces:**
- Consumes: `StorageArea` from `src/core/settings/store.ts`
- Produces:
  - `createStorageArea(api: StorageApi): StorageArea`
  - `interface StorageApi { get(key: string): Promise<Record<string, unknown>>; set(items: Record<string, unknown>): Promise<void>; addChangeListener(cb: (keys: string[]) => void): () => void }`
  - `createBus(transport: BusTransport): Bus` with `request<T>(type, payload)`, `handle(type, handler)`, `emit(type, payload)`, `on(type, handler)`
  - `browserApi` from `browser-live.ts`: `{ storage: StorageArea; bus: Bus; openSidePanel(tabId: number): Promise<void>; requestPermissions(names: string[]): Promise<boolean> }`

`browser.ts` holds pure factories and imports nothing from WXT, so the tests can run under Vitest. `browser-live.ts` is the only file that binds them to the real extension APIs.

- [ ] **Step 1: Write the failing browser test**

```ts
// tests/core/browser.test.ts
import { describe, expect, it, vi } from 'vitest'
import { createStorageArea, type StorageApi } from '../../src/core/browser'

function fakeApi(): StorageApi & { store: Record<string, unknown> } {
  const listeners: Array<(keys: string[]) => void> = []
  return {
    store: {},
    async get(key) {
      return key in this.store ? { [key]: this.store[key] } : {}
    },
    async set(items) {
      Object.assign(this.store, items)
      for (const listener of listeners) listener(Object.keys(items))
    },
    addChangeListener(cb) {
      listeners.push(cb)
      return () => listeners.splice(listeners.indexOf(cb), 1)
    },
  }
}

describe('createStorageArea', () => {
  it('returns undefined for a missing key', async () => {
    const area = createStorageArea(fakeApi())
    expect(await area.get('nope')).toBeUndefined()
  })

  it('round-trips a value', async () => {
    const area = createStorageArea(fakeApi())
    await area.set('k', { a: 1 })
    expect(await area.get('k')).toEqual({ a: 1 })
  })

  it('reports a change for the written key only', async () => {
    const area = createStorageArea(fakeApi())
    const seen = vi.fn()
    area.onChanged(seen)
    await area.set('k', 1)
    expect(seen).toHaveBeenCalledWith('k')
  })

  it('stops reporting after unsubscribe', async () => {
    const area = createStorageArea(fakeApi())
    const seen = vi.fn()
    area.onChanged(seen)()
    await area.set('k', 1)
    expect(seen).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `bun run test tests/core/browser.test.ts`
Expected: FAIL, cannot resolve `browser`.

- [ ] **Step 3: Write the browser wrapper**

```ts
// src/core/browser.ts
import type { StorageArea } from './settings/store'

export interface StorageApi {
  get(key: string): Promise<Record<string, unknown>>
  set(items: Record<string, unknown>): Promise<void>
  addChangeListener(cb: (keys: string[]) => void): () => void
}

export function createStorageArea(api: StorageApi): StorageArea {
  return {
    async get(key) {
      const result = await api.get(key)
      return result[key]
    },
    async set(key, value) {
      await api.set({ [key]: value })
    },
    onChanged(cb) {
      return api.addChangeListener((keys) => {
        for (const key of keys) cb(key)
      })
    },
  }
}
```

```ts
// src/core/browser-live.ts
import { browser } from 'wxt/browser'
import { createStorageArea, type StorageApi } from './browser'
import { createBus } from './bus'

const storageApi: StorageApi = {
  get: (key) => browser.storage.local.get(key) as Promise<Record<string, unknown>>,
  set: (items) => browser.storage.local.set(items),
  addChangeListener(cb) {
    const listener = (changes: Record<string, unknown>) => cb(Object.keys(changes))
    browser.storage.local.onChanged.addListener(listener)
    return () => browser.storage.local.onChanged.removeListener(listener)
  },
}

export const storage = createStorageArea(storageApi)

export const bus = createBus({
  send: (message) => browser.runtime.sendMessage(message),
  onMessage(cb) {
    const listener = (message: unknown) => cb(message)
    browser.runtime.onMessage.addListener(listener)
    return () => browser.runtime.onMessage.removeListener(listener)
  },
})

// runtime.sendMessage never reaches a content script. Anything answered inside the
// x.com tab has to travel through tabs.sendMessage, so the background relays it.
export async function requestActiveTab<T>(type: string, payload: unknown): Promise<T> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id) throw new Error('Open an x.com tab first.')
  const reply = (await browser.tabs.sendMessage(tab.id, { xmt: 'request', type, payload })) as
    | { ok: boolean; value?: unknown; error?: string }
    | undefined
  if (!reply) throw new Error(`xmt: no handler for "${type}"`)
  if (!reply.ok) throw new Error(reply.error ?? 'xmt: request failed')
  return reply.value as T
}

export async function requestPermissions(names: string[]): Promise<boolean> {
  return browser.permissions.request({ permissions: names })
}

export async function openSidePanel(tabId: number): Promise<void> {
  // chrome.sidePanel has no Firefox counterpart; the Firefox build uses sidebar_action,
  // which opens from the manifest and needs no call here.
  const api = (browser as unknown as { sidePanel?: { open(o: { tabId: number }): Promise<void> } }).sidePanel
  await api?.open({ tabId })
}
```

- [ ] **Step 4: Write the failing bus test**

```ts
// tests/core/bus.test.ts
import { describe, expect, it, vi } from 'vitest'
import { createBus, type BusTransport } from '../../src/core/bus'

function linkedTransports(): [BusTransport, BusTransport] {
  const handlers: Array<Array<(m: unknown) => Promise<unknown> | unknown>> = [[], []]
  const make = (self: number, other: number): BusTransport => ({
    async send(message) {
      for (const handler of handlers[other]) {
        const result = await handler(message)
        if (result !== undefined) return result
      }
      return undefined
    },
    onMessage(cb) {
      handlers[self].push(cb)
      return () => handlers[self].splice(handlers[self].indexOf(cb), 1)
    },
  })
  return [make(0, 1), make(1, 0)]
}

describe('createBus', () => {
  it('carries a request to the handler and the reply back', async () => {
    const [a, b] = linkedTransports()
    const client = createBus(a)
    const server = createBus(b)
    server.handle('sum', (payload: { a: number; b: number }) => payload.a + payload.b)
    expect(await client.request<number>('sum', { a: 2, b: 3 })).toBe(5)
  })

  it('awaits an async handler', async () => {
    const [a, b] = linkedTransports()
    createBus(b).handle('slow', async () => 'done')
    expect(await createBus(a).request<string>('slow', undefined)).toBe('done')
  })

  it('rejects when no handler is registered', async () => {
    const [a] = linkedTransports()
    await expect(createBus(a).request('nobody', undefined)).rejects.toThrow(/no handler/i)
  })

  it('turns a handler throw into a rejected request', async () => {
    const [a, b] = linkedTransports()
    createBus(b).handle('bad', () => { throw new Error('handler failed') })
    await expect(createBus(a).request('bad', undefined)).rejects.toThrow('handler failed')
  })

  it('delivers an event to every listener', async () => {
    const [a, b] = linkedTransports()
    const server = createBus(b)
    const first = vi.fn()
    const second = vi.fn()
    server.on('settings:changed', first)
    server.on('settings:changed', second)
    await createBus(a).emit('settings:changed', { version: 1 })
    expect(first).toHaveBeenCalledWith({ version: 1 })
    expect(second).toHaveBeenCalledWith({ version: 1 })
  })

  it('ignores a message that is not a bus envelope', async () => {
    const [a, b] = linkedTransports()
    const bus = createBus(b)
    bus.handle('x', () => 1)
    await expect(a.send({ random: true })).resolves.toBeUndefined()
  })
})
```

- [ ] **Step 5: Run it and confirm it fails**

Run: `bun run test tests/core/bus.test.ts`
Expected: FAIL, cannot resolve `bus`.

- [ ] **Step 6: Write the bus**

```ts
// src/core/bus.ts
export interface BusTransport {
  send(message: unknown): Promise<unknown>
  onMessage(cb: (message: unknown) => Promise<unknown> | unknown): () => void
}

interface Envelope {
  xmt: 'request' | 'event'
  type: string
  payload: unknown
}

interface Reply {
  ok: boolean
  value?: unknown
  error?: string
}

const isEnvelope = (m: unknown): m is Envelope =>
  typeof m === 'object' && m !== null && (m as Envelope).xmt !== undefined

export interface Bus {
  request<T>(type: string, payload: unknown): Promise<T>
  handle(type: string, handler: (payload: any) => unknown): () => void
  emit(type: string, payload: unknown): Promise<void>
  on(type: string, listener: (payload: any) => void): () => void
}

export function createBus(transport: BusTransport): Bus {
  const handlers = new Map<string, (payload: unknown) => unknown>()
  const listeners = new Map<string, Set<(payload: unknown) => void>>()
  let attached = false

  const attach = (): void => {
    if (attached) return
    attached = true
    transport.onMessage(async (message) => {
      if (!isEnvelope(message)) return undefined

      if (message.xmt === 'event') {
        for (const listener of listeners.get(message.type) ?? []) listener(message.payload)
        return undefined
      }

      const handler = handlers.get(message.type)
      if (!handler) return undefined
      try {
        return { ok: true, value: await handler(message.payload) } satisfies Reply
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) } satisfies Reply
      }
    })
  }

  return {
    async request<T>(type: string, payload: unknown): Promise<T> {
      const reply = (await transport.send({ xmt: 'request', type, payload } satisfies Envelope)) as Reply | undefined
      if (!reply) throw new Error(`xmt: no handler for "${type}"`)
      if (!reply.ok) throw new Error(reply.error ?? 'xmt: request failed')
      return reply.value as T
    },
    handle(type, handler) {
      attach()
      handlers.set(type, handler as (payload: unknown) => unknown)
      return () => handlers.delete(type)
    },
    async emit(type, payload) {
      await transport.send({ xmt: 'event', type, payload } satisfies Envelope)
    },
    on(type, listener) {
      attach()
      const set = listeners.get(type) ?? new Set()
      set.add(listener as (payload: unknown) => void)
      listeners.set(type, set)
      return () => set.delete(listener as (payload: unknown) => void)
    },
  }
}
```

- [ ] **Step 7: Run both tests and confirm they pass**

Run: `bun run test tests/core`
Expected: PASS, 10 tests.

- [ ] **Step 8: Commit**

```bash
git add src/core/browser.ts src/core/browser-live.ts src/core/bus.ts tests/core
git commit -m "feat(core): add browser wrapper and typed message bus"
```

---

### Task 10: Page-world interceptor

**Files:**
- Create: `src/core/adapter/intercept.ts`, `entrypoints/xmt-main-world.ts`
- Test: `tests/adapter/intercept.test.ts`

**Interfaces:**
- Consumes: `operationFromUrl`, `isTrackedOperation` from the registry
- Produces:
  - `BRIDGE_TAG = 'xmt'`
  - `interface BridgeMessage { tag: 'xmt'; op: string; url: string; payload: unknown }`
  - `interface InterceptTarget { fetch: typeof fetch; XMLHttpRequest: typeof XMLHttpRequest; postMessage(message: unknown, targetOrigin: string): void }`
  - `installInterceptor(target: InterceptTarget): () => void`

- [ ] **Step 1: Write the failing test**

```ts
// tests/adapter/intercept.test.ts
import { describe, expect, it, vi } from 'vitest'
import { BRIDGE_TAG, installInterceptor, type InterceptTarget } from '../../src/core/adapter/intercept'

const TRACKED = 'https://x.com/i/api/graphql/hash1/HomeTimeline?variables=%7B%7D'
const UNTRACKED = 'https://x.com/i/api/graphql/hash1/CreateTweet'

function target(fetchImpl: typeof fetch): InterceptTarget & { messages: unknown[] } {
  return {
    messages: [],
    fetch: fetchImpl,
    XMLHttpRequest: class {} as unknown as typeof XMLHttpRequest,
    postMessage(message) {
      this.messages.push(message)
    },
  }
}

const jsonResponse = (body: unknown) => new Response(JSON.stringify(body), {
  status: 200, headers: { 'content-type': 'application/json' },
})

describe('installInterceptor', () => {
  it('forwards a tracked graphql response', async () => {
    const t = target(async () => jsonResponse({ data: { ok: true } }))
    installInterceptor(t)
    await t.fetch(TRACKED)
    await vi.waitFor(() => expect(t.messages).toHaveLength(1))
    expect(t.messages[0]).toEqual({
      tag: BRIDGE_TAG, op: 'HomeTimeline', url: TRACKED, payload: { data: { ok: true } },
    })
  })

  it('ignores an untracked operation', async () => {
    const t = target(async () => jsonResponse({ data: {} }))
    installInterceptor(t)
    await t.fetch(UNTRACKED)
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(t.messages).toHaveLength(0)
  })

  it('returns a response whose body the page can still read', async () => {
    const t = target(async () => jsonResponse({ data: { value: 42 } }))
    installInterceptor(t)
    const response = await t.fetch(TRACKED)
    expect(await response.json()).toEqual({ data: { value: 42 } })
  })

  it('passes a fetch rejection through untouched', async () => {
    const failure = new Error('network down')
    const t = target(async () => { throw failure })
    installInterceptor(t)
    await expect(t.fetch(TRACKED)).rejects.toBe(failure)
    expect(t.messages).toHaveLength(0)
  })

  it('stays silent when the body is not json', async () => {
    const t = target(async () => new Response('<html>', { status: 200 }))
    installInterceptor(t)
    await t.fetch(TRACKED)
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(t.messages).toHaveLength(0)
  })

  it('accepts a Request object as the fetch input', async () => {
    const t = target(async () => jsonResponse({ data: 1 }))
    installInterceptor(t)
    await t.fetch(new Request(TRACKED))
    await vi.waitFor(() => expect(t.messages).toHaveLength(1))
  })

  it('restores the original fetch on uninstall', async () => {
    const original = (async () => jsonResponse({})) as typeof fetch
    const t = target(original)
    const uninstall = installInterceptor(t)
    uninstall()
    expect(t.fetch).toBe(original)
  })

  it('never reports a message for a non-x.com host', async () => {
    const t = target(async () => jsonResponse({ data: 1 }))
    installInterceptor(t)
    await t.fetch('https://example.com/i/api/graphql/h/HomeTimeline')
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(t.messages).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `bun run test tests/adapter/intercept.test.ts`
Expected: FAIL, cannot resolve `intercept`.

- [ ] **Step 3: Write the interceptor**

```ts
// src/core/adapter/intercept.ts
import { isTrackedOperation, operationFromUrl } from './x-selectors'

export const BRIDGE_TAG = 'xmt'

export interface BridgeMessage {
  tag: typeof BRIDGE_TAG
  op: string
  url: string
  payload: unknown
}

export interface InterceptTarget {
  fetch: typeof fetch
  XMLHttpRequest: typeof XMLHttpRequest
  postMessage(message: unknown, targetOrigin: string): void
}

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.toString()
  return input.url
}

function trackedOperation(url: string): string | null {
  const op = operationFromUrl(url)
  return op && isTrackedOperation(op) ? op : null
}

export function installInterceptor(target: InterceptTarget): () => void {
  const originalFetch = target.fetch
  const originalOpen = target.XMLHttpRequest.prototype?.open
  const originalSend = target.XMLHttpRequest.prototype?.send

  const report = (op: string, url: string, payload: unknown): void => {
    try {
      target.postMessage({ tag: BRIDGE_TAG, op, url, payload } satisfies BridgeMessage, '*')
    } catch {
      // A page that rejects the message must not break the extension or the site.
    }
  }

  const patchedFetch = async function (this: unknown, input: RequestInfo | URL, init?: RequestInit) {
    const response = await originalFetch.call(this ?? target, input as RequestInfo, init)
    try {
      const url = urlOf(input)
      const op = trackedOperation(url)
      if (op) {
        response
          .clone()
          .json()
          .then((payload) => report(op, url, payload))
          .catch(() => {})
      }
    } catch {
      // Reading the response must never change what the page receives.
    }
    return response
  } as typeof fetch

  target.fetch = patchedFetch

  const urls = new WeakMap<XMLHttpRequest, string>()

  if (originalOpen && originalSend) {
    target.XMLHttpRequest.prototype.open = function (
      this: XMLHttpRequest,
      method: string,
      url: string | URL,
      ...rest: unknown[]
    ) {
      try {
        urls.set(this, typeof url === 'string' ? url : url.toString())
      } catch {}
      return (originalOpen as (...a: unknown[]) => void).call(this, method, url, ...rest)
    } as typeof originalOpen

    target.XMLHttpRequest.prototype.send = function (this: XMLHttpRequest, body?: unknown) {
      try {
        const url = urls.get(this)
        const op = url ? trackedOperation(url) : null
        if (op && url) {
          this.addEventListener('load', () => {
            try {
              report(op, url, JSON.parse(this.responseText))
            } catch {
              // Not json, or a body the page reads another way. Skip it.
            }
          })
        }
      } catch {}
      return (originalSend as (...a: unknown[]) => void).call(this, body)
    } as typeof originalSend
  }

  return () => {
    target.fetch = originalFetch
    if (originalOpen) target.XMLHttpRequest.prototype.open = originalOpen
    if (originalSend) target.XMLHttpRequest.prototype.send = originalSend
  }
}
```

- [ ] **Step 4: Run it and confirm it passes**

Run: `bun run test tests/adapter/intercept.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Add the page-world entrypoint**

```ts
// entrypoints/xmt-main-world.ts
import { installInterceptor } from '../src/core/adapter/intercept'

export default defineUnlistedScript(() => {
  installInterceptor({
    fetch: window.fetch.bind(window),
    XMLHttpRequest: window.XMLHttpRequest,
    postMessage: (message, targetOrigin) => window.postMessage(message, targetOrigin),
  })
})
```

The bound `fetch` is assigned back onto `window` by `installInterceptor`, because the object passed in is a live view of `window`. Confirm this in the next task's live check: if `window.fetch` is unchanged after injection, pass `window` itself as the target.

- [ ] **Step 6: Commit**

```bash
git add src/core/adapter/intercept.ts entrypoints/xmt-main-world.ts tests/adapter/intercept.test.ts
git commit -m "feat(adapter): capture x graphql responses from the page world"
```

---

### Task 11: Cell observer and selector health

**Files:**
- Create: `src/core/adapter/dom.ts`, `src/core/adapter/health.ts`, `tests/fixtures/timeline.html`
- Test: `tests/adapter/dom.test.ts`, `tests/adapter/health.test.ts`

**Interfaces:**
- Consumes: `X_SELECTORS`
- Produces:
  - `postIdFromCell(cell: Element): string | null`
  - `observeCells(root: Element, onCell: (id: string, node: HTMLElement) => void): () => void`
  - `class SelectorHealth` with `record(id: string, matches: number): void`, `report(): HealthEntry[]`, `interface HealthEntry { id: string; matches: number; staleForMs: number; healthy: boolean }`

- [ ] **Step 1: Write the fixture**

```html
<!-- tests/fixtures/timeline.html -->
<div data-testid="primaryColumn">
  <div data-testid="cellInnerDiv">
    <article data-testid="tweet">
      <a href="/jack/status/1001/analytics">analytics</a>
      <a href="/jack/status/1001">1h</a>
    </article>
  </div>
  <div data-testid="cellInnerDiv">
    <article data-testid="tweet">
      <a href="/brand/status/2002">2h</a>
    </article>
  </div>
  <div data-testid="cellInnerDiv">
    <div>who to follow</div>
  </div>
</div>
```

- [ ] **Step 2: Write the failing tests**

```ts
// tests/adapter/dom.test.ts
import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { observeCells, postIdFromCell } from '../../src/core/adapter/dom'
import { X_SELECTORS } from '../../src/core/adapter/x-selectors'

const html = readFileSync('tests/fixtures/timeline.html', 'utf8')

beforeEach(() => {
  document.body.innerHTML = html
})

describe('postIdFromCell', () => {
  it('reads the id from a status permalink', () => {
    const cells = document.querySelectorAll(X_SELECTORS.dom.cell)
    expect(postIdFromCell(cells[0])).toBe('1001')
    expect(postIdFromCell(cells[1])).toBe('2002')
  })

  it('returns null for a cell that holds no post', () => {
    const cells = document.querySelectorAll(X_SELECTORS.dom.cell)
    expect(postIdFromCell(cells[2])).toBeNull()
  })
})

describe('observeCells', () => {
  it('reports the cells that are already present', () => {
    const seen: string[] = []
    observeCells(document.body, (id) => seen.push(id))
    expect(seen).toEqual(['1001', '2002'])
  })

  it('reports a cell that X appends later', async () => {
    const seen: string[] = []
    observeCells(document.body, (id) => seen.push(id))
    const cell = document.createElement('div')
    cell.setAttribute('data-testid', 'cellInnerDiv')
    cell.innerHTML = '<a href="/x/status/3003">3h</a>'
    document.querySelector(X_SELECTORS.dom.primaryColumn)?.appendChild(cell)
    await vi.waitFor(() => expect(seen).toContain('3003'))
  })

  it('reports the same id again when X replaces the node', async () => {
    const calls: HTMLElement[] = []
    observeCells(document.body, (_id, node) => calls.push(node))
    const column = document.querySelector(X_SELECTORS.dom.primaryColumn) as HTMLElement
    const replacement = document.createElement('div')
    replacement.setAttribute('data-testid', 'cellInnerDiv')
    replacement.innerHTML = '<a href="/jack/status/1001">1h</a>'
    column.appendChild(replacement)
    await vi.waitFor(() => expect(calls).toHaveLength(3))
  })

  it('stops reporting after the returned function runs', async () => {
    const seen: string[] = []
    const stop = observeCells(document.body, (id) => seen.push(id))
    stop()
    const cell = document.createElement('div')
    cell.setAttribute('data-testid', 'cellInnerDiv')
    cell.innerHTML = '<a href="/x/status/4004">4h</a>'
    document.body.appendChild(cell)
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(seen).not.toContain('4004')
  })
})
```

```ts
// tests/adapter/health.test.ts
import { describe, expect, it } from 'vitest'
import { SelectorHealth } from '../../src/core/adapter/health'

describe('SelectorHealth', () => {
  it('calls a selector healthy as soon as it matches', () => {
    let now = 0
    const health = new SelectorHealth(() => now, 10_000)
    health.record('cell', 3)
    expect(health.report()).toEqual([{ id: 'cell', matches: 3, staleForMs: 0, healthy: true }])
  })

  it('keeps a selector healthy inside the grace window', () => {
    let now = 0
    const health = new SelectorHealth(() => now, 10_000)
    health.record('cell', 0)
    now = 9_000
    expect(health.report()[0].healthy).toBe(true)
  })

  it('marks a selector unhealthy after the grace window with no match', () => {
    let now = 0
    const health = new SelectorHealth(() => now, 10_000)
    health.record('cell', 0)
    now = 10_001
    expect(health.report()[0]).toEqual({ id: 'cell', matches: 0, staleForMs: 10_001, healthy: false })
  })

  it('recovers when the selector matches again', () => {
    let now = 0
    const health = new SelectorHealth(() => now, 10_000)
    health.record('cell', 0)
    now = 20_000
    health.record('cell', 2)
    expect(health.report()[0].healthy).toBe(true)
  })
})
```

- [ ] **Step 3: Run them and confirm they fail**

Run: `bun run test tests/adapter/dom.test.ts tests/adapter/health.test.ts`
Expected: FAIL, cannot resolve `dom` and `health`.

- [ ] **Step 4: Write the observer and the health check**

```ts
// src/core/adapter/dom.ts
import { X_SELECTORS } from './x-selectors'

const STATUS_ID = /\/status\/(\d+)/

export function postIdFromCell(cell: Element): string | null {
  for (const link of cell.querySelectorAll(X_SELECTORS.dom.statusLink)) {
    const href = link.getAttribute('href') ?? ''
    const match = STATUS_ID.exec(href)
    if (match) return match[1]
  }
  return null
}

export function observeCells(
  root: Element,
  onCell: (id: string, node: HTMLElement) => void,
): () => void {
  const report = (element: Element): void => {
    const id = postIdFromCell(element)
    if (id) onCell(id, element as HTMLElement)
  }

  const scan = (element: Element): void => {
    if (element.matches(X_SELECTORS.dom.cell)) report(element)
    for (const cell of element.querySelectorAll(X_SELECTORS.dom.cell)) report(cell)
  }

  scan(root)

  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const added of record.addedNodes) {
        if (added.nodeType === Node.ELEMENT_NODE) scan(added as Element)
      }
    }
  })

  observer.observe(root, { childList: true, subtree: true })
  return () => observer.disconnect()
}
```

```ts
// src/core/adapter/health.ts
export interface HealthEntry {
  id: string
  matches: number
  staleForMs: number
  healthy: boolean
}

interface Sample {
  matches: number
  lastMatchAt: number
}

export class SelectorHealth {
  private readonly samples = new Map<string, Sample>()

  constructor(
    private readonly now: () => number,
    private readonly graceMs = 10_000,
  ) {}

  record(id: string, matches: number): void {
    const at = this.now()
    const previous = this.samples.get(id)
    this.samples.set(id, {
      matches,
      lastMatchAt: matches > 0 ? at : (previous?.lastMatchAt ?? at),
    })
  }

  report(): HealthEntry[] {
    const at = this.now()
    return [...this.samples.entries()].map(([id, sample]) => {
      const staleForMs = sample.matches > 0 ? 0 : at - sample.lastMatchAt
      return { id, matches: sample.matches, staleForMs, healthy: staleForMs <= this.graceMs }
    })
  }
}
```

- [ ] **Step 5: Run them and confirm they pass**

Run: `bun run test tests/adapter`
Expected: PASS, all adapter tests green.

- [ ] **Step 6: Commit**

```bash
git add src/core/adapter/dom.ts src/core/adapter/health.ts tests/adapter/dom.test.ts tests/adapter/health.test.ts tests/fixtures/timeline.html
git commit -m "feat(adapter): observe timeline cells and track selector health"
```

---

### Task 12: Theme detection and design tokens

**Files:**
- Create: `src/core/ui/theme.ts`, `src/core/ui/tokens.css`
- Test: `tests/ui/theme.test.ts`

**Interfaces:**
- Consumes: `X_SELECTORS.cookies.theme`, `ThemeChoice` from the settings store
- Produces:
  - `type XTheme = 'light' | 'dim' | 'lights-out'`
  - `themeFromCookie(cookie: string): XTheme | null`
  - `resolveTheme(choice: ThemeChoice, detected: XTheme | null, prefersDark: boolean): XTheme`
  - `applyTheme(root: HTMLElement, theme: XTheme): void`

- [ ] **Step 1: Write the failing test**

```ts
// tests/ui/theme.test.ts
import { describe, expect, it } from 'vitest'
import { applyTheme, resolveTheme, themeFromCookie } from '../../src/core/ui/theme'

describe('themeFromCookie', () => {
  it('reads light', () => {
    expect(themeFromCookie('guest_id=1; night_mode=0; other=2')).toBe('light')
  })

  it('reads dim', () => {
    expect(themeFromCookie('night_mode=1')).toBe('dim')
  })

  it('reads lights out', () => {
    expect(themeFromCookie('night_mode=2')).toBe('lights-out')
  })

  it('returns null when the cookie is absent', () => {
    expect(themeFromCookie('guest_id=1')).toBeNull()
  })

  it('returns null for a value it does not know', () => {
    expect(themeFromCookie('night_mode=9')).toBeNull()
  })

  it('is not fooled by a similarly named cookie', () => {
    expect(themeFromCookie('not_night_mode=1')).toBeNull()
  })
})

describe('resolveTheme', () => {
  it('follows the user choice above everything', () => {
    expect(resolveTheme('light', 'lights-out', true)).toBe('light')
  })

  it('follows X when the choice is auto', () => {
    expect(resolveTheme('auto', 'dim', false)).toBe('dim')
  })

  it('falls back to the system when detection failed', () => {
    expect(resolveTheme('auto', null, true)).toBe('lights-out')
    expect(resolveTheme('auto', null, false)).toBe('light')
  })
})

describe('applyTheme', () => {
  it('sets one attribute on the root', () => {
    const root = document.createElement('html')
    applyTheme(root, 'dim')
    expect(root.getAttribute('data-xmt-theme')).toBe('dim')
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `bun run test tests/ui/theme.test.ts`
Expected: FAIL, cannot resolve `theme`.

- [ ] **Step 3: Write the theme module**

```ts
// src/core/ui/theme.ts
import { X_SELECTORS } from '../adapter/x-selectors'
import type { ThemeChoice } from '../settings/store'

export type XTheme = 'light' | 'dim' | 'lights-out'

const BY_COOKIE_VALUE: Record<string, XTheme> = { '0': 'light', '1': 'dim', '2': 'lights-out' }

export function themeFromCookie(cookie: string): XTheme | null {
  const name = X_SELECTORS.cookies.theme
  for (const part of cookie.split(';')) {
    const [key, value] = part.trim().split('=')
    if (key === name) return BY_COOKIE_VALUE[value] ?? null
  }
  return null
}

export function resolveTheme(choice: ThemeChoice, detected: XTheme | null, prefersDark: boolean): XTheme {
  if (choice !== 'auto') return choice
  if (detected) return detected
  return prefersDark ? 'lights-out' : 'light'
}

export function applyTheme(root: HTMLElement, theme: XTheme): void {
  root.setAttribute('data-xmt-theme', theme)
}
```

- [ ] **Step 4: Write the tokens**

```css
/* src/core/ui/tokens.css */
:root,
[data-xmt-theme='light'] {
  --xmt-bg: #ffffff;
  --xmt-bg-raised: #f7f9f9;
  --xmt-bg-hover: #f7f9f9;
  --xmt-text: #0f1419;
  --xmt-text-muted: #536471;
  --xmt-border: #eff3f4;
  --xmt-accent: #1d9bf0;
  --xmt-accent-text: #ffffff;
  --xmt-danger: #f4212e;
}

[data-xmt-theme='dim'] {
  --xmt-bg: #15202b;
  --xmt-bg-raised: #1e2732;
  --xmt-bg-hover: #1c2732;
  --xmt-text: #f7f9f9;
  --xmt-text-muted: #8b98a5;
  --xmt-border: #38444d;
  --xmt-accent: #1d9bf0;
  --xmt-accent-text: #ffffff;
  --xmt-danger: #f4212e;
}

[data-xmt-theme='lights-out'] {
  --xmt-bg: #000000;
  --xmt-bg-raised: #16181c;
  --xmt-bg-hover: #080808;
  --xmt-text: #e7e9ea;
  --xmt-text-muted: #71767b;
  --xmt-border: #2f3336;
  --xmt-accent: #1d9bf0;
  --xmt-accent-text: #ffffff;
  --xmt-danger: #f4212e;
}

:root {
  --xmt-radius-pill: 9999px;
  --xmt-radius-box: 16px;
  --xmt-text-size: 15px;
  --xmt-text-size-small: 13px;
  --xmt-font: 'TwitterChirp', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  --xmt-motion: 120ms ease;
}

body {
  background: var(--xmt-bg);
  color: var(--xmt-text);
  font-family: var(--xmt-font);
  font-size: var(--xmt-text-size);
  margin: 0;
}
```

`TwitterChirp` is named first because it resolves inside x.com, where the font is already loaded. In the side panel it fails and the system stack takes over. No font file ships with the extension.

- [ ] **Step 5: Run it and confirm it passes**

Run: `bun run test tests/ui/theme.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 6: Commit**

```bash
git add src/core/ui/theme.ts src/core/ui/tokens.css tests/ui/theme.test.ts
git commit -m "feat(ui): mirror the three x themes and detect the active one"
```

---

### Task 13: Config export and import

**Files:**
- Create: `src/core/settings/config-file.ts`
- Test: `tests/settings/config-file.test.ts`

**Interfaces:**
- Consumes: `StoredSettings`, `migrate` from the settings store
- Produces:
  - `interface ConfigFile { app: 'xmultitool'; version: number; exportedAt: string; settings: StoredSettings }`
  - `exportConfig(settings: StoredSettings, exportedAt: string): string`
  - `importConfig(text: string): StoredSettings` — throws `Error` with a readable message on a bad file

- [ ] **Step 1: Write the failing test**

```ts
// tests/settings/config-file.test.ts
import { describe, expect, it } from 'vitest'
import { exportConfig, importConfig } from '../../src/core/settings/config-file'
import { SETTINGS_VERSION, type StoredSettings } from '../../src/core/settings/store'

const settings: StoredSettings = {
  version: SETTINGS_VERSION,
  enabled: { 'core:diagnostics': true },
  tools: { 'core:diagnostics': { explain: true } },
  ui: { theme: 'dim' },
}

describe('exportConfig', () => {
  it('writes readable json with a stamp', () => {
    const text = exportConfig(settings, '2026-08-24T00:00:00.000Z')
    expect(JSON.parse(text)).toEqual({
      app: 'xmultitool',
      version: SETTINGS_VERSION,
      exportedAt: '2026-08-24T00:00:00.000Z',
      settings,
    })
    expect(text).toContain('\n')
  })
})

describe('importConfig', () => {
  it('reads back what export wrote', () => {
    expect(importConfig(exportConfig(settings, '2026-08-24T00:00:00.000Z'))).toEqual(settings)
  })

  it('rejects text that is not json', () => {
    expect(() => importConfig('not json')).toThrow(/not a valid xmultitool config/i)
  })

  it('rejects a file from another app', () => {
    expect(() => importConfig(JSON.stringify({ app: 'other', settings }))).toThrow(/not a valid xmultitool config/i)
  })

  it('repairs a config with unknown fields instead of failing', () => {
    const text = JSON.stringify({ app: 'xmultitool', version: SETTINGS_VERSION, settings: { ...settings, junk: 1 } })
    expect(importConfig(text)).toEqual(settings)
  })

  it('rejects a config written by a newer version', () => {
    const text = JSON.stringify({ app: 'xmultitool', version: SETTINGS_VERSION + 5, settings })
    expect(() => importConfig(text)).toThrow(/newer version/i)
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `bun run test tests/settings/config-file.test.ts`
Expected: FAIL, cannot resolve `config-file`.

- [ ] **Step 3: Write the module**

```ts
// src/core/settings/config-file.ts
import { migrate, SETTINGS_VERSION, type StoredSettings } from './store'

export interface ConfigFile {
  app: 'xmultitool'
  version: number
  exportedAt: string
  settings: StoredSettings
}

export function exportConfig(settings: StoredSettings, exportedAt: string): string {
  const file: ConfigFile = { app: 'xmultitool', version: SETTINGS_VERSION, exportedAt, settings }
  return `${JSON.stringify(file, null, 2)}\n`
}

export function importConfig(text: string): StoredSettings {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('This file is not a valid XMultiTool config.')
  }

  const file = parsed as Partial<ConfigFile>
  if (!file || file.app !== 'xmultitool' || typeof file.settings !== 'object') {
    throw new Error('This file is not a valid XMultiTool config.')
  }

  if (typeof file.version === 'number' && file.version > SETTINGS_VERSION) {
    throw new Error('This config comes from a newer version of XMultiTool. Update the extension first.')
  }

  return migrate(file.settings)
}
```

- [ ] **Step 4: Run it and confirm it passes**

Run: `bun run test tests/settings/config-file.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/core/settings/config-file.ts tests/settings/config-file.test.ts
git commit -m "feat(settings): export and import the config as a json file"
```

---

### Task 14: Stats counter and the core:diagnostics tool

**Files:**
- Create: `src/core/stats.ts`, `src/core/tools/diagnostics.ts`, `src/core/tools/index.ts`
- Test: `tests/core/stats.test.ts`, `tests/tools/diagnostics.test.ts`

**Interfaces:**
- Consumes: `Tool`, `Verdict`, `Post`, `Schema`
- Produces:
  - `interface Stats { seen: number; hidden: number; dimmed: number; badged: number; unknownEntryTypes: string[] }`
  - `class StatsCounter` with `count(verdict: Verdict): void`, `noteUnknownEntryTypes(types: string[]): void`, `snapshot(): Stats`, `reset(): void`
  - `interface DiagnosticsSettings { explain: boolean }`
  - `diagnosticsTool: Tool<DiagnosticsSettings>` with id `core:diagnostics`
  - `CORE_TOOLS: Array<Tool<any>>` from `src/core/tools/index.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/core/stats.test.ts
import { describe, expect, it } from 'vitest'
import { StatsCounter } from '../../src/core/stats'

describe('StatsCounter', () => {
  it('starts at zero', () => {
    expect(new StatsCounter().snapshot()).toEqual({
      seen: 0, hidden: 0, dimmed: 0, badged: 0, unknownEntryTypes: [],
    })
  })

  it('counts each action against the total seen', () => {
    const stats = new StatsCounter()
    stats.count({ action: 'hide', reason: 'a' })
    stats.count({ action: 'dim', reason: 'b' })
    stats.count({ action: 'badge', reason: 'c', label: 'c' })
    stats.count({ action: 'pass' })
    expect(stats.snapshot()).toEqual({
      seen: 4, hidden: 1, dimmed: 1, badged: 1, unknownEntryTypes: [],
    })
  })

  it('keeps each unknown entry type once', () => {
    const stats = new StatsCounter()
    stats.noteUnknownEntryTypes(['A', 'B'])
    stats.noteUnknownEntryTypes(['B', 'C'])
    expect(stats.snapshot().unknownEntryTypes).toEqual(['A', 'B', 'C'])
  })

  it('clears on reset', () => {
    const stats = new StatsCounter()
    stats.count({ action: 'hide', reason: 'a' })
    stats.reset()
    expect(stats.snapshot().seen).toBe(0)
  })
})
```

```ts
// tests/tools/diagnostics.test.ts
import { describe, expect, it } from 'vitest'
import type { Post, ToolCtx } from '../../src/core/types'
import { diagnosticsTool, type DiagnosticsSettings } from '../../src/core/tools/diagnostics'
import { defaultsOf } from '../../src/core/settings/schema'

const post = { id: '1001', source: 'graphql', isPromoted: false } as Post
const node = () => document.createElement('div')

function ctx(settings: DiagnosticsSettings): ToolCtx<DiagnosticsSettings> {
  return {
    settings,
    storage: { get: async () => undefined, set: async () => {} },
    log: { info() {}, warn() {}, error() {} },
  }
}

describe('diagnosticsTool', () => {
  it('is off by default', () => {
    expect(defaultsOf(diagnosticsTool.settings)).toEqual({ explain: false })
  })

  it('passes when explain is off', () => {
    expect(diagnosticsTool.onPost?.(post, node(), ctx({ explain: false }))).toEqual({ action: 'pass' })
  })

  it('badges the record source when explain is on', () => {
    expect(diagnosticsTool.onPost?.(post, node(), ctx({ explain: true }))).toEqual({
      action: 'badge', reason: 'post 1001 from graphql', label: 'graphql',
    })
  })

  it('belongs to the core module', () => {
    expect(diagnosticsTool.id).toBe('core:diagnostics')
    expect(diagnosticsTool.module).toBe('core')
  })
})
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `bun run test tests/core/stats.test.ts tests/tools/diagnostics.test.ts`
Expected: FAIL, cannot resolve `stats` and `diagnostics`.

- [ ] **Step 3: Write the counter and the tool**

```ts
// src/core/stats.ts
import type { Verdict } from './types'

export interface Stats {
  seen: number
  hidden: number
  dimmed: number
  badged: number
  unknownEntryTypes: string[]
}

export class StatsCounter {
  private seen = 0
  private hidden = 0
  private dimmed = 0
  private badged = 0
  private readonly unknown = new Set<string>()

  count(verdict: Verdict): void {
    this.seen += 1
    if (verdict.action === 'hide') this.hidden += 1
    if (verdict.action === 'dim') this.dimmed += 1
    if (verdict.action === 'badge') this.badged += 1
  }

  noteUnknownEntryTypes(types: string[]): void {
    for (const type of types) this.unknown.add(type)
  }

  snapshot(): Stats {
    return {
      seen: this.seen,
      hidden: this.hidden,
      dimmed: this.dimmed,
      badged: this.badged,
      unknownEntryTypes: [...this.unknown],
    }
  }

  reset(): void {
    this.seen = 0
    this.hidden = 0
    this.dimmed = 0
    this.badged = 0
    this.unknown.clear()
  }
}
```

```ts
// src/core/tools/diagnostics.ts
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
    return { action: 'badge', reason: `post ${post.id} from ${post.source}`, label: post.source }
  },
}
```

```ts
// src/core/tools/index.ts
import type { Tool } from '../types'
import { diagnosticsTool } from './diagnostics'

// Modules 1 to 3 append their tools here. The core keeps no module-specific code.
export const CORE_TOOLS: Array<Tool<any>> = [diagnosticsTool]
```

- [ ] **Step 4: Run them and confirm they pass**

Run: `bun run test tests/core/stats.test.ts tests/tools/diagnostics.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/core/stats.ts src/core/tools/diagnostics.ts src/core/tools/index.ts tests/core/stats.test.ts tests/tools/diagnostics.test.ts
git commit -m "feat(core): add stats counter and the diagnostics tool"
```

---

### Task 15: Content runtime and background worker

**Files:**
- Create: `src/core/runtime.ts`, `entrypoints/x.content.ts`, `entrypoints/background.ts`
- Test: `tests/core/runtime.test.ts`

**Interfaces:**
- Consumes: everything built so far
- Produces:
  - `interface RuntimeDeps { registry: ToolRegistry; stats: StatsCounter; health: SelectorHealth; onRecord(post: Post): void; onVerdict(node: HTMLElement, verdict: Verdict): void }`
  - `createContentRuntime(deps: RuntimeDeps): { handleBridgeMessage(message: unknown): void; handlePair(pair: PostPair): void }`
  - Bus message types: `'stats:get'` returns `Stats`, `'health:get'` returns `HealthEntry[]`, `'settings:get'` returns `StoredSettings`, `'settings:setEnabled'`, `'settings:patchTool'`, `'settings:setTheme'`, `'settings:replace'`, event `'settings:changed'`

- [ ] **Step 1: Write the failing test**

```ts
// tests/core/runtime.test.ts
import { describe, expect, it, vi } from 'vitest'
import fixture from '../fixtures/home-timeline.json'
import { BRIDGE_TAG } from '../../src/core/adapter/intercept'
import { PostStore } from '../../src/core/adapter/post-store'
import { SelectorHealth } from '../../src/core/adapter/health'
import { StatsCounter } from '../../src/core/stats'
import { ToolRegistry } from '../../src/core/tools/registry'
import { createContentRuntime } from '../../src/core/runtime'
import type { Post, Verdict } from '../../src/core/types'

function setup(onPost?: (post: Post) => Verdict | void) {
  const applied: Array<{ node: HTMLElement; verdict: Verdict }> = []
  const stats = new StatsCounter()
  const health = new SelectorHealth(() => 0)
  const registry = new ToolRegistry({
    tools: onPost
      ? [{ id: 't', name: 't', description: '', module: 'core', settings: {} as any, onPost: (p) => onPost(p) }]
      : [],
    isEnabled: () => true,
    contextFor: () => ({ settings: {}, storage: { get: async () => undefined, set: async () => {} }, log: { info() {}, warn() {}, error() {} } }),
    onDisable: () => {},
  })

  let store!: PostStore
  const runtime = createContentRuntime({
    registry,
    stats,
    health,
    onRecord: (post) => store.addRecord(post),
    onVerdict: (node, verdict) => applied.push({ node, verdict }),
  })
  store = new PostStore({ onPair: (pair) => runtime.handlePair(pair) })
  return { runtime, store, stats, applied }
}

describe('createContentRuntime', () => {
  it('ignores a message that is not from the bridge', () => {
    const { runtime, stats } = setup()
    runtime.handleBridgeMessage({ tag: 'other', op: 'HomeTimeline', payload: fixture })
    expect(stats.snapshot().seen).toBe(0)
  })

  it('feeds normalized records into the store', () => {
    const { runtime, store } = setup()
    runtime.handleBridgeMessage({ tag: BRIDGE_TAG, op: 'HomeTimeline', url: '', payload: fixture })
    expect(store.size().records).toBe(2)
  })

  it('records unknown entry types in the stats', () => {
    const { runtime, stats } = setup()
    runtime.handleBridgeMessage({ tag: BRIDGE_TAG, op: 'HomeTimeline', url: '', payload: fixture })
    expect(stats.snapshot().unknownEntryTypes).toEqual(['TimelineTimelineModule'])
  })

  it('applies the merged verdict when a pair completes', () => {
    const { runtime, store, applied } = setup(() => ({ action: 'hide', reason: 'promoted' }))
    runtime.handleBridgeMessage({ tag: BRIDGE_TAG, op: 'HomeTimeline', url: '', payload: fixture })
    store.addNode('1001', document.createElement('div'))
    expect(applied).toHaveLength(1)
    expect(applied[0].verdict).toEqual({ action: 'hide', reason: 'promoted' })
  })

  it('counts every judged post', () => {
    const { runtime, store, stats } = setup(() => ({ action: 'pass' }))
    runtime.handleBridgeMessage({ tag: BRIDGE_TAG, op: 'HomeTimeline', url: '', payload: fixture })
    store.addNode('1001', document.createElement('div'))
    store.addNode('2002', document.createElement('div'))
    expect(stats.snapshot().seen).toBe(2)
  })

  it('survives a payload it cannot read', () => {
    const { runtime } = setup()
    expect(() => runtime.handleBridgeMessage({ tag: BRIDGE_TAG, op: 'HomeTimeline', url: '', payload: 'junk' })).not.toThrow()
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `bun run test tests/core/runtime.test.ts`
Expected: FAIL, cannot resolve `runtime`.

- [ ] **Step 3: Write the runtime**

```ts
// src/core/runtime.ts
import { BRIDGE_TAG, type BridgeMessage } from './adapter/intercept'
import type { SelectorHealth } from './adapter/health'
import { normalizeTimeline } from './adapter/normalize'
import type { PostPair } from './adapter/post-store'
import type { StatsCounter } from './stats'
import type { ToolRegistry } from './tools/registry'
import type { Post, Verdict } from './types'

export interface RuntimeDeps {
  registry: ToolRegistry
  stats: StatsCounter
  health: SelectorHealth
  onRecord(post: Post): void
  onVerdict(node: HTMLElement, verdict: Verdict): void
}

const isBridgeMessage = (m: unknown): m is BridgeMessage =>
  typeof m === 'object' && m !== null && (m as BridgeMessage).tag === BRIDGE_TAG

export function createContentRuntime(deps: RuntimeDeps) {
  return {
    handleBridgeMessage(message: unknown): void {
      if (!isBridgeMessage(message)) return
      const { posts, unknownEntryTypes } = normalizeTimeline(message.payload)
      deps.stats.noteUnknownEntryTypes(unknownEntryTypes)
      deps.health.record(`graphql:${message.op}`, posts.length)
      for (const post of posts) deps.onRecord(post)
    },

    handlePair(pair: PostPair): void {
      const verdict = deps.registry.runPost(pair.post, pair.node)
      deps.stats.count(verdict)
      deps.onVerdict(pair.node, verdict)
    },
  }
}
```

- [ ] **Step 4: Run it and confirm it passes**

Run: `bun run test tests/core/runtime.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Write the content entrypoint**

```ts
// entrypoints/x.content.ts
import { injectScript } from 'wxt/browser'
import { observeCells, postIdFromCell } from '../src/core/adapter/dom'
import { SelectorHealth } from '../src/core/adapter/health'
import { PostStore } from '../src/core/adapter/post-store'
import { X_SELECTORS } from '../src/core/adapter/x-selectors'
import { bus, storage } from '../src/core/browser-live'
import { createContentRuntime } from '../src/core/runtime'
import { SETTINGS_KEY, SettingsStore } from '../src/core/settings/store'
import { coerce } from '../src/core/settings/schema'
import { StatsCounter } from '../src/core/stats'
import { applyVerdict } from '../src/core/tools/apply'
import { CORE_TOOLS } from '../src/core/tools/index'
import { ToolRegistry } from '../src/core/tools/registry'
import { parseRoute } from '../src/core/adapter/route'
import '../src/core/ui/content.css'

export default defineContentScript({
  matches: ['https://x.com/*'],
  runAt: 'document_start',
  cssInjectionMode: 'manifest',

  async main() {
    await injectScript('/xmt-main-world.js', { keepInDom: true })

    const settings = new SettingsStore(storage)
    await settings.load()

    const stats = new StatsCounter()
    const health = new SelectorHealth(() => Date.now())
    const registry = new ToolRegistry({
      tools: CORE_TOOLS,
      isEnabled: (id) => settings.isEnabled(id),
      contextFor: (id) => {
        const tool = CORE_TOOLS.find((t) => t.id === id)
        return {
          settings: tool ? coerce(tool.settings, settings.rawToolSettings(id)) : {},
          storage: {
            get: (key) => storage.get(`xmt:tool:${id}:${key}`),
            set: (key, value) => storage.set(`xmt:tool:${id}:${key}`, value),
          },
          log: console,
        }
      },
      onDisable: (id, error) => {
        void bus.emit('tool:disabled', { id, error: String(error) })
      },
    })

    let store!: PostStore
    const runtime = createContentRuntime({
      registry,
      stats,
      health,
      onRecord: (post) => store.addRecord(post),
      onVerdict: applyVerdict,
    })
    store = new PostStore({ onPair: (pair) => runtime.handlePair(pair) })

    window.addEventListener('message', (event) => {
      if (event.source !== window) return
      runtime.handleBridgeMessage(event.data)
    })

    const startObserver = (): void => {
      const root = document.querySelector(X_SELECTORS.dom.primaryColumn) ?? document.body
      observeCells(root, (id, node) => store.addNode(id, node))
      health.record('dom:cell', document.querySelectorAll(X_SELECTORS.dom.cell).length)
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', startObserver, { once: true })
    } else {
      startObserver()
    }

    let lastPath = location.pathname
    registry.runRoute(parseRoute(lastPath))
    setInterval(() => {
      if (location.pathname === lastPath) return
      lastPath = location.pathname
      registry.runRoute(parseRoute(lastPath))
    }, 500)

    // The side panel cannot message a content script directly, so the background
    // relays these two requests into the active tab.
    bus.handle('stats:get', () => stats.snapshot())
    bus.handle('health:get', () => health.report())

    // A settings write in the worker reaches the tab as a storage change, which is
    // the one signal both browsers deliver to a content script.
    storage.onChanged((key) => {
      if (key === SETTINGS_KEY) void settings.load()
    })

    await registry.init()
  },
})
```

The route poll uses an interval because X navigates with the History API and fires no
event the content script can rely on. 500 ms is below the time a user needs to read a
new screen, and the check costs one string compare.

- [ ] **Step 6: Write the background entrypoint**

```ts
// entrypoints/background.ts
import { browser } from 'wxt/browser'
import { bus, requestActiveTab, storage } from '../src/core/browser-live'
import { exportConfig, importConfig } from '../src/core/settings/config-file'
import { SettingsStore, type ThemeChoice } from '../src/core/settings/store'

export default defineBackground(() => {
  const settings = new SettingsStore(storage)
  const ready = settings.load()

  const sidePanel = (browser as unknown as {
    sidePanel?: { setPanelBehavior(o: { openPanelOnActionClick: boolean }): Promise<void> }
  }).sidePanel
  void sidePanel?.setPanelBehavior({ openPanelOnActionClick: true })

  bus.handle('settings:get', async () => {
    await ready
    return settings.snapshot()
  })

  // Relays into the x.com tab, where the content script holds these counters.
  bus.handle('stats:get', () => requestActiveTab('stats:get', undefined))
  bus.handle('health:get', () => requestActiveTab('health:get', undefined))

  bus.handle('settings:setEnabled', async (payload: { id: string; on: boolean }) => {
    await ready
    await settings.setEnabled(payload.id, payload.on)
    await bus.emit('settings:changed', settings.snapshot())
    return settings.snapshot()
  })

  bus.handle('settings:patchTool', async (payload: { id: string; patch: Record<string, unknown> }) => {
    await ready
    await settings.patchTool(payload.id, payload.patch)
    await bus.emit('settings:changed', settings.snapshot())
    return settings.snapshot()
  })

  bus.handle('settings:setTheme', async (payload: { theme: ThemeChoice }) => {
    await ready
    await settings.setTheme(payload.theme)
    await bus.emit('settings:changed', settings.snapshot())
    return settings.snapshot()
  })

  bus.handle('config:export', async (payload: { exportedAt: string }) => {
    await ready
    return exportConfig(settings.snapshot(), payload.exportedAt)
  })

  bus.handle('config:import', async (payload: { text: string }) => {
    await ready
    await settings.replace(importConfig(payload.text))
    await bus.emit('settings:changed', settings.snapshot())
    return settings.snapshot()
  })
})
```

- [ ] **Step 7: Check the whole suite and both builds**

```bash
bun run test && bunx tsc --noEmit && bun run build && bun run build:firefox
```
Expected: all tests pass, no type errors, both builds succeed.

- [ ] **Step 8: Commit**

```bash
git add src/core/runtime.ts entrypoints tests/core/runtime.test.ts
git commit -m "feat(core): wire the content runtime and the background worker"
```

---

### Task 16: Side panel and options UI

**Files:**
- Create: `src/ui/controls/control-for.ts`, `src/ui/controls/Field.svelte`, `src/ui/state.svelte.ts`, `src/ui/App.svelte`, `src/ui/routes/Status.svelte`, `src/ui/routes/Tools.svelte`, `src/ui/routes/Settings.svelte`, `src/ui/main.ts`, `entrypoints/sidepanel/index.html`, `entrypoints/options/index.html`
- Test: `tests/ui/control-for.test.ts`

**Interfaces:**
- Consumes: `Field`, `Schema`, `CORE_TOOLS`, `bus`, `resolveTheme`, `applyTheme`
- Produces:
  - `controlFor(field: Field): ControlName` where `type ControlName = 'switch' | 'number' | 'text' | 'select' | 'list'`
  - `src/ui/state.svelte.ts` exporting `ui` (reactive state) and `loadAll()`, `setEnabled(id, on)`, `patchTool(id, patch)`, `setTheme(theme)`

- [ ] **Step 1: Write the failing control test**

```ts
// tests/ui/control-for.test.ts
import { describe, expect, it } from 'vitest'
import { controlFor } from '../../src/ui/controls/control-for'

describe('controlFor', () => {
  it('maps a boolean to a switch', () => {
    expect(controlFor({ type: 'boolean', default: false, label: 'x' })).toBe('switch')
  })

  it('maps a number to a number control', () => {
    expect(controlFor({ type: 'number', default: 1, label: 'x' })).toBe('number')
  })

  it('maps a string to a text control', () => {
    expect(controlFor({ type: 'string', default: '', label: 'x' })).toBe('text')
  })

  it('maps an enum to a select', () => {
    expect(controlFor({ type: 'enum', default: 'a', options: [{ value: 'a', label: 'A' }], label: 'x' })).toBe('select')
  })

  it('maps a string list to a list control', () => {
    expect(controlFor({ type: 'stringList', default: [], label: 'x' })).toBe('list')
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `bun run test tests/ui/control-for.test.ts`
Expected: FAIL, cannot resolve `control-for`.

- [ ] **Step 3: Write the mapping**

```ts
// src/ui/controls/control-for.ts
import type { Field } from '../../core/settings/schema'

export type ControlName = 'switch' | 'number' | 'text' | 'select' | 'list'

const BY_TYPE: Record<Field['type'], ControlName> = {
  boolean: 'switch',
  number: 'number',
  string: 'text',
  enum: 'select',
  stringList: 'list',
}

export function controlFor(field: Field): ControlName {
  return BY_TYPE[field.type]
}
```

- [ ] **Step 4: Run it and confirm it passes**

Run: `bun run test tests/ui/control-for.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Write the shared UI state**

```ts
// src/ui/state.svelte.ts
import type { HealthEntry } from '../core/adapter/health'
import { bus } from '../core/browser-live'
import type { Stats } from '../core/stats'
import type { StoredSettings, ThemeChoice } from '../core/settings/store'

export const ui = $state({
  settings: null as StoredSettings | null,
  stats: null as Stats | null,
  health: [] as HealthEntry[],
  error: null as string | null,
})

async function safe<T>(run: () => Promise<T>): Promise<T | null> {
  try {
    return await run()
  } catch (error) {
    ui.error = error instanceof Error ? error.message : String(error)
    return null
  }
}

export async function loadAll(): Promise<void> {
  ui.settings = await safe(() => bus.request<StoredSettings>('settings:get', undefined))
  ui.stats = await safe(() => bus.request<Stats>('stats:get', undefined))
  ui.health = (await safe(() => bus.request<HealthEntry[]>('health:get', undefined))) ?? []
}

export async function setEnabled(id: string, on: boolean): Promise<void> {
  ui.settings = await safe(() => bus.request<StoredSettings>('settings:setEnabled', { id, on }))
}

export async function patchTool(id: string, patch: Record<string, unknown>): Promise<void> {
  ui.settings = await safe(() => bus.request<StoredSettings>('settings:patchTool', { id, patch }))
}

export async function setTheme(theme: ThemeChoice): Promise<void> {
  ui.settings = await safe(() => bus.request<StoredSettings>('settings:setTheme', { theme }))
}
```

`stats:get` and `health:get` are answered by the content script, so they fail when no x.com tab is open. `safe` turns that into a message on the Status screen instead of a broken panel.

- [ ] **Step 6: Write the components**

```svelte
<!-- src/ui/controls/Field.svelte -->
<script lang="ts">
  import type { Field } from '../../core/settings/schema'
  import { controlFor } from './control-for'

  let { field, value, onchange }: {
    field: Field
    value: unknown
    onchange: (next: unknown) => void
  } = $props()

  const control = controlFor(field)
</script>

<label class="row">
  <span class="labels">
    <span class="label">{field.label}</span>
    {#if field.help}<span class="help">{field.help}</span>{/if}
  </span>

  {#if control === 'switch'}
    <input type="checkbox" checked={value === true} onchange={(e) => onchange(e.currentTarget.checked)} />
  {:else if control === 'number'}
    <input type="number" value={value as number} onchange={(e) => onchange(Number(e.currentTarget.value))} />
  {:else if control === 'text'}
    <input type="text" value={value as string} onchange={(e) => onchange(e.currentTarget.value)} />
  {:else if control === 'select' && field.type === 'enum'}
    <select value={value as string} onchange={(e) => onchange(e.currentTarget.value)}>
      {#each field.options as option (option.value)}
        <option value={option.value}>{option.label}</option>
      {/each}
    </select>
  {:else if control === 'list'}
    <textarea
      rows="4"
      value={(value as string[] | undefined)?.join('\n') ?? ''}
      onchange={(e) => onchange(e.currentTarget.value.split('\n').map((s) => s.trim()).filter(Boolean))}
    ></textarea>
  {/if}
</label>

<style>
  .row {
    display: flex;
    gap: 12px;
    align-items: flex-start;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid var(--xmt-border);
  }
  .labels { display: flex; flex-direction: column; gap: 2px; }
  .label { font-weight: 700; }
  .help { color: var(--xmt-text-muted); font-size: var(--xmt-text-size-small); }
</style>
```

```svelte
<!-- src/ui/routes/Tools.svelte -->
<script lang="ts">
  import { coerce } from '../../core/settings/schema'
  import { CORE_TOOLS } from '../../core/tools/index'
  import Field from '../controls/Field.svelte'
  import { patchTool, setEnabled, ui } from '../state.svelte'

  const modules = ['core', 'reading', 'export', 'author'] as const
</script>

{#each modules as module (module)}
  {@const tools = CORE_TOOLS.filter((t) => t.module === module)}
  {#if tools.length > 0}
    <h2>{module}</h2>
    {#each tools as tool (tool.id)}
      {@const enabled = ui.settings?.enabled[tool.id] === true}
      {@const values = coerce(tool.settings, ui.settings?.tools[tool.id] ?? {}) as Record<string, unknown>}
      <section>
        <header class="row">
          <span class="labels">
            <span class="label">{tool.name}</span>
            <span class="help">{tool.description}</span>
          </span>
          <input type="checkbox" checked={enabled} onchange={(e) => setEnabled(tool.id, e.currentTarget.checked)} />
        </header>

        {#if enabled}
          {#each Object.entries(tool.settings) as [key, field] (key)}
            <Field {field} value={values[key]} onchange={(next) => patchTool(tool.id, { [key]: next })} />
          {/each}
        {/if}
      </section>
    {/each}
  {/if}
{/each}

<style>
  h2 { text-transform: capitalize; font-size: var(--xmt-text-size); padding: 16px 16px 4px; margin: 0; color: var(--xmt-text-muted); }
  .row { display: flex; justify-content: space-between; gap: 12px; padding: 12px 16px; border-bottom: 1px solid var(--xmt-border); }
  .labels { display: flex; flex-direction: column; gap: 2px; }
  .label { font-weight: 700; }
  .help { color: var(--xmt-text-muted); font-size: var(--xmt-text-size-small); }
</style>
```

```svelte
<!-- src/ui/routes/Status.svelte -->
<script lang="ts">
  import { ui } from '../state.svelte'
</script>

{#if ui.stats}
  <dl>
    <div><dt>Posts seen</dt><dd>{ui.stats.seen}</dd></div>
    <div><dt>Hidden</dt><dd>{ui.stats.hidden}</dd></div>
    <div><dt>Dimmed</dt><dd>{ui.stats.dimmed}</dd></div>
    <div><dt>Marked</dt><dd>{ui.stats.badged}</dd></div>
  </dl>
{:else}
  <p class="empty">Open an x.com tab to see what XMultiTool is doing.</p>
{/if}

<style>
  dl { margin: 0; }
  div { display: flex; justify-content: space-between; padding: 12px 16px; border-bottom: 1px solid var(--xmt-border); }
  dt { color: var(--xmt-text-muted); }
  dd { margin: 0; font-weight: 700; }
  .empty { padding: 16px; color: var(--xmt-text-muted); }
</style>
```

```svelte
<!-- src/ui/routes/Settings.svelte -->
<script lang="ts">
  import { bus } from '../../core/browser-live'
  import type { ThemeChoice } from '../../core/settings/store'
  import { loadAll, setTheme, ui } from '../state.svelte'

  const themes: ThemeChoice[] = ['auto', 'light', 'dim', 'lights-out']
  let importText = $state('')

  async function exportConfig() {
    const text = await bus.request<string>('config:export', { exportedAt: new Date().toISOString() })
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'xmultitool-config.json'
    link.click()
    URL.revokeObjectURL(url)
  }

  async function importConfig() {
    await bus.request('config:import', { text: importText })
    importText = ''
    await loadAll()
  }
</script>

<section>
  <h2>Theme</h2>
  <div class="row">
    <select value={ui.settings?.ui.theme ?? 'auto'} onchange={(e) => setTheme(e.currentTarget.value as ThemeChoice)}>
      {#each themes as theme (theme)}<option value={theme}>{theme}</option>{/each}
    </select>
  </div>

  <h2>Config</h2>
  <div class="row"><button onclick={exportConfig}>Export config</button></div>
  <div class="row">
    <textarea rows="4" bind:value={importText} placeholder="Paste a config file"></textarea>
    <button onclick={importConfig} disabled={!importText}>Import</button>
  </div>

  <h2>Selector health</h2>
  {#each ui.health as entry (entry.id)}
    <div class="row"><span>{entry.id}</span><span>{entry.healthy ? 'ok' : 'stale'} ({entry.matches})</span></div>
  {:else}
    <p class="empty">No readings yet.</p>
  {/each}

  {#if ui.error}<p class="error">{ui.error}</p>{/if}
</section>

<style>
  h2 { font-size: var(--xmt-text-size); padding: 16px 16px 4px; margin: 0; color: var(--xmt-text-muted); }
  .row { display: flex; gap: 12px; justify-content: space-between; padding: 12px 16px; border-bottom: 1px solid var(--xmt-border); }
  .empty { padding: 16px; color: var(--xmt-text-muted); }
  .error { padding: 16px; color: var(--xmt-danger); }
  button { border-radius: var(--xmt-radius-pill); border: 0; background: var(--xmt-accent); color: var(--xmt-accent-text); padding: 8px 16px; font-weight: 700; cursor: pointer; }
  button:disabled { opacity: 0.5; cursor: default; }
</style>
```

```svelte
<!-- src/ui/App.svelte -->
<script lang="ts">
  import { onMount } from 'svelte'
  import { applyTheme, resolveTheme } from '../core/ui/theme'
  import Settings from './routes/Settings.svelte'
  import Status from './routes/Status.svelte'
  import Tools from './routes/Tools.svelte'
  import { loadAll, ui } from './state.svelte'

  type Tab = 'status' | 'tools' | 'settings'
  let tab = $state<Tab>('status')

  onMount(loadAll)

  $effect(() => {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    applyTheme(document.documentElement, resolveTheme(ui.settings?.ui.theme ?? 'auto', null, prefersDark))
  })
</script>

<nav>
  {#each ['status', 'tools', 'settings'] as name (name)}
    <button class:active={tab === name} onclick={() => (tab = name as Tab)}>{name}</button>
  {/each}
</nav>

<main>
  {#if tab === 'status'}<Status />{:else if tab === 'tools'}<Tools />{:else}<Settings />{/if}
</main>

<style>
  nav { display: flex; border-bottom: 1px solid var(--xmt-border); position: sticky; top: 0; background: var(--xmt-bg); }
  nav button { flex: 1; background: none; border: 0; color: var(--xmt-text-muted); font: inherit; font-weight: 700; padding: 14px 0; cursor: pointer; text-transform: capitalize; transition: color var(--xmt-motion); }
  nav button.active { color: var(--xmt-text); box-shadow: inset 0 -3px 0 var(--xmt-accent); }
  main { max-width: 720px; margin: 0 auto; }
</style>
```

The side panel detects X's own theme through a later message from the content script. For
now the panel resolves `auto` from the system setting, which is why `resolveTheme` takes
`detected` as a parameter. Module 1 adds the live report; the core keeps the seam.

```ts
// src/ui/main.ts
import { mount } from 'svelte'
import App from './App.svelte'
import '../core/ui/tokens.css'

mount(App, { target: document.getElementById('app') as HTMLElement })
```

```html
<!-- entrypoints/sidepanel/index.html -->
<html>
  <head>
    <meta charset="utf-8" />
    <title>XMultiTool</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="../../src/ui/main.ts"></script>
  </body>
</html>
```

```html
<!-- entrypoints/options/index.html -->
<html>
  <head>
    <meta charset="utf-8" />
    <title>XMultiTool options</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="../../src/ui/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 7: Confirm the build carries both pages**

```bash
bun run build
```
Expected: `.output/chrome-mv3/sidepanel.html` and `.output/chrome-mv3/options.html` exist.

- [ ] **Step 8: Commit**

```bash
git add src/ui entrypoints/sidepanel entrypoints/options tests/ui/control-for.test.ts
git commit -m "feat(ui): add side panel and options app with schema-driven settings"
```

---

### Task 17: End-to-end smoke and the live checklist

**Files:**
- Create: `playwright.config.ts`, `e2e/options.spec.ts`, `docs/release-checklist.md`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: the built extension in `.output/chrome-mv3`
- Produces: `bun run e2e`

- [ ] **Step 1: Write the Playwright config**

```ts
// playwright.config.ts
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  use: { headless: false },
})
```

Chrome loads an extension only with a head. CI runs this job under `xvfb-run`.

- [ ] **Step 2: Write the failing end-to-end test**

```ts
// e2e/options.spec.ts
import { resolve } from 'node:path'
import { chromium, expect, test, type BrowserContext } from '@playwright/test'

const EXTENSION = resolve('.output/chrome-mv3')

let context: BrowserContext
let extensionId: string

test.beforeAll(async () => {
  context = await chromium.launchPersistentContext('', {
    headless: false,
    args: [`--disable-extensions-except=${EXTENSION}`, `--load-extension=${EXTENSION}`],
  })
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
  extensionId = worker.url().split('/')[2]
})

test.afterAll(async () => {
  await context.close()
})

test('the options page lists the core tool and remembers a toggle', async () => {
  const page = await context.newPage()
  await page.goto(`chrome-extension://${extensionId}/options.html`)

  await page.getByRole('button', { name: 'tools' }).click()
  await expect(page.getByText('Diagnostics')).toBeVisible()

  const toggle = page.getByRole('checkbox').first()
  await toggle.check()
  await expect(page.getByText('Explain every post')).toBeVisible()

  await page.reload()
  await page.getByRole('button', { name: 'tools' }).click()
  await expect(page.getByRole('checkbox').first()).toBeChecked()
})

test('the status page explains itself when no x tab is open', async () => {
  const page = await context.newPage()
  await page.goto(`chrome-extension://${extensionId}/options.html`)
  await expect(page.getByText('Open an x.com tab')).toBeVisible()
})
```

- [ ] **Step 3: Run it and watch it fail, then pass**

```bash
bunx playwright install chromium
bun run build
bun run e2e
```
Expected on the first run: FAIL if the build is missing or the toggle does not persist.
Fix the cause, then expect PASS, 2 tests.

- [ ] **Step 4: Add the job to CI**

Append to `.github/workflows/ci.yml`:

```yaml
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - run: bunx playwright install --with-deps chromium
      - run: bun run build
      - run: xvfb-run -a bun run e2e
```

- [ ] **Step 5: Write the live checklist**

```markdown
<!-- docs/release-checklist.md -->
# Release checklist

CI proves the logic. Only this checklist proves the live path. Run it against x.com
in a logged-in profile before every release.

1. Load `.output/chrome-mv3` unpacked. Open x.com/home.
2. Open the side panel from the toolbar icon. The Status screen counts posts as you scroll.
3. Enable Diagnostics and turn on "Explain every post". Every cell carries
   `data-xmt-label="graphql"`. Cells that X rendered from cache carry `dom`.
4. Scroll 200 posts. The count keeps rising and the timeline does not stutter.
5. Open a post, go back, open a profile. Status keeps counting on each screen.
6. Settings → Selector health: every entry reads `ok`.
7. Turn Diagnostics off. Every `data-xmt` attribute disappears.
8. Export the config, import it into a clean profile, and confirm the toggles match.
9. Confirm in DevTools → Network that the extension made no request to any host but x.com.
10. Repeat steps 1 to 8 in the Firefox build.

Record the X web app build number from the page source next to the date. When a
fixture stops matching, that number tells you which release changed the shape.
```

- [ ] **Step 6: Commit**

```bash
git add playwright.config.ts e2e docs/release-checklist.md .github/workflows/ci.yml
git commit -m "test: add end-to-end smoke and the live release checklist"
```

---

### Task 18: Project documentation and release build

**Files:**
- Create: `README.md`, `CONTRIBUTING.md`, `PRIVACY.md`, `.github/workflows/release.yml`
- Test: none; this task's deliverable is a reviewable repository and a release artefact

**Interfaces:**
- Consumes: the scripts from Task 1
- Produces: `bun run zip` and `bun run zip:firefox` artefacts attached to a tag

- [ ] **Step 1: Write the README**

```markdown
# XMultiTool

An open-source browser extension for X. Reading control, data export and author tools,
each one a toggle over one shared core.

## State

Sub-project 0, the platform core, is in progress. It ships the adapter, the tool
registry, the settings store and the side panel. Reading control, data export and author
tools follow as separate modules.

## Install for development

```bash
bun install
bun run dev
```

Then load `.output/chrome-mv3` as an unpacked extension.

## Commands

| Command | Effect |
|---|---|
| `bun run dev` | Chrome with hot reload |
| `bun run build` | Chrome production build |
| `bun run build:firefox` | Firefox build |
| `bun run test` | Unit tests |
| `bun run e2e` | End-to-end smoke |
| `bun run zip` | Store artefact |

## Privacy

The extension talks to no server. See `PRIVACY.md`.

## Licence

MIT.
```

- [ ] **Step 2: Write CONTRIBUTING**

```markdown
# Contributing

Three rules keep this project repairable when X changes.

1. **Every X-specific string lives in `src/core/adapter/x-selectors.ts`.** Test ids,
   GraphQL operation names, JSON paths, cookie names. `tests/architecture/selectors.test.ts`
   fails the build when one appears elsewhere.
2. **Tools do not write to the DOM.** A tool returns a verdict. `src/core/tools/apply.ts`
   is the only writer. This is what lets several tools judge the same post without
   fighting each other or X's re-render.
3. **Tools do not call `chrome.*` or read storage.** They use the context object. All
   browser API access goes through `src/core/browser.ts`.

## Adding a tool

Create a file that exports a `Tool`, then add it to `src/core/tools/index.ts`. The
settings UI, the storage defaults and the config export follow from the schema. Nothing
else needs an edit.

## Tests

`bun run test` for logic, `bun run e2e` for the pages, and `docs/release-checklist.md`
by hand against the live site. A green CI run does not prove the live path works.

## Commits

Conventional Commits. One change per commit.
```

- [ ] **Step 3: Write PRIVACY**

```markdown
# Privacy

XMultiTool sends nothing anywhere.

- The extension makes no request to any host except `x.com`, and it makes those only by
  reading responses the site already requested.
- Settings and diagnostics stay in the browser profile. Nothing syncs.
- There is no telemetry, no analytics, no crash reporting and no account.
- The config export writes a file to the device. Whether it is shared is the user's choice.

Permissions and their reasons:

| Permission | Reason |
|---|---|
| `storage` | Keeps settings in the local profile |
| `sidePanel` | Opens the side panel |
| `tabs` | Reads which tab the side panel is showing |
| `scripting` | Injects the page-world reader into x.com |
| `https://x.com/*` | The only site the extension runs on |
```

- [ ] **Step 4: Write the release workflow**

```yaml
# .github/workflows/release.yml
name: release
on:
  push:
    tags: ['v*']
jobs:
  build:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - run: bun run test
      - run: bun run zip
      - run: bun run zip:firefox
      - uses: softprops/action-gh-release@v2
        with:
          files: .output/*.zip
```

Add `"zip": "wxt zip"` and `"zip:firefox": "wxt zip -b firefox"` to `package.json`.

- [ ] **Step 5: Run the whole suite one last time**

```bash
bun run lint && bunx tsc --noEmit && bun run test && bun run build && bun run build:firefox && bun run zip
```
Expected: every command exits zero, and `.output/` holds a zip.

- [ ] **Step 6: Commit**

```bash
git add README.md CONTRIBUTING.md PRIVACY.md .github/workflows/release.yml package.json
git commit -m "docs: add readme, contributing, privacy and the release workflow"
```

---

## Definition of done for sub-project 0

- `bun run lint`, `bunx tsc --noEmit`, `bun run test`, `bun run e2e`, `bun run build` and `bun run build:firefox` all pass.
- The live checklist in `docs/release-checklist.md` passes against x.com in Chrome and Firefox.
- A new tool can ship by adding one file and one line in `src/core/tools/index.ts`.
- Every deliverable in section 15 of the spec has a task above:

| Spec deliverable | Task |
|---|---|
| 1 WXT skeleton, Chrome and Firefox | 1 |
| 2 Page-world interceptor | 10 |
| 3 Normalizer, DOM observer, PostStore | 4, 11, 5 |
| 4 Selector registry, health, guard | 2, 11 |
| 5 Tool registry, verdict applier, containment | 6, 7 |
| 6 Settings schema, defaults, migrations, config file | 8, 13 |
| 7 Typed bus | 9 |
| 8 Side panel and options with Status, Tools, Settings | 16 |
| 9 Token file, three themes, theme detection | 12 |
| 10 `core:diagnostics` tool | 14 |
| 11 Fixtures, unit tests, Playwright, CI | 1, 4, 11, 17 |
