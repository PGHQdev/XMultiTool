import type { Post, PostMedia } from '../types'
import { X_SELECTORS } from './x-selectors'

const STATUS_HREF = /^\/([^/]+)\/status\/(\d+)/
const COUNT = /^\s*([\d.,]+)\s*([KMB])?/i
const SCALE: Record<string, number> = { k: 1e3, m: 1e6, b: 1e9 }

function countFrom(text: string | null | undefined): number | null {
  const match = text ? COUNT.exec(text) : null
  if (!match?.[1]) return null
  const base = Number(match[1].replace(/,/g, ''))
  if (!Number.isFinite(base)) return null
  return Math.round(base * (SCALE[match[2]?.toLowerCase() ?? ''] ?? 1))
}

// The aria-label carries the exact count in every locale X ships; the visible
// label is rounded to a compact form ("1.2K"), so it is only the second choice.
function countOf(cell: Element, selector: string): number {
  const button = cell.querySelector(selector)
  if (!button) return 0
  return (
    countFrom(button.getAttribute('aria-label')) ??
    countFrom(button.textContent) ??
    0
  )
}

function handleOf(cell: Element, id: string): string {
  for (const link of cell.querySelectorAll(X_SELECTORS.dom.statusLink)) {
    const match = STATUS_HREF.exec(link.getAttribute('href') ?? '')
    if (match?.[2] === id && match[1]) return match[1]
  }
  return ''
}

// X renders the name block as "Name@handle·1h" with no element of its own around
// the name, so the handle marker is the only boundary the markup offers.
function displayNameOf(cell: Element): string {
  const block = cell.querySelector(X_SELECTORS.dom.userName)
  return (block?.textContent ?? '').split('@')[0]?.trim() ?? ''
}

function mediaOf(cell: Element): PostMedia[] {
  const media: PostMedia[] = []
  for (const player of cell.querySelectorAll(X_SELECTORS.dom.video)) {
    const poster = player.querySelector('img')
    media.push({
      type: 'video',
      url: poster?.getAttribute('src') ?? '',
      alt: poster?.getAttribute('alt') ?? null,
    })
  }
  for (const photo of cell.querySelectorAll(X_SELECTORS.dom.photo)) {
    // A video thumbnail is wrapped by the player above, so counting it here too
    // would report the same item twice.
    if (photo.closest(X_SELECTORS.dom.video)) continue
    const img = photo.querySelector('img')
    media.push({
      type: 'photo',
      url: img?.getAttribute('src') ?? '',
      alt: img?.getAttribute('alt') ?? null,
    })
  }
  return media
}

function linksOf(text: Element | null): string[] {
  if (!text) return []
  const links: string[] = []
  for (const anchor of text.querySelectorAll('a')) {
    const href = anchor.getAttribute('href') ?? ''
    if (/^https?:\/\//.test(href)) links.push(href)
  }
  return links
}

/**
 * Builds the fallback record for a cell that X rendered from its own cache, so no
 * GraphQL response ever described it. Every field is read straight from the markup;
 * a field the markup does not carry stays at the empty value for its type rather
 * than being guessed.
 */
export function postFromCell(id: string, cell: Element): Post {
  const text = cell.querySelector(X_SELECTORS.dom.text)
  const time = cell.querySelector(X_SELECTORS.dom.timestamp)
  const analytics = cell.querySelector(X_SELECTORS.dom.analyticsLink)

  return {
    id,
    source: 'dom',
    createdAt: time?.getAttribute('datetime') ?? null,
    text: text?.textContent ?? '',
    lang: text?.getAttribute('lang') ?? null,
    author: {
      // Only the rendered handle and name are on the page; the numeric user id,
      // the follow relationship and the follower count are not.
      id: null,
      handle: handleOf(cell, id),
      displayName: displayNameOf(cell),
      verifiedType: null,
      followedByUser: null,
      followerCount: null,
    },
    counts: {
      reply: countOf(cell, X_SELECTORS.dom.replyButton),
      repost: countOf(cell, X_SELECTORS.dom.repostButton),
      like: countOf(cell, X_SELECTORS.dom.likeButton),
      // X folds quotes into the repost control and shows views only to the author.
      quote: 0,
      view:
        countFrom(analytics?.getAttribute('aria-label')) ??
        countFrom(analytics?.textContent) ??
        null,
    },
    media: mediaOf(cell),
    links: linksOf(text),
    // The markup labels none of these in a way that survives a locale change, and a
    // wrong flag is worse for a tool than a missing one.
    isPromoted: false,
    isReply: false,
    quotedId: null,
    repostOfId: null,
  }
}
