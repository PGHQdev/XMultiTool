import type { Post } from '../types'

export interface CleanSettings {
  promoted: boolean
  bait: boolean
  ragebait: boolean
  reposts: boolean
  replies: boolean
  mutedWords: string[]
  mutedHandles: string[]
  minFollowers: number
}

export const DEFAULT_CLEAN_SETTINGS: CleanSettings = {
  promoted: true,
  bait: true,
  ragebait: false,
  reposts: false,
  replies: false,
  mutedWords: [],
  mutedHandles: [],
  minFollowers: 0,
}

// The reason is also the key the panel counts by, so it stays a fixed vocabulary.
export type Reason =
  | 'promoted'
  | 'muted account'
  | 'muted word'
  | 'small account'
  | 'engagement bait'
  | 'ragebait'
  | 'repost'
  | 'reply'

// Each pattern names an ask for a reaction, not a topic. A rule that reads a topic
// belongs in the muted words, where the user owns it.
const BAIT = [
  /\b(like|rt|retweet|repost|reply|comment|share)\s+(this\s+)?if\b/,
  /\b(comment|reply|drop|type)\s+["']?\w+["']?\s+(and|then)\s+(i|we)('|’)?(ll| will)\b/,
  /\bfollow\s+(me|us|back)\b/,
  /\bfollow\s+for\s+follow\b/,
  /\bf4f\b/,
  /\btag\s+(someone|a\s+friend|three|3)\b/,
  /\b(bookmark|save)\s+this\b/,
  /\b(don'?t|do\s+not)\s+scroll\s+past\b/,
  /\bbefore\s+you\s+scroll\b/,
  /\blink\s+in\s+bio\b/,
  /\b(read|check)\s+the\s+(first|pinned)\s+(comment|reply|tweet|post)\b/,
  /\bgiveaway\b/,
]

const RAGE_MIN_REPLIES = 50
const RAGE_RATIO = 2

const escapeTerm = (term: string) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// A bare word matches on its boundaries, so "crypto" leaves "cryptography" alone.
// Anything carrying punctuation, a hashtag or an emoji has no useful boundary, so it
// matches as written.
function hasTerm(text: string, term: string): boolean {
  const clean = term.trim().toLowerCase()
  if (!clean) return false
  if (/^[a-z0-9]+$/.test(clean))
    return new RegExp(`\\b${escapeTerm(clean)}\\b`).test(text)
  return text.includes(clean)
}

const handle = (value: string) => value.trim().replace(/^@/, '').toLowerCase()

// Ordered from the most certain judgement to the least, because the first hit is the
// reason the user sees.
export function judge(post: Post, settings: CleanSettings): Reason | null {
  const text = post.text.toLowerCase()

  if (settings.promoted && post.isPromoted) return 'promoted'

  const author = handle(post.author.handle)
  if (settings.mutedHandles.some((m) => handle(m) === author && author))
    return 'muted account'

  if (settings.mutedWords.some((word) => hasTerm(text, word)))
    return 'muted word'

  const followers = post.author.followerCount
  if (
    settings.minFollowers > 0 &&
    post.author.followedByUser !== true &&
    followers !== null &&
    followers < settings.minFollowers
  )
    return 'small account'

  if (settings.bait && BAIT.some((pattern) => pattern.test(text)))
    return 'engagement bait'

  if (
    settings.ragebait &&
    post.counts.reply >= RAGE_MIN_REPLIES &&
    post.counts.reply > post.counts.like * RAGE_RATIO
  )
    return 'ragebait'

  if (settings.reposts && post.repostOfId !== null) return 'repost'
  if (settings.replies && post.isReply) return 'reply'

  return null
}
