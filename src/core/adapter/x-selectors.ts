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

export const GRAPHQL_URL_RE =
  /^https:\/\/x\.com\/i\/api\/graphql\/[^/]+\/([A-Za-z0-9_]+)/

const TRACKED = new Set<string>(Object.values(X_SELECTORS.graphqlOperations))

export function operationFromUrl(url: string): string | null {
  const match = GRAPHQL_URL_RE.exec(url)
  return match?.[1] ?? null
}

export function isTrackedOperation(op: string): boolean {
  return TRACKED.has(op)
}
