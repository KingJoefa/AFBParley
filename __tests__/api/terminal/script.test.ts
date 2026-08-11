import { afterEach, describe, expect, it } from 'vitest'
import { POST } from '@/app/api/terminal/script/route'
import type { ScenarioGame } from '@/lib/terminal/contracts'
import { resolveScenario } from '@/lib/terminal/scenario'

const originalApiKey = process.env.OPENAI_API_KEY

afterEach(() => {
  if (originalApiKey === undefined) delete process.env.OPENAI_API_KEY
  else process.env.OPENAI_API_KEY = originalApiKey
})

function request(body: unknown): Request {
  return new Request('http://localhost/api/terminal/script', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const game: ScenarioGame = {
  game_id: '2026-wk01-NE-at-SEA',
  season: 2026,
  week: 1,
  away_team: 'NE',
  home_team: 'SEA',
  kickoff: '2026-09-10T00:20:00.000Z',
  display: 'New England Patriots @ Seattle Seahawks',
  time: 'Wed 8:20 PM ET',
}

describe('/api/terminal/script', () => {
  it('builds a script-only fallback without betting legs', async () => {
    delete process.env.OPENAI_API_KEY
    const scenario = resolveScenario({ game, agentIds: ['weather', 'pressure'] })
    const response = await POST(request({ scenario, anchor_ids: ['game_under', 'grind'] }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.script.generation).toBe('deterministic')
    expect(body.script.causal_chain.length).toBeGreaterThanOrEqual(2)
    expect(body.script.anchor_ids).toEqual(['game_under', 'grind'])
    expect(body.script).not.toHaveProperty('legs')
    expect(body.script).not.toHaveProperty('parlay_math')
  })

  it('rejects mutually exclusive anchors', async () => {
    const scenario = resolveScenario({ game, agentIds: ['weather'] })
    const response = await POST(request({ scenario, anchor_ids: ['game_over', 'game_under'] }))
    expect(response.status).toBe(400)
  })
})
