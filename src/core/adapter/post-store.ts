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
  private readonly paired = new WeakMap<HTMLElement, string>()

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
    if (this.paired.get(node) === id) return

    this.paired.set(node, id)
    try {
      this.options.onPair({ post, node })
    } catch {
      // A consumer failure must never break the timeline. The registry reports it.
    }
  }
}
