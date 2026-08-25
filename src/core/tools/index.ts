import type { Tool } from '../types'
import { cleanTool } from './clean'
import { diagnosticsTool } from './diagnostics'

// Modules 1 to 3 append their tools here. The core keeps no module-specific code.
export const CORE_TOOLS: Array<Tool<any>> = [cleanTool, diagnosticsTool]
