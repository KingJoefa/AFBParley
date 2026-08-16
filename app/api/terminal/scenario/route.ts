import { NextResponse } from 'next/server'
import { loadLatestGameSnapshot, persistScenario } from '@/lib/data/repository'
import { attachScheduleRestSnapshot } from '@/lib/data/providers/rest'
import { loadOperationalSchedule, ScheduleNotFoundError } from '@/lib/nfl/schedule'
import { ScenarioRequestSchema, type ScenarioGame } from '@/lib/terminal/contracts'
import { resolveScenario } from '@/lib/terminal/scenario'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 })
  }

  const parsed = ScenarioRequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Select one current-week matchup and at least one Game Agent' },
      { status: 400 },
    )
  }

  try {
    const schedule = loadOperationalSchedule()
    const scheduledGame = schedule.games.find(game => game.game_id === parsed.data.game_id)
    if (!scheduledGame) {
      return NextResponse.json(
        { error: 'That matchup is not part of the active week' },
        { status: 409 },
      )
    }

    const game: ScenarioGame = {
      game_id: scheduledGame.game_id,
      season: scheduledGame.season,
      week: scheduledGame.week,
      away_team: scheduledGame.away_team,
      home_team: scheduledGame.home_team,
      kickoff: scheduledGame.kickoff,
      display: scheduledGame.display,
      time: scheduledGame.time,
    }
    const agentIds = [...new Set(parsed.data.agent_ids)]
    let snapshot = await loadLatestGameSnapshot(game.game_id)
    if (agentIds.includes('rest') && !snapshot?.observations.some(observation => observation.agent_id === 'rest')) {
      snapshot = await attachScheduleRestSnapshot({ game: scheduledGame, snapshot })
    }
    const scenario = resolveScenario({ game, agentIds, snapshot })
    const persistence = await persistScenario(scenario)

    return NextResponse.json({ scenario, persistence })
  } catch (error) {
    const message = error instanceof ScheduleNotFoundError
      ? error.message
      : error instanceof Error
        ? error.message
        : 'The active schedule is unavailable'
    return NextResponse.json({ error: message }, { status: 503 })
  }
}
