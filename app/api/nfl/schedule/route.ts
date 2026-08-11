import { NextResponse } from 'next/server'
import { SeasonSchema, WeekSchema } from '@/lib/nfl/game'
import { loadSchedule, ScheduleNotFoundError } from '@/lib/nfl/schedule'

export const dynamic = 'force-dynamic'

function optionalInteger(value: string | null, fallback?: string): number | undefined {
  const candidate = value ?? fallback
  if (!candidate?.trim()) return undefined
  const parsed = Number(candidate)
  return Number.isInteger(parsed) ? parsed : Number.NaN
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const season = optionalInteger(
    url.searchParams.get('season'),
    process.env.NFL_SEASON ?? process.env.NFL_YEAR,
  )
  const week = optionalInteger(url.searchParams.get('week'), process.env.NFL_WEEK)

  const selection = SeasonSchema.optional().safeParse(season)
  const weekSelection = WeekSchema.optional().safeParse(week)
  if (!selection.success || !weekSelection.success) {
    return NextResponse.json(
      { error: 'season and week must be valid integers', code: 'INVALID_SCHEDULE_RANGE' },
      { status: 400 },
    )
  }

  try {
    const schedule = loadSchedule({ season: selection.data, week: weekSelection.data })
    return NextResponse.json({
      ...schedule,
      totalGames: schedule.games.length,
    })
  } catch (error) {
    if (error instanceof ScheduleNotFoundError) {
      return NextResponse.json(
        { error: error.message, code: 'SCHEDULE_NOT_FOUND' },
        { status: 404 },
      )
    }

    return NextResponse.json(
      { error: 'Schedule data is unavailable', code: 'SCHEDULE_INVALID' },
      { status: 500 },
    )
  }
}
