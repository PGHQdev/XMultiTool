import type { Post } from '../types'

export interface PostPair {
  post: Post
  node: HTMLElement
}

export interface DomFallback {
  build(id: string, node: HTMLElement): Post | null
  afterMs: number
  setTimer(run: () => void, ms: number): number
  clearTimer(handle: number): void
}

export interface PostStoreOptions {
  onPair(pair: PostPair): void
  max?: number
  domFallback?: DomFallback
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
  private readonly paired = new WeakMap<HTMLElement, string>()
  private readonly idOfNode = new WeakMap<HTMLElement, string>()
  private readonly timers = new Map<string, number>()

  constructor(private readonly options: PostStoreOptions) {
    const max = options.max ?? 500
    this.records = new Bounded<Post>(max)
    this.nodes = new Bounded<HTMLElement>(max)
  }

  addRecord(post: Post): void {
    this.cancelFallback(post.id)
    this.records.put(post.id, post)
    this.tryPair(post.id)
  }

  addNode(id: string, node: HTMLElement): void {
    // X recycles a cell for a different post while scrolling. Without dropping the
    // node's former id, a late record for that id would fire a verdict against the
    // post now on screen.
    const former = this.idOfNode.get(node)
    if (former !== undefined && former !== id) {
      if (this.nodes.get(former) === node) this.nodes.delete(former)
      this.cancelFallback(former)
    }
    this.idOfNode.set(node, id)

    this.nodes.put(id, node)
    this.tryPair(id)
    this.scheduleFallback(id, node)
  }

  size(): { records: number; nodes: number } {
    return { records: this.records.size, nodes: this.nodes.size }
  }

  private tryPair(id: string): void {
    const post = this.records.get(id)
    const node = this.nodes.get(id)
    if (!post || !node) return
    if (this.paired.get(node) === id) return

    this.paired.set(node, id)
    try {
      this.options.onPair({ post, node })
    } catch {
      // A consumer failure must never break the timeline. The registry reports it.
    }
  }

  // X renders a cell from its own cache when no response describes it, so a node
  // that stays unpaired past the grace period gets the record the markup can give.
  private scheduleFallback(id: string, node: HTMLElement): void {
    const fallback = this.options.domFallback
    if (!fallback || this.records.has(id)) return
    this.cancelFallback(id)

    const handle = fallback.setTimer(() => {
      this.timers.delete(id)
      if (this.records.has(id) || this.nodes.get(id) !== node) return
      if (this.paired.get(node) === id) return
      const post = fallback.build(id, node)
      if (!post) return
      this.records.put(id, post)
      this.tryPair(id)
    }, fallback.afterMs)

    this.timers.set(id, handle)
  }

  private cancelFallback(id: string): void {
    const handle = this.timers.get(id)
    if (handle === undefined) return
    this.timers.delete(id)
    this.options.domFallback?.clearTimer(handle)
  }
}
