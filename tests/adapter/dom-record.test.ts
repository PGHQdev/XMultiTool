import { describe, expect, it } from 'vitest'
import { postFromCell } from '../../src/core/adapter/dom-record'

const RICH = `
<div data-testid="cellInnerDiv">
  <article data-testid="tweet">
    <div data-testid="User-Name">
      <a href="/jack"><span>Jack</span></a><a href="/jack">@jack</a><span>·</span>
      <a href="/jack/status/1001"><time datetime="2026-08-24T10:00:00.000Z">1h</time></a>
    </div>
    <div data-testid="tweetText" lang="en">hello <a href="https://t.co/abc">example.com</a></div>
    <div data-testid="tweetPhoto"><img src="https://pbs.example/a.jpg" alt="a photo"></div>
    <div role="group">
      <button data-testid="reply" aria-label="3 Replies. Reply"><span>3</span></button>
      <button data-testid="retweet" aria-label="1,234 reposts. Repost"><span>1.2K</span></button>
      <button data-testid="like" aria-label=""><span>2.5K</span></button>
      <a href="/jack/status/1001/analytics" aria-label="4200 views. View post analytics"><span>4.2K</span></a>
    </div>
  </article>
</div>`

function cellOf(html: string): HTMLElement {
  document.body.innerHTML = html
  return document.body.firstElementChild as HTMLElement
}

describe('postFromCell', () => {
  const post = postFromCell('1001', cellOf(RICH))

  it('marks the source as dom', () => {
    expect(post.source).toBe('dom')
  })

  it('reads the text, language and timestamp', () => {
    expect(post.text).toBe('hello example.com')
    expect(post.lang).toBe('en')
    expect(post.createdAt).toBe('2026-08-24T10:00:00.000Z')
  })

  it('reads the author the markup shows and nothing more', () => {
    expect(post.author).toEqual({
      id: null,
      handle: 'jack',
      displayName: 'Jack',
      verifiedType: null,
      followedByUser: null,
      followerCount: null,
    })
  })

  it('prefers the exact aria-label count over the rounded label', () => {
    expect(post.counts.reply).toBe(3)
    expect(post.counts.repost).toBe(1234)
  })

  it('falls back to the compact label when no aria-label carries a count', () => {
    expect(post.counts.like).toBe(2500)
  })

  it('reads the view count from the analytics link', () => {
    expect(post.counts.view).toBe(4200)
  })

  it('reads media and links', () => {
    expect(post.media).toEqual([
      { type: 'photo', url: 'https://pbs.example/a.jpg', alt: 'a photo' },
    ])
    expect(post.links).toEqual(['https://t.co/abc'])
  })

  it('reads a video once, not also as its thumbnail', () => {
    const withVideo = postFromCell(
      '2002',
      cellOf(`
        <div data-testid="cellInnerDiv">
          <div data-testid="videoPlayer">
            <div data-testid="tweetPhoto"><img src="https://pbs.example/poster.jpg" alt=""></div>
          </div>
        </div>`),
    )
    expect(withVideo.media).toEqual([
      { type: 'video', url: 'https://pbs.example/poster.jpg', alt: '' },
    ])
  })

  it('leaves every unreadable field empty instead of guessing', () => {
    const bare = postFromCell(
      '3003',
      cellOf('<div data-testid="cellInnerDiv"></div>'),
    )
    expect(bare).toEqual({
      id: '3003',
      source: 'dom',
      createdAt: null,
      text: '',
      lang: null,
      author: {
        id: null,
        handle: '',
        displayName: '',
        verifiedType: null,
        followedByUser: null,
        followerCount: null,
      },
      counts: { reply: 0, repost: 0, like: 0, quote: 0, view: null },
      media: [],
      links: [],
      isPromoted: false,
      isReply: false,
      quotedId: null,
      repostOfId: null,
    })
  })

  it('reads the counts of a post the viewer already reposted and liked', () => {
    const acted = postFromCell(
      '4004',
      cellOf(`
        <div data-testid="cellInnerDiv">
          <div role="group">
            <button data-testid="unretweet" aria-label="1,234 reposts. Undo repost"><span>1.2K</span></button>
            <button data-testid="unlike" aria-label="5,678 Likes. Liked"><span>5.6K</span></button>
          </div>
        </div>`),
    )
    expect(acted.counts.repost).toBe(1234)
    expect(acted.counts.like).toBe(5678)
  })

  it('ignores a status link that belongs to another post in the cell', () => {
    const quoted = postFromCell(
      '1001',
      cellOf(`
        <div data-testid="cellInnerDiv">
          <a href="/other/status/9009">quoted</a>
          <a href="/jack/status/1001">1h</a>
        </div>`),
    )
    expect(quoted.author.handle).toBe('jack')
  })
})
