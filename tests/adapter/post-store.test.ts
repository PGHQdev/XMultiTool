import { beforeEach, describe, expect, it } from 'vitest'
import { type PostPair, PostStore } from '../../src/core/adapter/post-store'
import type { Post } from '../../src/core/types'

function makePost(id: string): Post {
  return {
    id,
    source: 'graphql',
    createdAt: null,
    text: '',
    lang: null,
    author: {
      id: null,
      handle: 'a',
      displayName: 'A',
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
    const angry = new PostStore({
      onPair: () => {
        throw new Error('tool blew up')
      },
    })
    angry.addRecord(makePost('5'))
    expect(() =>
      angry.addNode('5', document.createElement('div')),
    ).not.toThrow()
  })

  it('emits when the same node is reused for a different id', () => {
    const node = document.createElement('div')
    store.addRecord(makePost('x'))
    store.addNode('x', node)
    expect(pairs).toHaveLength(1)
    store.addRecord(makePost('y'))
    store.addNode('y', node)
    expect(pairs).toHaveLength(2)
  })

  it('does not re-emit when a replacement record arrives for an already-paired id', () => {
    const node = document.createElement('div')
    store.addRecord(makePost('z'))
    store.addNode('z', node)
    expect(pairs).toHaveLength(1)
    store.addRecord(makePost('z'))
    expect(pairs).toHaveLength(1)
  })
})
