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
    type:
      m.type === 'video'
        ? 'video'
        : m.type === 'animated_gif'
          ? 'gif'
          : 'photo',
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

export function normalizeTweetResult(
  result: unknown,
  isPromoted: boolean,
): Post | null {
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
      id:
        isDict(user) && typeof user.rest_id === 'string' ? user.rest_id : null,
      handle:
        isDict(userLegacy) && typeof userLegacy.screen_name === 'string'
          ? userLegacy.screen_name
          : '',
      displayName:
        isDict(userLegacy) && typeof userLegacy.name === 'string'
          ? userLegacy.name
          : '',
      verifiedType: isDict(user) ? verifiedTypeOf(user) : null,
      followedByUser:
        isDict(userLegacy) && typeof userLegacy.following === 'boolean'
          ? userLegacy.following
          : null,
      followerCount:
        isDict(userLegacy) && typeof userLegacy.followers_count === 'number'
          ? userLegacy.followers_count
          : null,
    },
    counts: {
      reply: numberOr(legacy.reply_count, 0),
      repost: numberOr(legacy.retweet_count, 0),
      like: numberOr(legacy.favorite_count, 0),
      quote: numberOr(legacy.quote_count, 0),
      view: (() => {
        const parsed =
          typeof viewCount === 'string' ? Number(viewCount) : Number.NaN
        return Number.isFinite(parsed) ? parsed : null
      })(),
    },
    media: mediaOf(legacy),
    links: linksOf(legacy),
    isPromoted,
    isReply: typeof legacy.in_reply_to_status_id_str === 'string',
    quotedId:
      typeof legacy.quoted_status_id_str === 'string'
        ? legacy.quoted_status_id_str
        : null,
    repostOfId: (() => {
      const value = get(legacy, [
        'retweeted_status_result',
        'result',
        'rest_id',
      ])
      return typeof value === 'string' ? value : null
    })(),
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
