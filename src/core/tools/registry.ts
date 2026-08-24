import type { Command, Post, Route, Tool, ToolCtx, Verdict } from '../types'
import { mergeVerdicts } from './verdict'

export interface RegistryOptions {
  tools: Array<Tool<any>>
  isEnabled(id: string): boolean
  contextFor(id: string): ToolCtx<any>
  onDisable(id: string, error: unknown): void
  // Injected so the registry stays free of the live browser APIs. The content script
  // passes the live check; permissions.request needs a user gesture, so the panel asks
  // for them at the moment the user turns a tool on. Without one every declared
  // permission counts as already granted.
  hasPermissions?(names: string[]): Promise<boolean>
  maxFailures?: number
}

export class ToolRegistry {
  private readonly failureCount = new Map<string, number>()
  private readonly disabled = new Set<string>()
  private readonly maxFailures: number
  private readonly hasPermissions: (names: string[]) => Promise<boolean>

  constructor(private readonly options: RegistryOptions) {
    this.maxFailures = options.maxFailures ?? 3
    this.hasPermissions = options.hasPermissions ?? (async () => true)
  }

  async init(): Promise<void> {
    for (const tool of this.active()) {
      if (!(await this.grant(tool))) continue
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

  // A missing permission does not appear by trying again, so it skips the failure
  // budget and disables the tool on the first answer.
  private async grant(tool: Tool<any>): Promise<boolean> {
    const names = tool.permissions
    if (!names?.length) return true
    try {
      if (await this.hasPermissions(names)) return true
      this.disable(
        tool.id,
        new Error(`xmt: "${tool.id}" needs ${names.join(', ')}`),
      )
    } catch (error) {
      this.disable(tool.id, error)
    }
    return false
  }

  private recordFailure(id: string, error: unknown): void {
    const count = this.failures(id) + 1
    this.failureCount.set(id, count)
    if (count >= this.maxFailures) this.disable(id, error)
  }

  private disable(id: string, error: unknown): void {
    if (this.disabled.has(id)) return
    this.disabled.add(id)
    this.options.onDisable(id, error)
  }
}
