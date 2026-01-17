import { describe, it, expect } from 'vitest'
import {
  parseCommand,
  normalizeTeam,
  validateMatchup,
  getHelpText,
} from '@/lib/terminal/ui'

describe('normalizeTeam', () => {
  it('normalizes team nicknames to abbreviations', () => {
    expect(normalizeTeam('49ers')).toBe('SF')
    expect(normalizeTeam('niners')).toBe('SF')
    expect(normalizeTeam('seahawks')).toBe('SEA')
    expect(normalizeTeam('chiefs')).toBe('KC')
  })

  it('handles already abbreviated teams', () => {
    expect(normalizeTeam('SF')).toBe('SF')
    expect(normalizeTeam('sea')).toBe('SEA')
    expect(normalizeTeam('kc')).toBe('KC')
  })

  it('handles case insensitivity', () => {
    expect(normalizeTeam('SEAHAWKS')).toBe('SEA')
    expect(normalizeTeam('Seahawks')).toBe('SEA')
    expect(normalizeTeam('seahawks')).toBe('SEA')
  })

  it('trims whitespace', () => {
    expect(normalizeTeam('  SF  ')).toBe('SF')
    expect(normalizeTeam(' seahawks ')).toBe('SEA')
  })
})

describe('parseCommand', () => {
  describe('matchup commands', () => {
    it('parses @ format matchups', () => {
      const result = parseCommand('SF @ SEA')
      expect(result.type).toBe('matchup')
      expect(result.args).toEqual(['SF', 'SEA'])
    })

    it('parses @ format with team names', () => {
      const result = parseCommand('49ers @ Seahawks')
      expect(result.type).toBe('matchup')
      expect(result.args).toEqual(['SF', 'SEA'])
    })

    it('parses @ format without spaces', () => {
      const result = parseCommand('SF@SEA')
      expect(result.type).toBe('matchup')
      expect(result.args).toEqual(['SF', 'SEA'])
    })

    it('parses vs format matchups', () => {
      const result = parseCommand('Chiefs vs Raiders')
      expect(result.type).toBe('matchup')
      expect(result.args).toEqual(['KC', 'LV'])
    })

    it('parses vs. format with period', () => {
      const result = parseCommand('GB vs. DET')
      expect(result.type).toBe('matchup')
      expect(result.args).toEqual(['GB', 'DET'])
    })
  })

  describe('build command', () => {
    it('parses basic build command', () => {
      const result = parseCommand('build')
      expect(result.type).toBe('build')
      expect(result.args).toEqual([])
      expect(result.flags).toEqual({})
    })

    it('parses build with --raw flag', () => {
      const result = parseCommand('build --raw')
      expect(result.type).toBe('build')
      expect(result.flags.raw).toBe(true)
    })

    it('parses build with --max flag and value', () => {
      const result = parseCommand('build --max 3')
      expect(result.type).toBe('build')
      expect(result.flags.max).toBe('3')
    })

    it('parses build with multiple flags', () => {
      const result = parseCommand('build --raw --max 4')
      expect(result.type).toBe('build')
      expect(result.flags.raw).toBe(true)
      expect(result.flags.max).toBe('4')
    })
  })

  describe('bet command', () => {
    it('parses basic bet command', () => {
      const result = parseCommand('bet')
      expect(result.type).toBe('bet')
      expect(result.args).toEqual([])
    })

    it('parses bet with prop argument', () => {
      const result = parseCommand('bet chase receptions')
      expect(result.type).toBe('bet')
      expect(result.args).toEqual(['chase', 'receptions'])
    })

    it('parses bet with flags', () => {
      const result = parseCommand('bet --aggressive')
      expect(result.type).toBe('bet')
      expect(result.flags.aggressive).toBe(true)
    })
  })

  describe('help command', () => {
    it('parses help command', () => {
      const result = parseCommand('help')
      expect(result.type).toBe('help')
    })

    it('parses ? as help', () => {
      const result = parseCommand('?')
      expect(result.type).toBe('help')
    })
  })

  describe('theme command', () => {
    it('parses theme command without argument', () => {
      const result = parseCommand('theme')
      expect(result.type).toBe('theme')
      expect(result.args).toEqual([])
    })

    it('parses theme command with team', () => {
      const result = parseCommand('theme SF')
      expect(result.type).toBe('theme')
      expect(result.args).toEqual(['SF'])
    })

    it('parses theme command with team name', () => {
      const result = parseCommand('theme Seahawks')
      expect(result.type).toBe('theme')
      expect(result.args).toEqual(['Seahawks'])
    })
  })

  describe('retry and clear commands', () => {
    it('parses retry command', () => {
      const result = parseCommand('retry')
      expect(result.type).toBe('retry')
    })

    it('parses clear command', () => {
      const result = parseCommand('clear')
      expect(result.type).toBe('clear')
    })

    it('parses cls as clear', () => {
      const result = parseCommand('cls')
      expect(result.type).toBe('clear')
    })
  })

  describe('unknown commands', () => {
    it('returns unknown for empty input', () => {
      const result = parseCommand('')
      expect(result.type).toBe('unknown')
    })

    it('returns unknown for unrecognized input', () => {
      const result = parseCommand('foobar')
      expect(result.type).toBe('unknown')
      expect(result.args).toEqual(['foobar'])
    })

    it('preserves raw input', () => {
      const result = parseCommand('some random text')
      expect(result.type).toBe('unknown')
      expect(result.raw).toBe('some random text')
    })
  })
})

describe('validateMatchup', () => {
  it('validates valid matchups', () => {
    const result = validateMatchup('SF', 'SEA')
    expect(result.valid).toBe(true)
    expect(result.error).toBeUndefined()
  })

  it('rejects unknown away team', () => {
    const result = validateMatchup('XXX', 'SEA')
    expect(result.valid).toBe(false)
    expect(result.error).toContain('Unknown team')
  })

  it('rejects unknown home team', () => {
    const result = validateMatchup('SF', 'YYY')
    expect(result.valid).toBe(false)
    expect(result.error).toContain('Unknown team')
  })

  it('rejects same team matchup', () => {
    const result = validateMatchup('SF', 'SF')
    expect(result.valid).toBe(false)
    expect(result.error).toContain('same')
  })
})

describe('getHelpText', () => {
  it('returns help text with all commands', () => {
    const help = getHelpText()

    expect(help).toContain('matchup')
    expect(help).toContain('build')
    expect(help).toContain('bet')
    expect(help).toContain('help')
    expect(help).toContain('theme')
    expect(help).toContain('retry')
    expect(help).toContain('clear')
  })

  it('includes example matchup formats', () => {
    const help = getHelpText()

    expect(help).toContain('SF @ SEA')
    expect(help).toContain('49ers @ Seahawks')
  })
})
