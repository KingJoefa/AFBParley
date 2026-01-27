import type { SwantailLeg } from './schema'

type TeamTotals = {
  home: number
  away: number
}

type GuardContext = {
  gameTotal?: number
  teamTotals?: TeamTotals
  tolerance?: number
}

const DEFAULT_TOLERANCE = 0.01

function extractLine(selection: string): number | undefined {
  const match = selection.match(/(\d+(?:\.\d+)?)/)
  if (!match) return undefined
  const value = Number(match[1])
  return Number.isFinite(value) ? value : undefined
}

function extractDirection(selection: string): 'Under' | 'Over' | undefined {
  if (/\bunder\b/i.test(selection)) return 'Under'
  if (/\bover\b/i.test(selection)) return 'Over'
  return undefined
}

function formatGameTotalSelection(direction: 'Under' | 'Over', line: number): string {
  const formatted = line % 1 === 0 ? line.toFixed(0) : line.toFixed(1)
  return `${direction} ${formatted} Points`
}

function isTeamTotalMarket(market: string): boolean {
  return /team\s*total/i.test(market)
}

function withinTolerance(value: number, target: number, tolerance: number): boolean {
  return Math.abs(value - target) <= tolerance
}

export function enforceTeamTotalGuard(leg: SwantailLeg, context: GuardContext): SwantailLeg {
  if (!isTeamTotalMarket(leg.market)) return leg

  const gameTotal = context.gameTotal
  if (gameTotal === undefined) return leg

  const tolerance = context.tolerance ?? DEFAULT_TOLERANCE
  const line = extractLine(leg.selection)
  if (line === undefined) return leg

  if (!withinTolerance(line, gameTotal, tolerance)) return leg

  const direction = extractDirection(leg.selection)
  if (!direction) return leg

  return {
    ...leg,
    market: 'Game Total',
    selection: formatGameTotalSelection(direction, gameTotal),
  }
}
