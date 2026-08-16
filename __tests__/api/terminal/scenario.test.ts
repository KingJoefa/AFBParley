import { describe, expect, it } from 'vitest'
import { POST } from '@/app/api/terminal/scenario/route'
import { loadSchedule } from '@/lib/nfl/schedule'

function request(body: unknown): Request {
  return new Request('http://localhost/api/terminal/scenario', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}
describe('/api/terminal/scenario', () => {
  it('accepts only games from the operational week', async () => {
    const response = await POST(request({ game_id: 'not-current', agent_ids: ['weather'] }))
    expect(response.status).toBe(409)
  })

  it('returns a resolved scenario for a current-week game', async () => {
    const game = loadSchedule().games[0]
    const response = await POST(request({ game_id: game.game_id, agent_ids: ['weather', 'pace'] }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.scenario.game.game_id).toBe(game.game_id)
    expect(body.scenario.events).toHaveLength(2)
    expect(body.scenario.evidence_state).toBe('scenario_assumptions')
  })

  it('rejects retired player-position selectors', async () => {
    const game = loadSchedule().games[0]
    const response = await POST(request({ game_id: game.game_id, agent_ids: ['wr'] }))

    expect(response.status).toBe(400)
  })

  it('derives Rest context without requiring a stored snapshot', async () => {
    const game = loadSchedule().games[0]
    const response = await POST(request({ game_id: game.game_id, agent_ids: ['rest'] }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.scenario.events[0].finding.state).toBe('contextual')
    expect(body.scenario.events[0].evidence_state).toBe('observed_context')
    expect(body.scenario.events[0].observations).toHaveLength(2)
  })
})
