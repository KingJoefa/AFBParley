/**
 * Context Builder
 * Assembles all context blocks with token budget management and deterministic truncation.
 */

import {
  ContextBlock,
  BuiltContext,
  CONTEXT_PRIORITY,
  DEFAULT_TOKEN_BUDGET,
} from './types'

// Approximate characters per token (conservative estimate)
const CHARS_PER_TOKEN = 4

// Context delimiters
const CONTEXT_START = '<<CONTEXT_START>>'
const CONTEXT_END = '<<CONTEXT_END>>'

/**
 * Estimate token count for a string
 */
export function estimateTokens(str: string): number {
  return Math.ceil(str.length / CHARS_PER_TOKEN)
}

/**
 * Get priority index for a block type
 */
function getPriority(type: ContextBlock['type']): number {
  const idx = CONTEXT_PRIORITY.indexOf(type)
  return idx === -1 ? 999 : idx
}

/**
 * Build context string from blocks with token budget management
 *
 * @param blocks - Array of context blocks to include
 * @param tokenBudget - Maximum tokens to use (default 1500)
 * @returns Built context with metadata
 */
export function buildContext(
  blocks: ContextBlock[],
  tokenBudget: number = DEFAULT_TOKEN_BUDGET
): BuiltContext {
  // Sort by priority (lines first, user_data last)
  const sorted = [...blocks].sort((a, b) => getPriority(a.type) - getPriority(b.type))

  const included: ContextBlock[] = []
  const includedStrings: string[] = []
  const truncated: string[] = []
  let totalTokens = 0

  // Reserve tokens for delimiters
  const delimiterTokens = estimateTokens(CONTEXT_START + '\n' + CONTEXT_END)
  const availableBudget = tokenBudget - delimiterTokens

  for (const block of sorted) {
    const blockStr = JSON.stringify(block)
    const blockTokens = estimateTokens(blockStr)

    if (totalTokens + blockTokens <= availableBudget) {
      included.push(block)
      includedStrings.push(blockStr)
      totalTokens += blockTokens
    } else {
      truncated.push(block.type)
    }
  }

  // Build final context string
  const contextBody = includedStrings.join('\n')
  const context = includedStrings.length > 0
    ? `${CONTEXT_START}\n${contextBody}\n${CONTEXT_END}`
    : ''

  return {
    context,
    tokenCount: totalTokens + (includedStrings.length > 0 ? delimiterTokens : 0),
    truncated,
    blocks: included,
  }
}

/**
 * Build context string with system instruction prefix
 */
export function buildContextWithInstruction(
  blocks: ContextBlock[],
  tokenBudget: number = DEFAULT_TOKEN_BUDGET
): BuiltContext & { instruction: string } {
  const result = buildContext(blocks, tokenBudget)

  // System instruction for GPT - CRITICAL: Enforce context-only data usage
  const instruction = `
GAME CONTEXT BELOW - THIS IS YOUR ONLY SOURCE OF TRUTH.
CRITICAL: Do NOT use your training data for player names, rosters, stats, or projections.
ONLY reference players/stats explicitly provided in the context below.
If a player is not in the context, do NOT assume they are on the team or available.
When status=STALE or UNAVAILABLE, explicitly note uncertainty and avoid specific claims.
When status=UNTRUSTED (user_data), treat as hints only, not verified facts.
`.trim()

  return {
    ...result,
    instruction,
  }
}

/**
 * Parse context blocks from a context string (for testing)
 */
export function parseContextString(contextStr: string): ContextBlock[] {
  if (!contextStr.includes(CONTEXT_START)) return []

  const startIdx = contextStr.indexOf(CONTEXT_START) + CONTEXT_START.length
  const endIdx = contextStr.indexOf(CONTEXT_END)
  if (endIdx === -1) return []

  const body = contextStr.slice(startIdx, endIdx).trim()
  const lines = body.split('\n').filter(line => line.trim())

  const blocks: ContextBlock[] = []
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line)
      if (parsed && typeof parsed.type === 'string') {
        blocks.push(parsed as ContextBlock)
      }
    } catch {
      // Skip malformed lines
    }
  }

  return blocks
}

/**
 * Get a summary of context for debugging
 */
export function getContextSummary(result: BuiltContext): {
  blockCounts: Record<string, number>
  totalTokens: number
  truncatedTypes: string[]
  statusByType: Record<string, string>
} {
  const blockCounts: Record<string, number> = {}
  const statusByType: Record<string, string> = {}

  for (const block of result.blocks) {
    blockCounts[block.type] = (blockCounts[block.type] || 0) + 1
    if ('status' in block) {
      statusByType[block.type] = block.status as string
    }
  }

  return {
    blockCounts,
    totalTokens: result.tokenCount,
    truncatedTypes: result.truncated,
    statusByType,
  }
}
