import { afterEach, describe, expect, it } from 'vitest'
import { fetchDirectLines } from '@/lib/lines/client'

const ORIGINAL_LINES_API_URL = process.env.LINES_API_URL

afterEach(() => {
  if (ORIGINAL_LINES_API_URL === undefined) delete process.env.LINES_API_URL
  else process.env.LINES_API_URL = ORIGINAL_LINES_API_URL
})

describe('fetchDirectLines', () => {
  it('uses local lines when no provider URL is configured', async () => {
    delete process.env.LINES_API_URL

    const lines = await fetchDirectLines({
      year: 2025,
      week: 20,
      matchup: 'LA Rams @ SF',
    })

    expect(lines).toMatchObject({
      total: 45.5,
      spreadHome: -5.5,
      spreadAway: 5.5,
      source: 'fixture',
    })
  })

  it('uses curated notes when no matching legacy line exists', async () => {
    delete process.env.LINES_API_URL

    const lines = await fetchDirectLines({
      year: 2025,
      week: 22,
      matchup: 'New England Patriots @ Seattle Seahawks',
    })

    expect(lines).toMatchObject({
      total: 43,
      spreadHome: -4.5,
      spreadAway: 4.5,
      source: 'notes',
    })
  })
})
