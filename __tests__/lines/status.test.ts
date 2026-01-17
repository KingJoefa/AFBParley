import { describe, expect, it } from 'vitest'
import { computeLinesStatus, linesFallbackRelPath } from '@/lib/lines/status'

describe('linesFallbackRelPath', () => {
  it('pads week to 2 digits and uses forward slashes', () => {
    expect(linesFallbackRelPath(2025, 2)).toBe('my-parlaygpt/data/lines/2025/week-02.json')
    expect(linesFallbackRelPath(2025, 20)).toBe('my-parlaygpt/data/lines/2025/week-20.json')
  })
})

describe('computeLinesStatus', () => {
  it('returns fallback when no API configured and file exists', async () => {
    const status = await computeLinesStatus({
      year: 2025,
      week: 20,
      cwd: '/repo',
      linesApiUrl: '',
      fileStat: () => ({ isFile: true, mtimeMs: 123 }),
    })
    expect(status.mode).toBe('fallback')
    expect(status.expected.rel).toBe('my-parlaygpt/data/lines/2025/week-20.json')
    expect(status.expected.abs).toBe('/repo/my-parlaygpt/data/lines/2025/week-20.json')
    expect(status.fallback.exists).toBe(true)
  })

  it('returns missing when no API configured and file missing', async () => {
    const status = await computeLinesStatus({
      year: 2025,
      week: 20,
      cwd: '/repo',
      linesApiUrl: '',
      fileStat: () => null,
    })
    expect(status.mode).toBe('missing')
    expect(status.expected.rel).toBe('my-parlaygpt/data/lines/2025/week-20.json')
    expect(status.fallback.exists).toBe(false)
  })

  it('returns api when API configured and ping succeeds', async () => {
    const fetchFn = async () => new Response(JSON.stringify({ ok: true }), { status: 200 }) as any
    const status = await computeLinesStatus({
      year: 2025,
      week: 20,
      cwd: '/repo',
      linesApiUrl: 'https://lines.example.com',
      matchup: 'BUF @ DEN',
      fetchFn,
      fileStat: () => null,
    })
    expect(status.mode).toBe('api')
    expect(status.api.configured).toBe(true)
    expect(status.api.attempted).toBe(true)
    expect(status.api.ok).toBe(true)
  })

  it('returns degraded when API configured but ping fails (and includes expected fallback path)', async () => {
    const fetchFn = async () => new Response('nope', { status: 500 }) as any
    const status = await computeLinesStatus({
      year: 2025,
      week: 20,
      cwd: '/repo',
      linesApiUrl: 'https://lines.example.com',
      matchup: 'BUF @ DEN',
      fetchFn,
      fileStat: () => null,
    })
    expect(status.mode).toBe('degraded')
    expect(status.api.attempted).toBe(true)
    expect(status.api.ok).toBe(false)
    expect(status.expected.rel).toBe('my-parlaygpt/data/lines/2025/week-20.json')
  })
})

