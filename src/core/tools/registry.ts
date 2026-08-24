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
