import { describe, it, expect } from 'vitest'
import {
  hashContent,
  hashObject,
  buildProvenance,
  verifyProvenance,
  generateRequestId,
} from '@/lib/terminal/engine/provenance'
import type { Finding } from '@/lib/terminal/schemas'

const NOW = Date.now()

describe('hashContent', () => {
  it('produces consistent hashes', () => {
    const content = 'test content'
    const hash1 = hashContent(content)
    const hash2 = hashContent(content)
    expect(hash1).toBe(hash2)
  })

  it('produces different hashes for different content', () => {
    const hash1 = hashContent('content A')
    const hash2 = hashContent('content B')
    expect(hash1).not.toBe(hash2)
  })

  it('returns 12-character hash', () => {
    const hash = hashContent('test')
    expect(hash).toHaveLength(12)
  })

  it('produces hex characters only', () => {
    const hash = hashContent('any content')
    expect(hash).toMatch(/^[0-9a-f]{12}$/)
  })
})

describe('hashObject', () => {
  it('produces consistent hashes regardless of key order', () => {
    const obj1 = { b: 2, a: 1, c: 3 }
    const obj2 = { a: 1, b: 2, c: 3 }
    expect(hashObject(obj1)).toBe(hashObject(obj2))
  })

  it('produces different hashes for different objects', () => {
    const obj1 = { a: 1 }
    const obj2 = { a: 2 }
    expect(hashObject(obj1)).not.toBe(hashObject(obj2))
  })
})

describe('buildProvenance', () => {
  const mockFindings: Finding[] = [
    {
      id: 'epa-001',
      agent: 'epa',
      type: 'receiving_epa_mismatch',
      stat: 'receiving_epa',
      value_num: 0.31,
      value_type: 'numeric',
      threshold_met: 'rank <= 10',
      comparison_context: 'top 5',
      source_ref: 'local://data/epa/week-20.json',
      source_type: 'local',
      source_timestamp: NOW,
    },
  ]

  it('builds complete provenance object', () => {
    const provenance = buildProvenance({
      requestId: 'req-123',
      prompt: 'Analyze these findings...',
      skillMds: { epa: '# EPA Agent\nFocus on efficiency.' },
      findings: mockFindings,
      dataVersion: '2025-week-20',
      dataTimestamp: NOW,
      searchTimestamps: [],
      agentsInvoked: ['epa'],
      agentsSilent: ['weather', 'pressure'],
      cacheHits: 1,
      cacheMisses: 0,
      llmModel: 'gpt-4o',
      llmTemperature: 0,
    })

    expect(provenance.request_id).toBe('req-123')
    expect(provenance.prompt_hash).toHaveLength(12)
    expect(provenance.findings_hash).toHaveLength(12)
    expect(provenance.skill_md_hashes.epa).toHaveLength(12)
    expect(provenance.data_version).toBe('2025-week-20')
    expect(provenance.agents_invoked).toContain('epa')
    expect(provenance.agents_silent).toContain('weather')
    expect(provenance.llm_model).toBe('gpt-4o')
    expect(provenance.llm_temperature).toBe(0)
  })

  it('produces deterministic hashes', () => {
    const input = {
      requestId: 'req-123',
      prompt: 'test prompt',
      skillMds: { epa: '# EPA' },
      findings: mockFindings,
      dataVersion: '2025-week-20',
      dataTimestamp: NOW,
      searchTimestamps: [],
      agentsInvoked: ['epa'] as const,
      agentsSilent: [] as const,
      cacheHits: 0,
      cacheMisses: 0,
      llmModel: 'gpt-4o',
      llmTemperature: 0,
    }

    const prov1 = buildProvenance(input)
    const prov2 = buildProvenance(input)

    expect(prov1.prompt_hash).toBe(prov2.prompt_hash)
    expect(prov1.findings_hash).toBe(prov2.findings_hash)
    expect(prov1.skill_md_hashes.epa).toBe(prov2.skill_md_hashes.epa)
  })
})

describe('verifyProvenance', () => {
  const mockFindings: Finding[] = [
    {
      id: 'epa-001',
      agent: 'epa',
      type: 'receiving_epa_mismatch',
      stat: 'receiving_epa',
      value_num: 0.31,
      value_type: 'numeric',
      threshold_met: 'rank <= 10',
      comparison_context: 'top 5',
      source_ref: 'local://data/epa/week-20.json',
      source_type: 'local',
      source_timestamp: NOW,
    },
  ]

  it('returns valid when hashes match', () => {
    const prompt = 'test prompt'
    const skillMds = { epa: '# EPA Agent' }

    const provenance = buildProvenance({
      requestId: 'req-123',
      prompt,
      skillMds,
      findings: mockFindings,
      dataVersion: '2025-week-20',
      dataTimestamp: NOW,
      searchTimestamps: [],
      agentsInvoked: ['epa'],
      agentsSilent: [],
      cacheHits: 0,
      cacheMisses: 0,
      llmModel: 'gpt-4o',
      llmTemperature: 0,
    })

    const result = verifyProvenance(provenance, {
      prompt,
      skillMds,
      findings: mockFindings,
    })

    expect(result.valid).toBe(true)
    expect(result.mismatches).toHaveLength(0)
  })

  it('detects prompt hash mismatch', () => {
    const provenance = buildProvenance({
      requestId: 'req-123',
      prompt: 'original prompt',
      skillMds: {},
      findings: mockFindings,
      dataVersion: '2025-week-20',
      dataTimestamp: NOW,
      searchTimestamps: [],
      agentsInvoked: ['epa'],
      agentsSilent: [],
      cacheHits: 0,
      cacheMisses: 0,
      llmModel: 'gpt-4o',
      llmTemperature: 0,
    })

    const result = verifyProvenance(provenance, {
      prompt: 'different prompt',
      skillMds: {},
      findings: mockFindings,
    })

    expect(result.valid).toBe(false)
    expect(result.mismatches).toHaveLength(1)
    expect(result.mismatches[0]).toContain('prompt_hash')
  })

  it('detects findings hash mismatch', () => {
    const provenance = buildProvenance({
      requestId: 'req-123',
      prompt: 'test',
      skillMds: {},
      findings: mockFindings,
      dataVersion: '2025-week-20',
      dataTimestamp: NOW,
      searchTimestamps: [],
      agentsInvoked: ['epa'],
      agentsSilent: [],
      cacheHits: 0,
      cacheMisses: 0,
      llmModel: 'gpt-4o',
      llmTemperature: 0,
    })

    const modifiedFindings = [{ ...mockFindings[0], value_num: 0.99 }]

    const result = verifyProvenance(provenance, {
      prompt: 'test',
      skillMds: {},
      findings: modifiedFindings,
    })

    expect(result.valid).toBe(false)
    expect(result.mismatches).toHaveLength(1)
    expect(result.mismatches[0]).toContain('findings_hash')
  })
})

describe('generateRequestId', () => {
  it('generates unique IDs', () => {
    const ids = new Set<string>()
    for (let i = 0; i < 100; i++) {
      ids.add(generateRequestId())
    }
    expect(ids.size).toBe(100)
  })

  it('starts with req- prefix', () => {
    const id = generateRequestId()
    expect(id).toMatch(/^req-/)
  })
})
