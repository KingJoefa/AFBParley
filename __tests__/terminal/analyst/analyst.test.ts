import { describe, it, expect } from 'vitest'
import {
  buildAnalystPrompt,
  parseLLMOutput,
  loadRelevantSkillMds,
} from '@/lib/terminal/analyst'
import type { Finding, LLMOutput, ClaimParts } from '@/lib/terminal/schemas'

const NOW = Date.now()

const mockFindings: Finding[] = [
  {
    id: 'epa-jsn-recv-123',
    agent: 'epa',
    type: 'receiving_epa_mismatch',
    stat: 'receiving_epa_rank',
    value_num: 3,
    value_type: 'numeric',
    threshold_met: 'rank <= 10 AND opponent allows top 10',
    comparison_context: '3rd in league vs 8th worst defense',
    source_ref: 'local://data/epa/2025-week-20.json',
    source_type: 'local',
    source_timestamp: NOW,
  },
  {
    id: 'pressure-sf-vs-sea-456',
    agent: 'pressure',
    type: 'pressure_rate_advantage',
    stat: 'pressure_rate_rank',
    value_num: 3,
    value_type: 'numeric',
    threshold_met: 'defense rank <= 10 AND OL rank >= 22',
    comparison_context: '3rd pass rush vs 28th OL',
    source_ref: 'local://data/pressure/2025-week-20.json',
    source_type: 'local',
    source_timestamp: NOW,
  },
]

// Valid ClaimParts following the schema
const validClaimParts: ClaimParts = {
  metrics: ['receiving_epa'],
  direction: 'positive',
  comparator: 'ranks',
  rank_or_percentile: {
    type: 'rank',
    value: 3,
    scope: 'league',
    direction: 'top',
  },
}

describe('buildAnalystPrompt', () => {
  it('includes skill MDs in prompt', () => {
    const skillMds = {
      epa: '# EPA Agent\n\nFocus on efficiency.',
      pressure: '# Pressure Agent\n\nFocus on pass rush.',
    }

    const prompt = buildAnalystPrompt(mockFindings, skillMds)

    expect(prompt).toContain('EPA Agent')
    expect(prompt).toContain('Pressure Agent')
    expect(prompt).toContain('Focus on efficiency')
  })

  it('includes findings JSON in prompt', () => {
    const prompt = buildAnalystPrompt(mockFindings, {})

    expect(prompt).toContain('epa-jsn-recv-123')
    expect(prompt).toContain('receiving_epa_mismatch')
    expect(prompt).toContain('pressure_rate_advantage')
  })

  it('includes output format instructions', () => {
    const prompt = buildAnalystPrompt(mockFindings, {})

    expect(prompt).toContain('severity')
    expect(prompt).toContain('claim_parts')
    expect(prompt).toContain('implications')
    expect(prompt).toContain('suppressions')
    expect(prompt).toContain('metrics')
  })

  it('includes valid implication lists per agent', () => {
    const prompt = buildAnalystPrompt(mockFindings, {})

    expect(prompt).toContain('EPA: wr_receptions_over')
    expect(prompt).toContain('PRESSURE: qb_sacks_over')
  })
})

describe('parseLLMOutput', () => {
  it('parses valid JSON output', () => {
    const raw = JSON.stringify({
      'epa-jsn-recv-123': {
        severity: 'high',
        claim_parts: validClaimParts,
        implications: ['wr_yards_over'],
        suppressions: [],
      },
    })

    const { output, errors } = parseLLMOutput(raw, mockFindings)

    expect(output['epa-jsn-recv-123']).toBeDefined()
    expect(output['epa-jsn-recv-123'].severity).toBe('high')
    expect(errors.filter(e => !e.includes('Invalid implications'))).toHaveLength(0)
  })

  it('handles markdown code blocks', () => {
    const raw = `\`\`\`json
{
  "epa-jsn-recv-123": {
    "severity": "medium",
    "claim_parts": ${JSON.stringify(validClaimParts)},
    "implications": ["wr_receptions_over"],
    "suppressions": []
  }
}
\`\`\``

    const { output } = parseLLMOutput(raw, mockFindings)

    expect(output['epa-jsn-recv-123']).toBeDefined()
    expect(output['epa-jsn-recv-123'].severity).toBe('medium')
  })

  it('reports error for invalid JSON', () => {
    const raw = 'not valid json'

    const { output, errors } = parseLLMOutput(raw, mockFindings)

    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0]).toContain('Failed to parse')
  })

  it('reports error for unknown finding_id', () => {
    const raw = JSON.stringify({
      'unknown-finding-id': {
        severity: 'high',
        claim_parts: validClaimParts,
        implications: [],
        suppressions: [],
      },
    })

    const { errors } = parseLLMOutput(raw, mockFindings)

    expect(errors).toContain('Unknown finding_id: unknown-finding-id')
  })

  it('reports error for invalid severity', () => {
    const raw = JSON.stringify({
      'epa-jsn-recv-123': {
        severity: 'critical', // Should be 'high' or 'medium'
        claim_parts: validClaimParts,
        implications: [],
        suppressions: [],
      },
    })

    const { errors } = parseLLMOutput(raw, mockFindings)

    expect(errors.some(e => e.includes('Invalid severity'))).toBe(true)
  })

  it('reports error for missing claim_parts metrics', () => {
    const raw = JSON.stringify({
      'epa-jsn-recv-123': {
        severity: 'high',
        claim_parts: {
          // Missing metrics array
          direction: 'positive',
          comparator: 'ranks',
        },
        implications: [],
        suppressions: [],
      },
    })

    const { errors } = parseLLMOutput(raw, mockFindings)

    expect(errors.some(e => e.includes('Missing or invalid claim_parts'))).toBe(true)
  })

  it('reports error for invalid implications', () => {
    const raw = JSON.stringify({
      'epa-jsn-recv-123': {
        severity: 'high',
        claim_parts: validClaimParts,
        implications: ['qb_sacks_over'], // Invalid for EPA agent
        suppressions: [],
      },
    })

    const { errors } = parseLLMOutput(raw, mockFindings)

    expect(errors.some(e => e.includes('Invalid implications'))).toBe(true)
  })

  it('filters out invalid implications from output', () => {
    const raw = JSON.stringify({
      'epa-jsn-recv-123': {
        severity: 'high',
        claim_parts: validClaimParts,
        implications: ['wr_yards_over', 'qb_sacks_over'], // qb_sacks_over invalid for EPA
        suppressions: [],
      },
    })

    const { output } = parseLLMOutput(raw, mockFindings)

    expect(output['epa-jsn-recv-123'].implications).toContain('wr_yards_over')
    expect(output['epa-jsn-recv-123'].implications).not.toContain('qb_sacks_over')
  })
})

describe('loadRelevantSkillMds', () => {
  it('loads skill MDs for agents in findings', () => {
    const skillMds = loadRelevantSkillMds(mockFindings)

    expect(Object.keys(skillMds)).toContain('epa')
    expect(Object.keys(skillMds)).toContain('pressure')
  })

  it('returns unique agents only', () => {
    const duplicateFinding: Finding = {
      ...mockFindings[0],
      id: 'epa-another-789',
    }

    const skillMds = loadRelevantSkillMds([...mockFindings, duplicateFinding])

    // Should still only have 2 agents (epa, pressure)
    expect(Object.keys(skillMds).length).toBe(2)
  })

  it('returns content for each agent skill.md', () => {
    const skillMds = loadRelevantSkillMds(mockFindings)

    // EPA skill.md should contain domain info
    expect(skillMds.epa).toContain('EPA')
    expect(skillMds.pressure).toContain('Pressure')
  })
})
