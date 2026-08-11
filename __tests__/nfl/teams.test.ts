import { describe, expect, it } from 'vitest'
import {
  extractTeamCodesFromMatchup,
  normalizeTeamCode,
  parseMatchup,
} from '@/lib/nfl/teams'

describe('NFL team identity', () => {
  it('normalizes full names, nicknames, and the legacy Rams code', () => {
    expect(normalizeTeamCode('Los Angeles Rams')).toBe('LAR')
    expect(normalizeTeamCode('Rams')).toBe('LAR')
    expect(normalizeTeamCode('LA')).toBe('LAR')
    expect(normalizeTeamCode('Kansas City Chiefs')).toBe('KC')
  })

  it('parses matchup order consistently', () => {
    expect(parseMatchup('New England Patriots @ Seattle Seahawks')).toEqual({
      awayTeam: 'NE',
      homeTeam: 'SEA',
    })
    expect(parseMatchup('LAR vs. CHI')).toEqual({ awayTeam: 'LAR', homeTeam: 'CHI' })
  })

  it('extracts only canonical codes', () => {
    expect([...extractTeamCodesFromMatchup('LA Rams at Seattle')]).toEqual(['LAR', 'SEA'])
  })

  it('rejects ambiguous or incomplete matchups', () => {
    expect(parseMatchup('Los Angeles')).toBeNull()
    expect(parseMatchup('Bills @ Buffalo')).toBeNull()
  })
})
